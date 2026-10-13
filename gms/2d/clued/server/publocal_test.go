package main

import (
	"encoding/json"
	"testing"
)

func TestPublicRoomLocal(t *testing.T) {
	resetLimits()
	clearRooms()
	mk := func(title string, local any) {
		spec := map[string]any{"rounds": []any{map[string]any{"format": "mc", "packs": "all"}}}
		if local != nil {
			spec["local"] = local
		}
		r := call(t, "POST", "/rooms", map[string]any{"hostName": "Pub", "title": title, "questions": questions(2), "public": true, "spec": spec})
		if r.code != 200 {
			t.Fatalf("%s: %v", title, r.body)
		}
	}
	mk("Japan", map[string]any{"cc": "JPN", "level": "most", "live": false})
	mk("Off", map[string]any{"cc": "AUS", "level": "off"})
	mk("Plain", nil)
	mk("Bad", map[string]any{"cc": "<b>x", "level": "all"})
	resetPublicCache()
	got := map[string]any{}
	for _, r := range publicRooms(t) {
		got[r["title"].(string)] = r["local"]
	}
	if l, ok := got["Japan"].(map[string]any); !ok || l["cc"] != "JPN" || l["level"] != "most" || len(l) != 2 {
		t.Fatalf("Japan focus row: %v", got["Japan"])
	}
	for _, k := range []string{"Off", "Plain", "Bad"} {
		if got[k] != nil {
			t.Fatalf("%s must have no local field: %v", k, got[k])
		}
	}
	for _, c := range []struct {
		in   string
		want *pubLocal
	}{
		{`{"local":{"cc":"GBR","level":"all"}}`, &pubLocal{"GBR", "all"}},
		{`{"local":{"cc":"gbr","level":"all"}}`, nil},
		{`{"local":{"cc":"GBRX","level":"more"}}`, nil},
		{`{"local":{"cc":"GBR","level":"lots"}}`, nil},
		{`{"local":"JPN"}`, nil},
		{`not json`, nil},
	} {
		l := specLocal(json.RawMessage(c.in))
		if (l == nil) != (c.want == nil) || (l != nil && *l != *c.want) {
			t.Fatalf("specLocal(%s) = %v, want %v", c.in, l, c.want)
		}
	}
}
