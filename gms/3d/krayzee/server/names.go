// Profanity filter copied from RAGDOJO / Clued (gms/2d/ragdojo/server/names.go).
package main

import (
	"strings"
	"unicode"
)

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
