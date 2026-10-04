package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"sync"
	"time"
)

// Alerts are always logged and stored (the admin page lists them). Email and
// ntfy are sent only when configured, at most once per kind per hour.
var alerting struct {
	sync.Mutex
	last map[string]int64
}

var deliverHook func(kind, msg string) string // tests replace delivery

func recordEvent(kind, msg string) int64 {
	res, err := db.Exec(`INSERT INTO alerts(at, kind, msg) VALUES(?,?,?)`, nowMs(), kind, msg)
	if err != nil {
		return 0
	}
	id, _ := res.LastInsertId()
	return id
}

// alert returns true when this alert was sent (false = rate-limited).
func alert(kind, msg string) bool {
	now := nowMs()
	alerting.Lock()
	if alerting.last == nil {
		alerting.last = map[string]int64{}
		rows, err := db.Query(`SELECT kind, MAX(at) FROM alerts WHERE delivered != 'suppressed' GROUP BY kind`)
		if err == nil {
			for rows.Next() {
				var k string
				var at int64
				if rows.Scan(&k, &at) == nil {
					alerting.last[k] = at
				}
			}
			rows.Close()
		}
	}
	if now-alerting.last[kind] < time.Hour.Milliseconds() {
		alerting.Unlock()
		log.Printf("alert %s (rate-limited): %s", kind, msg)
		return false
	}
	alerting.last[kind] = now
	alerting.Unlock()
	log.Printf("ALERT %s: %s", kind, msg)
	id := recordEvent(kind, msg)
	deliver := deliverAlert
	if deliverHook != nil {
		deliver = deliverHook
	}
	go func() {
		via := deliver(kind, msg)
		db.Exec(`UPDATE alerts SET delivered = ? WHERE id = ?`, via, id)
	}()
	return true
}

func deliverAlert(kind, msg string) string {
	var via []string
	if cfg.SMTPHost != "" && cfg.AlertTo != "" {
		if err := sendMail("Clued alert: "+kind, msg); err != nil {
			log.Printf("alert email failed: %v", err)
			via = append(via, "email-failed")
		} else {
			via = append(via, "email")
		}
	}
	if cfg.NtfyTopic != "" {
		req, _ := http.NewRequest("POST", cfg.NtfyURL+"/"+cfg.NtfyTopic, strings.NewReader(msg))
		req.Header.Set("Title", "Clued: "+kind)
		req.Header.Set("Click", "https://games.br8t.com/gms/2d/clued/admin.html")
		if kind == "escalation" {
			req.Header.Set("Tags", "rotating_light")
			req.Header.Set("Priority", "high")
		} else {
			req.Header.Set("Tags", "warning")
			req.Header.Set("Priority", "default")
		}
		c := &http.Client{Timeout: 10 * time.Second}
		res, err := c.Do(req)
		if res != nil {
			res.Body.Close()
		}
		if err != nil || res.StatusCode >= 300 {
			log.Printf("ntfy push failed (status/err hidden to keep the topic out of logs)")
			via = append(via, "ntfy-failed")
		} else {
			via = append(via, "ntfy")
		}
	}
	if len(via) == 0 {
		return "log only"
	}
	return strings.Join(via, ",")
}

func sendMail(subject, body string) error {
	from := cfg.SMTPFrom
	msg := "From: Clued <" + from + ">\r\nTo: " + cfg.AlertTo + "\r\nSubject: " + subject +
		"\r\nDate: " + time.Now().Format(time.RFC1123Z) + "\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" +
		body + "\r\n\r\nAdmin: https://games.br8t.com/gms/2d/clued/admin.html\r\n"
	addr := net.JoinHostPort(cfg.SMTPHost, cfg.SMTPPort)
	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	if cfg.SMTPPort != "465" {
		return smtp.SendMail(addr, auth, from, []string{cfg.AlertTo}, []byte(msg)) // STARTTLS when offered
	}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 15 * time.Second}, "tcp", addr, &tls.Config{ServerName: cfg.SMTPHost})
	if err != nil {
		return err
	}
	c, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		return err
	}
	defer c.Close()
	if auth != nil {
		if err := c.Auth(auth); err != nil {
			return err
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	if err := c.Rcpt(cfg.AlertTo); err != nil {
		return err
	}
	wc, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := fmt.Fprint(wc, msg); err != nil {
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return c.Quit()
}
