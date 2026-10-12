package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInternalStats(t *testing.T) {
	code, _ := createRoom(t, "StatsHostZed", 2)
	join(t, code, "StatsGuestQuin")
	res, err := http.Get(ts.URL + "/internal/stats")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("loopback stats: %v %v", err, res)
	}
	raw, _ := io.ReadAll(res.Body)
	res.Body.Close()
	for _, leak := range []string{code, "StatsHostZed", "StatsGuestQuin"} {
		if strings.Contains(string(raw), leak) {
			t.Fatalf("stats leak %q", leak)
		}
	}
	var st struct {
		App    string         `json:"app"`
		Online int            `json:"online"`
		Live   map[string]int `json:"live"`
		Days   []struct {
			Day   string           `json:"day"`
			Stats map[string]int64 `json:"stats"`
		} `json:"days"`
	}
	json.Unmarshal(raw, &st)
	if st.App != "clued" || st.Online < 2 || st.Live["rooms"] < 1 || st.Online != st.Live["players"] || len(st.Days) != 14 {
		t.Fatalf("stats %s", raw)
	}

	for name, hdr := range map[string][2]string{
		"proxied":   {"X-Forwarded-For", "203.0.113.9"},
		"fwdhost":   {"X-Forwarded-Host", "games.br8t.com"},
		"forwarded": {"Forwarded", "for=203.0.113.9"},
		"origin":    {"Origin", "https://evil.example"},
	} {
		req, _ := http.NewRequest("GET", ts.URL+"/internal/stats", nil)
		req.Header.Set(hdr[0], hdr[1])
		res, _ := http.DefaultClient.Do(req)
		res.Body.Close()
		if res.StatusCode == 200 {
			t.Fatalf("%s request served stats", name)
		}
	}
	r := httptest.NewRequest("GET", "/internal/stats", nil)
	r.RemoteAddr = "203.0.113.9:1234"
	w := httptest.NewRecorder()
	routes().ServeHTTP(w, r)
	if w.Code == 200 {
		t.Fatal("remote caller served stats")
	}
	// The public prefix Caddy proxies never reaches it.
	for _, p := range []string{"/gms/2d/clued/api/internal/stats", "/gms/2d/clued/internal/stats", "/api/internal/stats"} {
		res, _ := http.Get(ts.URL + p)
		res.Body.Close()
		if res.StatusCode == 200 {
			t.Fatalf("%s served", p)
		}
	}
}
