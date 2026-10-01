package main

import (
	"context"
	"net/http"
	"sync"
	"time"
)

// Upload bodies are buffered in memory (≤ 8 MB each), so the number in flight
// is what bounds RSS: a few globally, and one per user.
var (
	uploadSlots = make(chan struct{}, envInt("SYNTHWILD_UPLOAD_SLOTS", 4))
	readSlots   = make(chan struct{}, 4)
	userMu      sync.Mutex
	userBusy    = map[int64]bool{}
)

func acquire(ctx context.Context, sem chan struct{}, wait time.Duration) bool {
	select {
	case sem <- struct{}{}:
		return true
	default:
	}
	if wait <= 0 {
		return false
	}
	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case sem <- struct{}{}:
		return true
	case <-t.C:
	case <-ctx.Done():
	}
	return false
}

func release(sem chan struct{}) { <-sem }

func userSlot(id int64) bool {
	userMu.Lock()
	defer userMu.Unlock()
	if userBusy[id] {
		return false
	}
	userBusy[id] = true
	return true
}

func releaseUser(id int64) {
	userMu.Lock()
	delete(userBusy, id)
	userMu.Unlock()
}

func busy(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "5")
	writeErr(w, http.StatusServiceUnavailable, "busy", "the server is busy saving, try again in a moment")
}
