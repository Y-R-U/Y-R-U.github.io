// krayzeenet — PROTOTYPE room server for The Kingdom of Krayzee. Local only.
//
// Same shape as snakenet (gms/pwa/snake/server): the server never flies a
// plane. It keeps the room list, the join line (members[0] hosts and runs ATC +
// AI traffic in its browser), the room options, the voice claims, and relays
// game traffic between room members. See docs/ONLINE.md.
//
//	KRAYZEE_ADDR      listen address          (default 127.0.0.1:8018)
//	KRAYZEE_PREFIX    URL prefix behind Caddy (default /gms/3d/krayzee/net)
//	KRAYZEE_GRACE_MS  dropped-socket grace    (default 10000)
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

var origins = []string{
	"games.br8t.com", "yru.br8t.com", "y-r-u.github.io",
	"localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*",
}

func main() {
	addr := env("KRAYZEE_ADDR", "127.0.0.1:8018")
	prefix := strings.TrimRight(env("KRAYZEE_PREFIX", "/gms/3d/krayzee/net"), "/")
	grace, _ := strconv.Atoi(env("KRAYZEE_GRACE_MS", "10000"))

	h := newHub(time.Duration(grace) * time.Millisecond)
	go h.run()

	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	})
	mux.HandleFunc(prefix+"/ws", h.serveWS)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("krayzeenet (prototype) on %s%s", addr, prefix)
	log.Fatal(srv.ListenAndServe())
}
