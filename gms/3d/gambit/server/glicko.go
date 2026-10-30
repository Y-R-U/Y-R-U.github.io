package main

// Glicko-2 (Glickman, "Example of the Glicko-2 system", 2013). Chosen over Elo because the
// rating deviation gives a principled "provisional" flag, new players move fast and settle,
// and players who come back after a long gap (Unlimited games, casual players) are handled
// by RD growth instead of a fixed K. Each game is rated immediately as its own rating
// period (as lichess does); RD grows with idle time before each game.

import "math"

const (
	glickoScale   = 173.7178
	glickoTau     = 0.5
	defaultRating = 1500.0
	defaultRD     = 350.0
	defaultVol    = 0.06
	minRD         = 45.0
	provisionalRD = 110.0 // RD above this = provisional ("?" next to the rating)
	rdPeriodDays  = 7.0   // idle time that counts as one rating period for RD growth
)

type Rating struct {
	R, RD, Vol float64
	Updated    int64 // ms
}

func newRating() Rating { return Rating{R: defaultRating, RD: defaultRD, Vol: defaultVol} }

func (r Rating) Provisional() bool { return r.RD > provisionalRD }

type glickoResult struct {
	Opp   Rating
	Score float64 // 1 win, 0.5 draw, 0 loss
}

func g(phi float64) float64 { return 1 / math.Sqrt(1+3*phi*phi/(math.Pi*math.Pi)) }

// decay grows RD for the time since the player's last rated game.
func (r Rating) decay(nowMs int64) Rating {
	if r.Updated <= 0 || nowMs <= r.Updated {
		return r
	}
	periods := float64(nowMs-r.Updated) / (rdPeriodDays * 86400e3)
	phi := r.RD / glickoScale
	sig := r.Vol
	phi = math.Sqrt(phi*phi + sig*sig*periods)
	r.RD = math.Min(defaultRD, phi*glickoScale)
	return r
}

// glickoUpdate rates one period of results for p.
func glickoUpdate(p Rating, results []glickoResult) Rating {
	mu := (p.R - defaultRating) / glickoScale
	phi := p.RD / glickoScale
	sigma := p.Vol
	if len(results) == 0 {
		phi = math.Sqrt(phi*phi + sigma*sigma)
		p.RD = math.Min(defaultRD, phi*glickoScale)
		return p
	}
	var vInv, dSum float64
	for _, res := range results {
		muj := (res.Opp.R - defaultRating) / glickoScale
		phij := res.Opp.RD / glickoScale
		gj := g(phij)
		e := 1 / (1 + math.Exp(-gj*(mu-muj)))
		vInv += gj * gj * e * (1 - e)
		dSum += gj * (res.Score - e)
	}
	v := 1 / vInv
	delta := v * dSum

	// New volatility: Illinois algorithm (step 5 of the paper).
	a := math.Log(sigma * sigma)
	f := func(x float64) float64 {
		ex := math.Exp(x)
		d := phi*phi + v + ex
		return ex*(delta*delta-phi*phi-v-ex)/(2*d*d) - (x-a)/(glickoTau*glickoTau)
	}
	A := a
	var B float64
	if delta*delta > phi*phi+v {
		B = math.Log(delta*delta - phi*phi - v)
	} else {
		k := 1.0
		for f(a-k*glickoTau) < 0 {
			k++
		}
		B = a - k*glickoTau
	}
	fA, fB := f(A), f(B)
	for i := 0; i < 100 && math.Abs(B-A) > 1e-6; i++ {
		C := A + (A-B)*fA/(fB-fA)
		fC := f(C)
		if fC*fB <= 0 {
			A, fA = B, fB
		} else {
			fA /= 2
		}
		B, fB = C, fC
	}
	sigmaNew := math.Exp(A / 2)

	phiStar := math.Sqrt(phi*phi + sigmaNew*sigmaNew)
	phiNew := 1 / math.Sqrt(1/(phiStar*phiStar)+1/v)
	muNew := mu + phiNew*phiNew*dSum

	p.R = muNew*glickoScale + defaultRating
	p.RD = math.Max(minRD, math.Min(defaultRD, phiNew*glickoScale))
	p.Vol = sigmaNew
	return p
}

// rateGame returns both players' new ratings. score is white's (1, 0.5, 0).
func rateGame(w, b Rating, score float64, nowMs int64) (Rating, Rating) {
	w, b = w.decay(nowMs), b.decay(nowMs)
	nw := glickoUpdate(w, []glickoResult{{Opp: b, Score: score}})
	nb := glickoUpdate(b, []glickoResult{{Opp: w, Score: 1 - score}})
	nw.Updated, nb.Updated = nowMs, nowMs
	return nw, nb
}
