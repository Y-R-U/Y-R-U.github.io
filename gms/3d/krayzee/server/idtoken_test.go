// Copied from RAGDOJO (gms/2d/ragdojo/server/idtoken_test.go).
package main

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type tokenFixture struct {
	v       *tokenVerifier
	key     *rsa.PrivateKey
	fetches atomic.Int32
	now     time.Time
}

func certPEM(t *testing.T, k *rsa.PrivateKey) string {
	tpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "securetoken"}, NotBefore: time.Unix(0, 0), NotAfter: time.Unix(4_000_000_000, 0)}
	der, e := x509.CreateCertificate(rand.Reader, tpl, tpl, &k.PublicKey, k)
	if e != nil {
		t.Fatal(e)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func newTokenFixture(t *testing.T) *tokenFixture {
	f := &tokenFixture{now: time.Unix(1_800_000_000, 0)}
	var e error
	if f.key, e = rsa.GenerateKey(rand.Reader, 2048); e != nil {
		t.Fatal(e)
	}
	certs := map[string]string{"kid1": certPEM(t, f.key)}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.fetches.Add(1)
		w.Header().Set("Cache-Control", "public, max-age=3600, must-revalidate")
		json.NewEncoder(w).Encode(certs)
	}))
	t.Cleanup(srv.Close)
	f.v = newTokenVerifier("br8t-games")
	f.v.certsURL = srv.URL
	f.v.now = func() time.Time { return f.now }
	return f
}

func (f *tokenFixture) sign(t *testing.T, kid string, key *rsa.PrivateKey, mut func(h, c map[string]any)) string {
	h := map[string]any{"alg": "RS256", "kid": kid, "typ": "JWT"}
	now := f.now.Unix()
	c := map[string]any{"aud": "br8t-games", "iss": "https://securetoken.google.com/br8t-games", "sub": "uid_alice", "iat": now - 10, "auth_time": now - 100, "exp": now + 3500, "firebase": map[string]any{"sign_in_provider": "google.com"}}
	if mut != nil {
		mut(h, c)
	}
	enc := func(v any) string { b, _ := json.Marshal(v); return base64.RawURLEncoding.EncodeToString(b) }
	in := enc(h) + "." + enc(c)
	sum := sha256.Sum256([]byte(in))
	sig, e := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if e != nil {
		t.Fatal(e)
	}
	return in + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func TestIDTokenValid(t *testing.T) {
	f := newTokenFixture(t)
	id, e := f.v.verify(context.Background(), f.sign(t, "kid1", f.key, nil))
	if e != nil || id.UID != "uid_alice" || id.Anonymous {
		t.Fatal(id, e)
	}
	// Certificates are cached per Cache-Control, then refetched after max-age.
	f.v.verify(context.Background(), f.sign(t, "kid1", f.key, nil))
	if f.fetches.Load() != 1 {
		t.Fatal("certs refetched inside max-age", f.fetches.Load())
	}
	f.now = f.now.Add(2 * time.Hour)
	if _, e := f.v.verify(context.Background(), f.sign(t, "kid1", f.key, nil)); e != nil {
		t.Fatal("expired cache must still verify while it refreshes", e)
	}
	for i := 0; i < 100 && f.fetches.Load() != 2; i++ {
		time.Sleep(10 * time.Millisecond)
	}
	if f.fetches.Load() != 2 {
		t.Fatal("certs not refreshed after max-age", f.fetches.Load())
	}
}

func TestIDTokenRejections(t *testing.T) {
	f := newTokenFixture(t)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	cases := map[string]string{
		"wrong aud":      f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["aud"] = "other-project" }),
		"wrong iss":      f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["iss"] = "https://securetoken.google.com/other-project" }),
		"expired":        f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["exp"] = f.now.Unix() - 1 }),
		"future iat":     f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["iat"] = f.now.Unix() + 3600 }),
		"future auth":    f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["auth_time"] = f.now.Unix() + 3600 }),
		"empty sub":      f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["sub"] = "" }),
		"no provider":    f.sign(t, "kid1", f.key, func(_, c map[string]any) { delete(c, "firebase") }),
		"bad signature":  f.sign(t, "kid1", other, nil),
		"unknown kid":    f.sign(t, "kid9", f.key, nil),
		"alg none":       f.sign(t, "kid1", f.key, func(h, _ map[string]any) { h["alg"] = "none" }),
		"alg HS256":      f.sign(t, "kid1", f.key, func(h, _ map[string]any) { h["alg"] = "HS256" }),
		"malformed":      "abc.def",
		"tampered claim": strings.Replace(f.sign(t, "kid1", f.key, nil), ".", ".x", 1),
	}
	for name, tok := range cases {
		if id, e := f.v.verify(context.Background(), tok); e == nil {
			t.Errorf("%s accepted: %+v", name, id)
		}
	}
	// An anonymous token verifies but is marked anonymous; the API then refuses it.
	id, e := f.v.verify(context.Background(), f.sign(t, "kid1", f.key, func(_, c map[string]any) { c["firebase"] = map[string]any{"sign_in_provider": "anonymous"} }))
	if e != nil || !id.Anonymous {
		t.Fatal("anonymous not flagged", id, e)
	}
}
