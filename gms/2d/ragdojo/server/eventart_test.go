package main

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A 1000x600 picture whose 25 squares are 25 different flat colours, so a tile proves which
// square it was cut from.
func cellColour(c int) color.RGBA { return color.RGBA{uint8(20 + c*9), uint8(240 - c*8), uint8(c * 37 % 256), 255} }

func writeTestArt(t *testing.T, dir, ev string) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1000, 600))
	for y := 0; y < 600; y++ { // painted independently of tileRect, so a wrong cut shows
		for x := 0; x < 1000; x++ {
			img.Set(x, y, cellColour(y/120*5+x/200))
		}
	}
	var buf bytes.Buffer
	jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	os.MkdirAll(dir, 0o755)
	if err := os.WriteFile(filepath.Join(dir, reArtSlug.ReplaceAllString(ev, "-")+".jpg"), buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}

func getImage(t *testing.T, url, tok string) (int, image.Image) {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 {
		return res.StatusCode, nil
	}
	img, err := jpeg.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatalf("not a jpeg: %v", err)
	}
	return 200, img
}

func near(a, b color.Color) bool {
	r1, g1, b1, _ := a.RGBA()
	r2, g2, b2, _ := b.RGBA()
	d := func(x, y uint32) bool { return int(x>>8)-int(y>>8) < 12 && int(y>>8)-int(x>>8) < 12 }
	return d(r1, r2) && d(g1, g2) && d(b1, b2)
}

// Art is served square by square, only for squares the CALLER has opened on the server.
func TestEventsArtTilesOnlyForOpenedSquares(t *testing.T) {
	r := newEvRig(t)
	dir := t.TempDir()
	t.Setenv("ARENA_EVENT_ART", dir)
	old := evArt
	evArt = &artBook{}
	t.Cleanup(func() { evArt = old })
	const rw = "reveal-week:2026-W42"
	writeTestArt(t, dir, rw)
	base := r.srv.URL + prefix + "/events/art/"
	tile := func(uid string, c int) (int, image.Image) {
		return getImage(t, fmt.Sprintf("%stile?event=%s&cell=%d", base, rw, c), "dev:"+uid)
	}

	if code, _ := getImage(t, base+"tile?event="+rw+"&cell=3", ""); code != 401 {
		t.Fatalf("no token: %d", code)
	}
	if code, _ := tile("me", 3); code != 403 {
		t.Fatalf("a player with no state got a tile: %d", code)
	}
	var b [][]any
	for i := 0; i < 6; i++ {
		b = append(b, camp(fmt.Sprintf("a%d", i), 1, r.now.Add(time.Duration(i)*2*time.Minute-2*time.Hour)))
	}
	if code, out := r.sync(t, "me", map[string]any{"event": rw, "b": b, "open": []int{3, 17}}); code != 200 || fmt.Sprint(out["open"]) != "[3 17]" {
		t.Fatalf("open: %d %v", code, out["open"])
	}
	for _, c := range []int{3, 17} {
		code, img := tile("me", c)
		if code != 200 {
			t.Fatalf("opened square %d: %d", c, code)
		}
		if img.Bounds().Dx() != 200 || img.Bounds().Dy() != 120 {
			t.Fatalf("tile %d is %v, want 200x120", c, img.Bounds())
		}
		mid := img.Bounds().Min.Add(image.Pt(img.Bounds().Dx()/2, img.Bounds().Dy()/2))
		if !near(img.At(mid.X, mid.Y), cellColour(c)) {
			t.Fatalf("tile %d was cut from the wrong square: %v want %v", c, img.At(mid.X, mid.Y), cellColour(c))
		}
	}
	for _, c := range []int{0, 4, 16, 18, 24} {
		if code, _ := tile("me", c); code != 403 {
			t.Fatalf("unopened square %d served: %d", c, code)
		}
	}
	if code, _ := tile("someone", 3); code != 403 {
		t.Fatalf("another player's opened square served: %d", code)
	}
	if code, _ := tile("me", 25); code != 400 {
		t.Fatalf("cell 25: %d", code)
	}
	if code, _ := getImage(t, base+"full?event="+rw, "dev:me"); code != 403 {
		t.Fatalf("whole picture with 2 open: %d", code)
	}
	// A right guess does not unlock the whole picture: only 25 open squares do.
	os.WriteFile(evAnswers.path, []byte(`{"answers":{"`+rw+`":"A TEST ANSWER"}}`), 0o600)
	r.tick(time.Second)
	if code, g := call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:me", map[string]any{"event": rw, "pic": "art", "choice": "A TEST ANSWER"}); code != 200 || g["solved"] != true {
		t.Fatalf("guess: %d %v", code, g)
	}
	if code, _ := getImage(t, base+"full?event="+rw, "dev:me"); code != 403 {
		t.Fatalf("whole picture after solving with 2 open: %d", code)
	}
	all := []int{}
	for c := 0; c < cells; c++ {
		all = append(all, c)
	}
	for i := 0; i < 7; i++ { // the campaign cap is 10 a day: the rest are agreed arena wins
		r.h.st.recordMatch(fmt.Sprintf("art%d", i), "duel", false, "2-0", []seatRow{rseat("me", "Me", true, 2), rseat(fmt.Sprintf("x%d", i), "X", false, 0)})
	}
	if code, out := r.sync(t, "me", map[string]any{"event": rw, "open": all}); code != 200 || len(out["open"].([]any)) != 25 {
		t.Fatalf("a solved picture keeps opening to 25: %d %v", code, out["open"])
	}
	code, full := getImage(t, base+"full?event="+rw, "dev:me")
	if code != 200 || full.Bounds().Dx() != 1000 || !near(full.At(990, 590), cellColour(24)) {
		t.Fatalf("whole picture at 25: %d", code)
	}
	// No art file for an event: 404, never the placeholder or another event's picture.
	if code, _ := getImage(t, base+"tile?event=reveal-week:2026-W43&cell=0", "dev:me"); code != 404 {
		t.Fatalf("event without art: %d", code)
	}
	// Pass events need the Pass for their art too.
	writeTestArt(t, dir, "reveal-month:2026-10")
	if code, _ := getImage(t, base+"tile?event=reveal-month:2026-10&cell=0", "dev:me"); code != 403 {
		t.Fatalf("pass art without a pass: %d", code)
	}
}
