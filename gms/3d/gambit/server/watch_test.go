package main

import (
	"testing"
)

func TestWatchGame(t *testing.T) {
	resetWorld(t)
	alice := dial(t, "dev:wa:Alice", "")
	bob := dial(t, "dev:wb:Bob", "")
	sam := dial(t, "dev:ws:Sam", "")
	w, b, game := pair(t, alice, bob, "unlimited", true)
	playWire(t, w, b, game, "e2e4", "e7e5")

	list := sam.ok(map[string]any{"t": "watchList"})["games"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != game || list[0].(map[string]any)["plies"].(float64) != 2 {
		t.Fatalf("watch list %v", list)
	}
	w.fails(map[string]any{"t": "watch", "game": game}, "own_game")
	sam.fails(map[string]any{"t": "watch", "game": "nope"}, "no_game")
	v := sam.ok(map[string]any{"t": "watch", "game": game})["watch"].(map[string]any)
	if v["you"] != "" || len(v["moves"].([]any)) != 2 || v["watchers"].(float64) != 1 {
		t.Fatalf("watch view %v", v)
	}
	for _, c := range []*client{w, b} {
		if n := c.wait("watchers")["n"].(float64); n != 1 {
			t.Fatalf("players told %v watchers", n)
		}
	}
	// spectators get every move and the end
	w.ok(map[string]any{"t": "move", "game": game, "uci": "d1h5", "ply": 2})
	if mv := sam.take("spectated move", func(m map[string]any) bool { return m["t"] == "move" && m["uci"] == "d1h5" }); mv["ply"].(float64) != 2 {
		t.Fatalf("spectator move %v", mv)
	}
	b.ok(map[string]any{"t": "resign", "game": game})
	if end := sam.wait("end"); end["result"] != "1-0" || end["reason"] != "resign" {
		t.Fatalf("spectator end %v", end)
	}
	// unwatch / disconnect updates the count
	sam.ok(map[string]any{"t": "watch", "game": game, "on": false})
	if n := w.wait("watchers")["n"].(float64); n != 0 {
		t.Fatalf("after unwatch %v", n)
	}
	if len(sam.ok(map[string]any{"t": "watchList"})["games"].([]any)) != 0 {
		t.Fatal("ended game still listed")
	}
}

func TestWatchPrivateRoomUnlisted(t *testing.T) {
	resetWorld(t)
	host := dial(t, "dev:wh:Host", "")
	guest := dial(t, "dev:wg:Guest", "")
	sam := dial(t, "dev:ws2:Sam", "")
	code := host.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "rated": false, "public": false})["room"].(map[string]any)["code"].(string)
	guest.ok(map[string]any{"t": "joinRoom", "code": code})
	game := guest.wait("start")["game"].(map[string]any)["id"].(string)
	host.wait("start")
	if len(sam.ok(map[string]any{"t": "watchList"})["games"].([]any)) != 0 {
		t.Fatal("private game listed")
	}
	// ...but the link works
	sam.ok(map[string]any{"t": "watch", "game": game})
	sam.drop()
	if n := host.wait("watchers")["n"].(float64); n != 1 {
		t.Fatalf("watch count %v", n)
	}
	if n := host.wait("watchers")["n"].(float64); n != 0 {
		t.Fatalf("after disconnect %v", n)
	}
}
