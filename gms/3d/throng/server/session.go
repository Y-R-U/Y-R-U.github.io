package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Sess is one websocket connection.
type Sess struct {
	c      *websocket.Conn
	send   chan frame
	m      *Member
	ip     string
	once   sync.Once
	done   chan struct{}
	text   tokenBucket
	bin    tokenBucket
	drops  int
	dropAt int64
	warnAt int64
	code   websocket.StatusCode // close code seen from the peer (1000/1001 = goodbye)
	ver    string
}

type frame struct {
	bin  bool
	data []byte
}

const (
	sendBuf      = 256
	helloTimeout = 10 * time.Second
	pingEvery    = 20 * time.Second
	writeTimeout = 10 * time.Second
	maxText      = 6144
	maxHostBin   = 24 << 10 // a full keyframe is ~7.5 KB
	maxDrops     = 600      // rate-limited messages per minute before the socket is closed
)

// Message rates per socket: JSON control traffic is rare; binary is inputs (guests, ~20/s) or
// snapshots (host, 15/s plus a keyframe every 8 s).
var (
	textRate  = rateSpec{perSec: 8, burst: 20}
	guestRate = rateSpec{perSec: 30, burst: 45}
	hostRate  = rateSpec{perSec: 40, burst: 80}
)

type rateSpec struct{ perSec, burst float64 }

type tokenBucket struct {
	tokens float64
	last   time.Time
}

func (b *tokenBucket) allow(r rateSpec) bool {
	if cfg.NoRate {
		return true
	}
	now := time.Now()
	if b.last.IsZero() {
		b.tokens = r.burst
	} else {
		b.tokens = min(r.burst, b.tokens+now.Sub(b.last).Seconds()*r.perSec)
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (s *Sess) sendFrame(f frame) {
	select {
	case <-s.done:
	case s.send <- f:
	default:
		s.close(websocket.StatusPolicyViolation, "too slow")
	}
}

func (s *Sess) push(v any)       { s.sendFrame(frame{data: encode(v)}) }
func (s *Sess) sendBin(b []byte) { s.sendFrame(frame{bin: true, data: b}) }

func (s *Sess) close(code websocket.StatusCode, why string) {
	s.once.Do(func() {
		close(s.done)
		go s.c.Close(code, why)
	})
}

func (s *Sess) reply(id int64, kv ...any) {
	m := ev("ok", kv...)
	m["id"] = id
	s.push(m)
}

func (s *Sess) fail(id int64, code, msg string) {
	s.push(map[string]any{"t": "error", "id": id, "code": code, "error": msg})
}

// limited counts a dropped message, tells the client at most once a second and closes a flooder.
func (s *Sess) limited(id int64) {
	now := nowMs()
	if now-s.dropAt > 60000 {
		s.drops, s.dropAt = 0, now
	}
	s.drops++
	if s.drops > maxDrops {
		s.close(4008, "rate limit")
		return
	}
	if now-s.warnAt > 1000 {
		s.warnAt = now
		s.fail(id, "rate_limited", "slow down")
	}
}

func (s *Sess) writer() {
	for {
		select {
		case <-s.done:
			return
		case f := <-s.send:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			typ := websocket.MessageText
			if f.bin {
				typ = websocket.MessageBinary
			}
			err := s.c.Write(ctx, typ, f.data)
			cancel()
			if err != nil {
				s.close(websocket.StatusGoingAway, "write failed")
				return
			}
		}
	}
}

func (s *Sess) pinger() {
	t := time.NewTicker(pingEvery)
	defer t.Stop()
	for {
		select {
		case <-s.done:
			return
		case <-t.C:
		}
		ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
		err := s.c.Ping(ctx)
		cancel()
		if err != nil {
			s.close(websocket.StatusGoingAway, "ping failed")
			return
		}
	}
}

type inMsg struct {
	T     string          `json:"t"`
	ID    int64           `json:"id"`
	V     int             `json:"v"`
	Sim   string          `json:"sim"`
	Map   string          `json:"map"`
	Dev   string          `json:"dev"`
	CID   string          `json:"cid"`
	Name  string          `json:"name"`
	Code  string          `json:"code"`
	On    bool            `json:"on"`
	C     float64         `json:"c"`
	Meta  json.RawMessage `json:"meta"`
	Who   string          `json:"who"`
	Crowd *int            `json:"crowd"`
	MID   string          `json:"mid"`
	Rows  []ResultRow     `json:"rows"`
	Cos   json.RawMessage `json:"cos"`
	Mode  string          `json:"mode"`
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !hit("ws", ip) {
		rateLimited(w)
		return
	}
	hub.mu.Lock()
	full := hub.conns >= cfg.MaxConns || hub.perIP[ip] >= cfg.MaxConnsPerIP
	if !full {
		hub.conns++
		hub.perIP[ip]++
	}
	hub.mu.Unlock()
	if full {
		writeErr(w, 503, "busy", "too many connections")
		return
	}
	defer func() {
		hub.mu.Lock()
		hub.conns--
		if hub.perIP[ip]--; hub.perIP[ip] <= 0 {
			delete(hub.perIP, ip)
		}
		hub.mu.Unlock()
	}()
	rc := http.NewResponseController(w)
	rc.SetReadDeadline(time.Time{})
	rc.SetWriteDeadline(time.Time{})
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: cfg.OriginHosts, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	c.SetReadLimit(maxHostBin)
	s := &Sess{c: c, send: make(chan frame, sendBuf), ip: ip, done: make(chan struct{})}
	go s.writer()
	defer s.close(websocket.StatusNormalClosure, "")

	ctx := r.Context()
	hctx, cancel := context.WithTimeout(ctx, helloTimeout)
	typ, b, err := c.Read(hctx)
	cancel()
	var m inMsg
	if err != nil || typ != websocket.MessageText || len(b) > maxText || json.Unmarshal(b, &m) != nil || m.T != "hello" {
		s.close(websocket.StatusPolicyViolation, "hello first")
		return
	}
	if m.V < minProtocol || m.V > protocolVersion {
		s.push(map[string]any{"t": "error", "id": m.ID, "code": "old_client", "v": protocolVersion,
			"error": "THRONG has been updated. Reload the page to play online."})
		time.Sleep(150 * time.Millisecond)
		s.close(4002, "protocol")
		return
	}
	if !hub.attach(s, m) {
		time.Sleep(150 * time.Millisecond)
		s.close(4001, "bad hello")
		return
	}
	defer hub.detach(s)
	go s.pinger()

	for {
		typ, b, err := c.Read(ctx)
		if err != nil {
			if cs := websocket.CloseStatus(err); cs != -1 {
				s.code = cs
			}
			if strings.Contains(err.Error(), "read limited") {
				s.close(websocket.StatusMessageTooBig, "message too big")
			}
			return
		}
		select {
		case <-s.done:
			return
		default:
		}
		if typ == websocket.MessageBinary {
			hub.binary(s, b)
			continue
		}
		var m inMsg
		if len(b) > maxText {
			s.close(websocket.StatusMessageTooBig, "message too big")
			return
		}
		if !s.text.allow(textRate) {
			s.limited(0)
			continue
		}
		if json.Unmarshal(b, &m) != nil {
			s.fail(0, "bad_request", "bad message")
			continue
		}
		hub.dispatch(s, m)
	}
}
