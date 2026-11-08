package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Sess is one websocket connection. A user may have several (tabs, devices).
type Sess struct {
	c      *websocket.Conn
	send   chan []byte
	u      *User
	ip     string
	lobby  bool
	once   sync.Once
	done   chan struct{}
	tokens float64
	last   time.Time
}

const (
	sendBuf      = 128
	helloTimeout = 10 * time.Second
	pingEvery    = 20 * time.Second
	writeTimeout = 10 * time.Second
	msgBurst     = 40
	msgPerSec    = 12 // a host relays shots for up to 7 AI seats
)

func (s *Sess) sendRaw(b []byte) {
	select {
	case s.send <- b:
	default:
		s.close(websocket.StatusPolicyViolation, "too slow") // a client that can't keep up is dropped
	}
}

func (s *Sess) push(v any) { s.sendRaw(encode(v)) }

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

func (s *Sess) fail(id int64, code, msg string, kv ...any) {
	m := ev("error", kv...)
	m["id"], m["code"], m["error"] = id, code, msg
	s.push(m)
}

// allowMsg is a token bucket per connection.
func (s *Sess) allowMsg() bool {
	now := time.Now()
	if !s.last.IsZero() {
		s.tokens = min(msgBurst, s.tokens+now.Sub(s.last).Seconds()*msgPerSec)
	}
	s.last = now
	if s.tokens < 1 {
		return false
	}
	s.tokens--
	return true
}

func (s *Sess) writer() {
	for {
		select {
		case <-s.done:
			return
		case b := <-s.send:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := s.c.Write(ctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				s.close(websocket.StatusGoingAway, "write failed")
				return
			}
		}
	}
}

// pinger keeps the connection alive (on its own goroutine: Ping blocks until the pong).
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
	T      string     `json:"t"`
	ID     int64      `json:"id"`
	Token  string     `json:"token"`
	Name   string     `json:"name"`
	On     *bool      `json:"on"`
	Code   string     `json:"code"`
	Opts   *RoomOpts  `json:"opts"`
	Seat   *int       `json:"seat"`
	Hole   *int       `json:"hole"`
	N      *int       `json:"n"`
	VX     float64    `json:"vx"`
	VZ     float64    `json:"vz"`
	T0     float64    `json:"t0"`
	Aim    float64    `json:"aim"`
	Power  float64    `json:"power"`
	Mods   Mods       `json:"mods"`
	Ball   *BallState `json:"ball"`
	State  string     `json:"state"`
	To     []float64  `json:"to"`
	Balls  []BallRef  `json:"balls"`
	Knocks []Knock    `json:"knocks"`
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
	// Long-lived: lift the server's read/write deadlines for this connection.
	rc := http.NewResponseController(w)
	rc.SetReadDeadline(time.Time{})
	rc.SetWriteDeadline(time.Time{})
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: cfg.OriginHosts, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	c.SetReadLimit(int64(cfg.MaxMsg))
	s := &Sess{c: c, send: make(chan []byte, sendBuf), ip: ip, done: make(chan struct{}), tokens: msgBurst}
	go s.writer()
	defer s.close(websocket.StatusNormalClosure, "")

	ctx := r.Context()
	hctx, cancel := context.WithTimeout(ctx, helloTimeout)
	m, err := readMsg(hctx, c)
	cancel()
	if err != nil || m.T != "hello" {
		s.close(websocket.StatusPolicyViolation, "hello first")
		return
	}
	id, err := verifyToken(m.Token)
	if err != nil {
		s.fail(m.ID, "bad_token", "could not verify your sign-in, reload and try again")
		time.Sleep(200 * time.Millisecond) // let the error reach the client
		s.close(4001, "bad token")
		return
	}
	hub.attach(s, id, m)
	defer hub.detach(s)
	go s.pinger()

	for {
		m, err := readMsg(ctx, c)
		if err != nil {
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
		if !s.allowMsg() {
			s.fail(m.ID, "rate_limited", "slow down")
			continue
		}
		hub.dispatch(s, m)
	}
}

func readMsg(ctx context.Context, c *websocket.Conn) (inMsg, error) {
	var m inMsg
	typ, b, err := c.Read(ctx)
	if err != nil {
		return m, err
	}
	if typ != websocket.MessageText {
		return m, errors.New("binary message")
	}
	if err := json.Unmarshal(b, &m); err != nil {
		m.T = "bad"
	}
	return m, nil
}
