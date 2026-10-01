package main

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Firebase ID tokens are RS256 JWTs signed by keys published as x509 certs.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
const (
	firebaseProject = "br8t-games"
	certsURL        = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
	clockSkew       = 5 * time.Minute
)

var certCache struct {
	sync.RWMutex
	keys       map[string]*rsa.PublicKey
	expires    time.Time
	lastForced time.Time
}

// fetchMu serialises fetches; it is never held by readers of a fresh cache.
var fetchMu sync.Mutex

const forcedRefetchEvery = time.Minute

func parseCerts(raw []byte) (map[string]*rsa.PublicKey, error) {
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	keys := map[string]*rsa.PublicKey{}
	for kid, p := range m {
		blk, _ := pem.Decode([]byte(p))
		if blk == nil {
			continue
		}
		cert, err := x509.ParseCertificate(blk.Bytes)
		if err != nil {
			continue
		}
		if k, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			keys[kid] = k
		}
	}
	if len(keys) == 0 {
		return nil, errors.New("no usable certs")
	}
	return keys, nil
}

func cachedKeys(force bool) (map[string]*rsa.PublicKey, bool) {
	certCache.RLock()
	defer certCache.RUnlock()
	if certCache.keys == nil {
		return nil, false
	}
	if force {
		return certCache.keys, time.Since(certCache.lastForced) < forcedRefetchEvery
	}
	return certCache.keys, time.Now().Before(certCache.expires)
}

// signingKeys returns Google's keys. force (an unknown kid) refetches at most
// once a minute; the network fetch runs without the cache lock held.
func signingKeys(force bool) (map[string]*rsa.PublicKey, error) {
	if keys, ok := cachedKeys(force); ok {
		return keys, nil
	}
	fetchMu.Lock()
	defer fetchMu.Unlock()
	if keys, ok := cachedKeys(force); ok {
		return keys, nil
	}
	keys, maxAge, err := fetchCerts()
	if err != nil {
		if old, _ := cachedKeys(false); old != nil && force {
			return old, nil
		}
		return nil, err
	}
	certCache.Lock()
	certCache.keys, certCache.expires = keys, time.Now().Add(maxAge)
	if force {
		certCache.lastForced = time.Now()
	}
	certCache.Unlock()
	return keys, nil
}

func fetchCerts() (map[string]*rsa.PublicKey, time.Duration, error) {
	log.Printf("fetching signing certs")
	if cfg.TestCerts != "" {
		raw, err := os.ReadFile(cfg.TestCerts)
		if err != nil {
			return nil, 0, err
		}
		keys, err := parseCerts(raw)
		return keys, time.Hour, err
	}
	c := &http.Client{Timeout: 10 * time.Second}
	resp, err := c.Get(certsURL)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
	if err != nil {
		return nil, 0, err
	}
	if resp.StatusCode != 200 {
		return nil, 0, fmt.Errorf("certs: HTTP %d", resp.StatusCode)
	}
	keys, err := parseCerts(raw)
	if err != nil {
		return nil, 0, err
	}
	maxAge := time.Hour
	for _, part := range strings.Split(resp.Header.Get("Cache-Control"), ",") {
		part = strings.TrimSpace(part)
		if v, ok := strings.CutPrefix(part, "max-age="); ok {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				maxAge = time.Duration(n) * time.Second
			}
		}
	}
	return keys, maxAge, nil
}

func b64seg(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// verifyFirebaseToken checks signature and claims and returns the verified,
// lower-cased email.
func verifyFirebaseToken(tok string) (string, error) {
	parts := strings.Split(tok, ".")
	if len(parts) != 3 || len(tok) > 8192 {
		return "", errors.New("malformed token")
	}
	hb, err := b64seg(parts[0])
	if err != nil {
		return "", errors.New("bad header")
	}
	var hdr struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if json.Unmarshal(hb, &hdr) != nil || hdr.Alg != "RS256" || hdr.Kid == "" {
		return "", errors.New("bad header")
	}
	keys, err := signingKeys(false)
	if err != nil {
		return "", fmt.Errorf("fetch certs: %w", err)
	}
	key := keys[hdr.Kid]
	if key == nil {
		// A key rotation can land before our cache expires.
		if keys, err = signingKeys(true); err == nil {
			key = keys[hdr.Kid]
		}
		if key == nil {
			return "", errors.New("unknown kid")
		}
	}
	sig, err := b64seg(parts[2])
	if err != nil {
		return "", errors.New("bad signature encoding")
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig); err != nil {
		return "", errors.New("bad signature")
	}
	pb, err := b64seg(parts[1])
	if err != nil {
		return "", errors.New("bad payload")
	}
	var c struct {
		Aud           string `json:"aud"`
		Iss           string `json:"iss"`
		Sub           string `json:"sub"`
		Exp           int64  `json:"exp"`
		Iat           int64  `json:"iat"`
		AuthTime      int64  `json:"auth_time"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if json.Unmarshal(pb, &c) != nil {
		return "", errors.New("bad payload")
	}
	now := time.Now()
	switch {
	case c.Aud != firebaseProject:
		return "", errors.New("wrong aud")
	case c.Iss != "https://securetoken.google.com/"+firebaseProject:
		return "", errors.New("wrong iss")
	case c.Sub == "" || len(c.Sub) > 128:
		return "", errors.New("bad sub")
	case now.After(time.Unix(c.Exp, 0)):
		return "", errors.New("expired")
	case time.Unix(c.Iat, 0).After(now.Add(clockSkew)):
		return "", errors.New("issued in the future")
	case c.AuthTime != 0 && time.Unix(c.AuthTime, 0).After(now.Add(clockSkew)):
		return "", errors.New("auth_time in the future")
	case !c.EmailVerified || c.Email == "":
		return "", errors.New("email not verified")
	}
	return strings.ToLower(c.Email), nil
}
