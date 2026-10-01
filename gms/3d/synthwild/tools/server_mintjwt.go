// Test helper for server/test.sh: fakes Google's securetoken certs and mints
// Firebase-shaped ID tokens. Stdlib only, run with `go run`.
//
//	go run server_mintjwt.go keygen <dir>                       -> <dir>/key.pem, <dir>/certs.json
//	go run server_mintjwt.go mint <dir> [k=v ...]               -> token on stdout
//	  keys: email, verified (true|false), aud, iss, exp (+/-seconds from now), iat, kid, alg, badsig (1)
package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"strconv"
	"strings"
	"time"
)

func die(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func main() {
	if len(os.Args) < 3 {
		die(fmt.Errorf("usage: keygen <dir> | mint <dir> [k=v...]"))
	}
	dir := os.Args[2]
	switch os.Args[1] {
	case "keygen":
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			die(err)
		}
		tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "test"},
			NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour)}
		der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
		if err != nil {
			die(err)
		}
		cert := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
		j, _ := json.Marshal(map[string]string{"testkid": string(cert)})
		os.WriteFile(dir+"/certs.json", j, 0o600)
		os.WriteFile(dir+"/key.pem", pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}), 0o600)
	case "mint":
		raw, err := os.ReadFile(dir + "/key.pem")
		if err != nil {
			die(err)
		}
		blk, _ := pem.Decode(raw)
		key, err := x509.ParsePKCS1PrivateKey(blk.Bytes)
		if err != nil {
			die(err)
		}
		opt := map[string]string{"email": "aaron@br8t.com", "verified": "true", "aud": "br8t-games",
			"iss": "https://securetoken.google.com/br8t-games", "exp": "3600", "iat": "-10", "kid": "testkid", "alg": "RS256"}
		for _, a := range os.Args[3:] {
			k, v, _ := strings.Cut(a, "=")
			opt[k] = v
		}
		now := time.Now().Unix()
		exp, _ := strconv.ParseInt(opt["exp"], 10, 64)
		iat, _ := strconv.ParseInt(opt["iat"], 10, 64)
		enc := base64.RawURLEncoding
		h, _ := json.Marshal(map[string]string{"alg": opt["alg"], "kid": opt["kid"], "typ": "JWT"})
		p, _ := json.Marshal(map[string]any{"aud": opt["aud"], "iss": opt["iss"], "sub": "uid123",
			"exp": now + exp, "iat": now + iat, "auth_time": now + iat,
			"email": opt["email"], "email_verified": opt["verified"] == "true"})
		signing := enc.EncodeToString(h) + "." + enc.EncodeToString(p)
		sum := sha256.Sum256([]byte(signing))
		sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
		if err != nil {
			die(err)
		}
		if opt["badsig"] == "1" {
			sig[10] ^= 0xff
		}
		fmt.Print(signing + "." + enc.EncodeToString(sig))
	}
}
