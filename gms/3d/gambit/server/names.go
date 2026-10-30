package main

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxName = 20

// No 0/O, 1/I/L: codes get read aloud and typed off a TV.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func randString(alpha string, n int) string {
	b := make([]byte, n)
	rand.Read(b)
	out := make([]byte, n)
	for i := range b {
		out[i] = alpha[int(b[i])%len(alpha)]
	}
	return string(out)
}

func newCode() string {
	for {
		c := randString(codeAlphabet, 5)
		if !isProfane(c) {
			return c
		}
	}
}

func newKey() string {
	b := make([]byte, 18)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func normCode(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	if len(s) != 5 {
		return ""
	}
	for _, c := range s {
		if !strings.ContainsRune(codeAlphabet, c) {
			return ""
		}
	}
	return s
}

var errBadName = errors.New("name not allowed")
var errEmptyName = errors.New("name required")

// cleanName strips control and format characters, collapses whitespace,
// trims to maxName runes and refuses profanity.
func cleanName(s string) (string, error) {
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "")
	}
	var b strings.Builder
	space := false
	for _, r := range s {
		switch {
		case unicode.IsSpace(r):
			space = true
			continue
		case unicode.IsControl(r), unicode.Is(unicode.Cf, r), unicode.Is(unicode.Co, r),
			unicode.Is(unicode.Cs, r), r == '<', r == '>', r == utf8.RuneError:
			continue
		}
		if space && b.Len() > 0 {
			b.WriteByte(' ')
		}
		space = false
		b.WriteRune(r)
	}
	out := b.String()
	if utf8.RuneCountInString(out) > maxName {
		out = strings.TrimSpace(string([]rune(out)[:maxName]))
	}
	if out == "" {
		return "", errEmptyName
	}
	if isProfane(out) {
		return "", errBadName
	}
	return out, nil
}

// dedupeName appends " 2", " 3"… until no taken name matches case-insensitively.
func dedupeName(name string, taken func(string) bool) string {
	if !taken(name) {
		return name
	}
	for n := 2; ; n++ {
		suf := " " + strconv.Itoa(n)
		base := []rune(name)
		if len(base)+len(suf) > maxName {
			base = base[:maxName-len(suf)]
		}
		c := strings.TrimSpace(string(base)) + suf
		if !taken(c) {
			return c
		}
	}
}

// Substring matches: no innocent English word contains these.
var badSub = []string{"fuck", "fuk", "shit", "cunt", "nigg", "nigr", "faggot", "bitch", "wank", "twat",
	"slut", "whore", "rape", "nazi", "porn", "pussy", "bastard", "retard", "penis", "vagina", "dildo",
	"cum", "jizz", "hitler", "kkk", "molest", "pedo", "boner", "horny", "nude", "sex", "xxx"}

// Whole-word matches only ("Hancock", "Dickens", "Cassie" stay fine).
var badWord = map[string]bool{"ass": true, "arse": true, "dick": true, "cock": true, "fag": true, "tit": true,
	"tits": true, "spic": true, "chink": true, "kike": true, "gook": true, "coon": true, "homo": true,
	"jap": true, "paki": true, "wop": true, "prick": true, "piss": true, "crap": true,
	"anal": true, "anus": true, "boob": true, "boobs": true, "willy": false, "knob": true, "bollocks": true, "tosser": true}

// Substrings above that innocent words do contain, checked per word.
var badSubExceptions = []string{"scum", "cumber", "cumul", "circum", "document", "analy", "canal", "banal",
	"trape", "sexton", "essex", "sussex", "middlesex", "wessex", "grape", "drape", "scrape",
	"therapist", "rapeseed", "pedometer", "pedomet", "torpedo", "speedo", "nudes"}

var leet = strings.NewReplacer("0", "o", "1", "i", "3", "e", "4", "a", "5", "s", "7", "t", "@", "a", "$", "s", "!", "i")

func isProfane(s string) bool {
	low := leet.Replace(strings.ToLower(s))
	words := strings.FieldsFunc(low, func(r rune) bool { return !unicode.IsLetter(r) })
	for _, w := range words {
		if badWord[w] {
			return true
		}
		clean := w
		for _, ex := range badSubExceptions {
			clean = strings.ReplaceAll(clean, ex, "")
		}
		for _, b := range badSub {
			if strings.Contains(clean, b) {
				return true
			}
		}
	}
	squash := strings.Join(words, "")
	for _, b := range []string{"fuck", "shit", "cunt", "nigger", "faggot", "bitch", "whore"} {
		if strings.Contains(squash, b) {
			return true
		}
	}
	return false
}

func equalFoldName(a, b string) bool { return strings.EqualFold(a, b) }
