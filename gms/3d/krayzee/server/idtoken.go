package main

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Copied from RAGDOJO (gms/2d/ragdojo/server/idtoken.go), which copied the payment service.
// Firebase ID tokens are verified locally with Google's public signing certificates, so the
// service needs no Google credentials (Aaron's org forbids service-account keys). Trade-off:
// no revocation check. A token stays valid until it expires (Firebase issues 1-hour tokens),
// so a disabled or signed-out account keeps API access for at most that hour.
const firebaseCertsURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type identity struct {
	UID       string
	Anonymous bool
}

type tokenVerifier struct {
	project, certsURL string
	http              *http.Client
	now               func() time.Time
	mu                sync.Mutex
	keys              map[string]*rsa.PublicKey
	expires, fetched  time.Time
	retryAt           time.Time     // after a failed fetch, the next one waits until then
	inflight          chan struct{} // closed when the running fetch ends; nil = none running
}

func newTokenVerifier(project string) *tokenVerifier {
	return &tokenVerifier{project: project, certsURL: firebaseCertsURL, http: &http.Client{Timeout: 10 * time.Second}, now: time.Now}
}

// key is stale-while-revalidate: expired keys keep verifying while ONE background fetch (never
// under the lock) replaces them; a failed fetch keeps the old keys and retries a minute later.
// Only a caller with no usable key (first start, or a rotated kid) waits for the fetch.
func (v *tokenVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	now := v.now()
	k, ok := v.keys[kid]
	stale := v.keys == nil || now.After(v.expires)
	rotated := !ok && v.keys != nil && now.Sub(v.fetched) > time.Minute
	if (stale || rotated) && !now.Before(v.retryAt) {
		v.startRefresh(now)
	}
	if ok {
		v.mu.Unlock()
		return k, nil
	}
	wait := v.inflight
	v.mu.Unlock()
	if wait == nil {
		if v.keys == nil {
			return nil, errors.New("signing keys unavailable")
		}
		return nil, errors.New("unknown signing key")
	}
	select {
	case <-wait:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	v.mu.Lock()
	k, ok = v.keys[kid]
	none := v.keys == nil
	v.mu.Unlock()
	if !ok {
		if none {
			return nil, errors.New("signing keys unavailable")
		}
		return nil, errors.New("unknown signing key")
	}
	return k, nil
}

// startRefresh runs under v.mu; the fetch itself does not.
func (v *tokenVerifier) startRefresh(now time.Time) {
	if v.inflight != nil {
		return
	}
	done := make(chan struct{})
	v.inflight, v.fetched = done, now
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), v.http.Timeout+time.Second)
		keys, maxAge, err := v.fetch(ctx)
		cancel()
		v.mu.Lock()
		at := v.now()
		if err == nil {
			v.keys, v.expires, v.retryAt = keys, at.Add(max(maxAge, time.Minute)), time.Time{}
		} else {
			v.retryAt = at.Add(time.Minute)
		}
		v.inflight = nil
		close(done)
		v.mu.Unlock()
	}()
}

func (v *tokenVerifier) fetch(ctx context.Context) (map[string]*rsa.PublicKey, time.Duration, error) {
	req, e := http.NewRequestWithContext(ctx, "GET", v.certsURL, nil)
	if e != nil {
		return nil, 0, e
	}
	res, e := v.http.Do(req)
	if e != nil {
		return nil, 0, errors.New("signing keys unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, 0, errors.New("signing keys unavailable")
	}
	var certs map[string]string
	if e := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&certs); e != nil {
		return nil, 0, e
	}
	keys := map[string]*rsa.PublicKey{}
	for kid, p := range certs {
		block, _ := pem.Decode([]byte(p))
		if block == nil {
			continue
		}
		cert, e := x509.ParseCertificate(block.Bytes)
		if e != nil {
			continue
		}
		if pk, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			keys[kid] = pk
		}
	}
	if len(keys) == 0 {
		return nil, 0, errors.New("no signing keys")
	}
	maxAge := time.Hour
	for _, part := range strings.Split(res.Header.Get("Cache-Control"), ",") {
		if n, ok := strings.CutPrefix(strings.TrimSpace(part), "max-age="); ok {
			if s, e := strconv.Atoi(n); e == nil && s > 0 {
				maxAge = time.Duration(s) * time.Second
			}
		}
	}
	return keys, maxAge, nil
}

func b64(s string, out any) error {
	raw, e := base64.RawURLEncoding.DecodeString(s)
	if e != nil {
		return e
	}
	if b, ok := out.(*[]byte); ok {
		*b = raw
		return nil
	}
	return json.Unmarshal(raw, out)
}

func (v *tokenVerifier) verify(ctx context.Context, raw string) (identity, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 || len(raw) > 8192 {
		return identity{}, errors.New("malformed token")
	}
	var head struct {
		Alg, Kid string
	}
	if e := b64(parts[0], &head); e != nil || head.Alg != "RS256" || head.Kid == "" {
		return identity{}, errors.New("bad token header")
	}
	var sig []byte
	if e := b64(parts[2], &sig); e != nil {
		return identity{}, errors.New("bad signature encoding")
	}
	k, e := v.key(ctx, head.Kid)
	if e != nil {
		return identity{}, e
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(k, crypto.SHA256, sum[:], sig) != nil {
		return identity{}, errors.New("bad signature")
	}
	var c struct {
		Aud      string `json:"aud"`
		Iss      string `json:"iss"`
		Sub      string `json:"sub"`
		Exp      int64  `json:"exp"`
		Iat      int64  `json:"iat"`
		AuthTime int64  `json:"auth_time"`
		Firebase struct {
			Provider string `json:"sign_in_provider"`
		} `json:"firebase"`
	}
	if e := b64(parts[1], &c); e != nil {
		return identity{}, errors.New("bad claims")
	}
	now, skew := v.now().Unix(), int64(60)
	switch {
	case c.Aud != v.project:
		return identity{}, errors.New("wrong audience")
	case c.Iss != "https://securetoken.google.com/"+v.project:
		return identity{}, errors.New("wrong issuer")
	case c.Exp <= now:
		return identity{}, errors.New("expired")
	case c.Iat <= 0 || c.Iat > now+skew || c.AuthTime <= 0 || c.AuthTime > now+skew:
		return identity{}, errors.New("bad issue time")
	case c.Sub == "" || len(c.Sub) > 128:
		return identity{}, errors.New("bad subject")
	case c.Firebase.Provider == "":
		return identity{}, errors.New("missing sign-in provider")
	}
	return identity{UID: c.Sub, Anonymous: c.Firebase.Provider == "anonymous"}, nil
}
