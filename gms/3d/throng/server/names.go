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

const maxName = 14

// No 0/O, 1/I/L: codes get read aloud and typed off a TV.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// codeLen: 31^6 ≈ 887M codes vs ≤ 1000 rooms, so guessing a private code is hopeless.
const codeLen = 6

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
		c := randString(codeAlphabet, codeLen)
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
	if len(s) < 5 || len(s) > codeLen { // 5 = codes from before 6-char codes
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

// blankRunes render as nothing (or as a space) but are not Unicode spaces or format
// characters: Hangul fillers (category Lo!), braille blank, Mongolian/Khmer invisibles,
// combining grapheme joiner, variation selectors.
func isBlankRune(r rune) bool {
	switch {
	case r == 0x115F, r == 0x1160, r == 0x3164, r == 0xFFA0, r == 0x2800, r == 0x17B4, r == 0x17B5,
		r == 0x034F, r >= 0x180B && r <= 0x180F, r >= 0xFE00 && r <= 0xFE0F, r >= 0xE0100 && r <= 0xE01EF,
		r >= 0x1D173 && r <= 0x1D17A, r == 0x2062, r == 0x2063, r == 0x2064:
		return true
	}
	return false
}

const maxMarksPerChar = 2 // combining marks kept per base character (zalgo)

// Names that pose as the site or its staff ("Aaron (admin)"), matched as whole words.
var reservedWord = map[string]bool{"admin": true, "admins": true, "administrator": true, "moderator": true,
	"mod": true, "mods": true, "staff": true, "official": true, "throng": true, "br8t": true, "sysop": true}

// cleanName strips control, format and invisible characters, collapses whitespace, caps
// combining marks, trims to maxName runes and refuses profanity (after folding look-alike
// letters), staff impersonation and names with nothing visible in them.
func cleanName(s string) (string, error) {
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "")
	}
	var b strings.Builder
	space, marks := false, 0
	for _, r := range s {
		switch {
		case unicode.IsSpace(r) || isBlankRune(r):
			space = true
			continue
		case unicode.IsControl(r), unicode.Is(unicode.Cf, r), unicode.Is(unicode.Co, r),
			unicode.Is(unicode.Cs, r), r == '<', r == '>', r == utf8.RuneError:
			continue
		case unicode.In(r, unicode.Mn, unicode.Me):
			if b.Len() == 0 || space || marks >= maxMarksPerChar {
				continue
			}
			marks++
			b.WriteRune(r)
			continue
		}
		if space && b.Len() > 0 {
			b.WriteByte(' ')
		}
		space, marks = false, 0
		b.WriteRune(r)
	}
	out := b.String()
	if utf8.RuneCountInString(out) > maxName {
		out = strings.TrimSpace(string([]rune(out)[:maxName]))
	}
	visible := false
	for _, r := range out {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsSymbol(r) {
			visible = true
			break
		}
	}
	if out == "" || !visible {
		return "", errEmptyName
	}
	if isProfane(out) || isReserved(out) {
		return "", errBadName
	}
	return out, nil
}

// confusable folds Cyrillic / Greek look-alikes and fullwidth forms to Latin and drops
// combining marks, so "fцck", "ｆｕｃｋ" and "f̶u̶c̶k" meet the word lists as "fuck".
var confusable = map[rune]rune{
	'а': 'a', 'в': 'b', 'с': 'c', 'ԁ': 'd', 'е': 'e', 'ё': 'e', 'һ': 'h', 'н': 'h', 'і': 'i', 'ї': 'i',
	'ј': 'j', 'к': 'k', 'ӏ': 'l', 'м': 'm', 'п': 'n', 'и': 'n', 'о': 'o', 'р': 'p', 'ԛ': 'q', 'г': 'r',
	'ѕ': 's', 'т': 't', 'ц': 'u', 'џ': 'u', 'ѵ': 'v', 'ш': 'w', 'ѡ': 'w', 'х': 'x', 'у': 'y', 'ү': 'y',
	'α': 'a', 'β': 'b', 'ϲ': 'c', 'δ': 'd', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k', 'μ': 'u', 'ν': 'v',
	'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'γ': 'y', 'ω': 'w', 'ѳ': 'o', 'ɑ': 'a', 'ı': 'i',
}

func foldConfusables(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case unicode.In(r, unicode.Mn, unicode.Me):
			continue
		case r >= 0xFF01 && r <= 0xFF5E: // fullwidth ASCII
			r = unicode.ToLower(r - 0xFEE0)
		}
		if x, ok := confusable[r]; ok {
			r = x
		}
		b.WriteRune(r)
	}
	return b.String()
}

func isReserved(s string) bool {
	f := foldConfusables(s)
	split := func(x string) []string {
		return strings.FieldsFunc(x, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) })
	}
	for _, w := range append(split(f), split(leet.Replace(f))...) {
		if reservedWord[w] {
			return true
		}
	}
	return strings.Contains(f, "br8t")
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
	low := leet.Replace(foldConfusables(s))
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
