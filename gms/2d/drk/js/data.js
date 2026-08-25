(() => {
  const characterBase = "images/characters/";
  const backgroundBase = "images/backgrounds/";

  window.DRK_DATA = {
    version: "0.1",
    title: "DRK: Desire, Risk & Kapital",
    player: {
      id: "alex",
      name: "Alex Vale",
      age: 27,
      image: `${characterBase}alex_card.png`,
      prompt: [
        "adult man age 27, stylish urban life simulator protagonist, confident but slightly tired expression",
        "tailored black overshirt, clean white tee, silver watch, modern city nightlife styling",
        "vertical 576x1024 dating sim character reference card, full body, centered, cinematic realistic lighting",
        "sharp face detail, tasteful mature tone, no text, no watermark"
      ].join(", ")
    },
    startingState: {
      day: 1,
      slot: 0,
      cash: 420,
      debt: 2800,
      energy: 72,
      mood: 58,
      charm: 34,
      fitness: 28,
      intelligence: 41,
      reputation: 18,
      risk: 20,
      jobId: "delivery",
      focusId: "mara",
      mediaCharacterId: "alex",
      sceneName: "home_base",
      backgroundId: "loft",
      story: "You wake up in your loft. Rent is due in two weeks, your phone has four unread messages, your broker app is blinking red, and the city is full of ways to get rich or get humbled.",
      portfolio: {
        cash_reserved: 0,
        assets: { zen: 0, ember: 0, nova: 0, titan: 0 },
        avgCost: { zen: 0, ember: 0, nova: 0, titan: 0 },
        lastPrices: { zen: 6.25, ember: 42.3, nova: 148.75, titan: 1240 },
        dividendsEarned: 0
      },
      prices: { zen: 6.25, ember: 42.3, nova: 148.75, titan: 1240 },
      marketChanges: { zen: 0, ember: 0, nova: 0, titan: 0 },
      history: []
    },
    slots: ["Morning", "Afternoon", "Evening", "Late"],
    backgrounds: [
      {
        id: "loft",
        name: "Starter Loft",
        image: `${backgroundBase}loft.png`,
        prompt: "vertical 576x1024 cinematic realistic background, compact city loft apartment at dawn, clean sheets, laptop on small desk, rent notices, moody green neon from window, no people, no readable text, no watermark"
      },
      {
        id: "market_floor",
        name: "Market Floor",
        image: `${backgroundBase}market_floor.png`,
        prompt: "vertical 576x1024 cinematic realistic background, boutique trading office at night, glowing monitors, city skyline, elegant finance atmosphere, no people, no readable text, no watermark"
      },
      {
        id: "velvet_cafe",
        name: "Velvet Cafe",
        image: `${backgroundBase}velvet_cafe.png`,
        prompt: "vertical 576x1024 cinematic realistic background, intimate upscale cafe booth, emerald velvet seats, soft candlelight, rainy city window, no people, no readable text, no watermark"
      },
      {
        id: "roof_bar",
        name: "Rooftop Bar",
        image: `${backgroundBase}roof_bar.png`,
        prompt: "vertical 576x1024 cinematic realistic background, stylish rooftop bar with city lights, glass rail, black marble tables, romantic mature atmosphere, no people, no readable text, no watermark"
      }
    ],
    characters: [
      {
        id: "mara",
        name: "Mara Voss",
        age: 28,
        role: "venture scout",
        image: `${characterBase}mara_card.png`,
        backgroundId: "market_floor",
        vibe: "Ambition, restraint, and a private smile that says she already knows your pitch.",
        likes: ["intelligence", "reputation", "cash"],
        dislikes: ["reckless gambling", "neediness"],
        prompt: [
          "adult woman age 28, venture scout romance character, poised confident expression",
          "sleek black suit dress, emerald earrings, elegant mature fashion, standing in a finance lounge",
          "vertical 576x1024 dating sim character reference card, full body, centered, cinematic realistic lighting",
          "sharp face detail, tasteful mature tone, no text, no watermark"
        ].join(", ")
      },
      {
        id: "sienna",
        name: "Sienna Park",
        age: 25,
        role: "nightlife host",
        image: `${characterBase}sienna_card.png`,
        backgroundId: "roof_bar",
        vibe: "Fast laugh, sharper instincts, and a habit of turning every room into a wager.",
        likes: ["charm", "risk", "cash"],
        dislikes: ["boring plans", "hesitation"],
        prompt: [
          "adult woman age 25, nightlife host romance character, playful confident expression",
          "stylish crimson cocktail dress with a tailored black jacket, city rooftop mood, tasteful mature fashion",
          "vertical 576x1024 dating sim character reference card, full body, centered, cinematic realistic lighting",
          "sharp face detail, no explicit nudity, no text, no watermark"
        ].join(", ")
      },
      {
        id: "june",
        name: "June Ramos",
        age: 29,
        role: "paramedic boxer",
        image: `${characterBase}june_card.png`,
        backgroundId: "loft",
        vibe: "Warm hands, dry humor, and the kind of honesty that makes cheap charm useless.",
        likes: ["fitness", "mood", "honesty"],
        dislikes: ["flashy spending", "late nights"],
        prompt: [
          "adult woman age 29, paramedic and amateur boxer romance character, warm grounded expression",
          "athletic jacket over fitted training top, practical black pants, mature realistic style",
          "vertical 576x1024 dating sim character reference card, full body, centered, cinematic realistic lighting",
          "sharp face detail, tasteful, no text, no watermark"
        ].join(", ")
      },
      {
        id: "valentina",
        name: "Valentina Ricci",
        age: 31,
        role: "gallery owner",
        image: `${characterBase}valentina_card.png`,
        backgroundId: "velvet_cafe",
        vibe: "Cultured, dangerous with silence, and amused by anyone who thinks money is the whole game.",
        likes: ["charm", "intelligence", "reputation"],
        dislikes: ["cheap bragging", "panic"],
        prompt: [
          "adult woman age 31, art gallery owner romance character, elegant knowing expression",
          "tailored ivory blouse, black high-waist trousers, refined jewelry, mature cinematic fashion",
          "vertical 576x1024 dating sim character reference card, full body, centered, realistic editorial lighting",
          "sharp face detail, tasteful, no text, no watermark"
        ].join(", ")
      }
    ],
    jobs: [
      {
        id: "delivery",
        name: "Courier Shift",
        pay: [120, 200],
        energy: 12,
        req: { energy: 12 },
        stats: { fitness: 2, reputation: 1 },
        unlock: () => true
      },
      {
        id: "bar",
        name: "Velvet Bar Cover",
        pay: [210, 330],
        energy: 16,
        req: { energy: 16, charm: 38 },
        stats: { charm: 3, mood: -2 },
        unlock: (s) => s.energy >= 16 && s.charm >= 38
      },
      {
        id: "analyst",
        name: "Junior Analyst",
        pay: [300, 520],
        energy: 18,
        req: { energy: 18, intelligence: 45 },
        stats: { intelligence: 3, reputation: 2 },
        unlock: (s) => s.energy >= 18 && s.intelligence >= 45
      },
      {
        id: "dealdesk",
        name: "Deal Desk Sprint",
        pay: [650, 1100],
        energy: 24,
        req: { energy: 24, reputation: 34, intelligence: 52 },
        stats: { intelligence: 2, reputation: 4, mood: -4 },
        unlock: (s) => s.energy >= 24 && s.reputation >= 34 && s.intelligence >= 52
      }
    ],
    marketAssets: [
      {
        id: "zen",
        name: "ZEN",
        sector: "Sleep tech",
        desc: "Cheap, jumpy small-cap. Low entry price, ugly swings.",
        startPrice: 6.25,
        volatility: [0.02, 0.2],
        dividendYield: 0.0004,
        risk: "High"
      },
      {
        id: "ember",
        name: "EMBER",
        sector: "Nightlife",
        desc: "Medium-price venue group. Moves with city gossip and spending.",
        startPrice: 42.3,
        volatility: [0.02, 0.14],
        dividendYield: 0.0009,
        risk: "Medium"
      },
      {
        id: "nova",
        name: "NOVA",
        sector: "AI infrastructure",
        desc: "Expensive growth stock. Big catalysts, big drawdowns.",
        startPrice: 148.75,
        volatility: [0.03, 0.18],
        dividendYield: 0.0002,
        risk: "High"
      },
      {
        id: "titan",
        name: "TITAN",
        sector: "Industrial dividend",
        desc: "Very expensive blue-chip. Slower, steadier, pays the best dividend.",
        startPrice: 1240,
        volatility: [0.02, 0.08],
        dividendYield: 0.0014,
        risk: "Low"
      }
    ],
    dateSpots: [
      { id: "coffee", name: "Velvet Cafe", cost: 35, energy: 14, backgroundId: "velvet_cafe", gains: { affection: 7, trust: 6, heat: 2 }, goodFor: ["june", "valentina"],
        flavor: ["Rain traces the window; the booth glows amber and close.", "Candlelight and good coffee make the whole city feel far away."] },
      { id: "roofbar", name: "Rooftop Bar", cost: 95, energy: 18, backgroundId: "roof_bar", gains: { affection: 8, trust: 2, heat: 8 }, goodFor: ["sienna", "mara"],
        flavor: ["The city sprawls gold and electric below the glass rail.", "Wind, neon, and a skyline that makes everyone look like a promise."] },
      { id: "gallery", name: "After-hours Gallery", cost: 60, energy: 16, backgroundId: "velvet_cafe", gains: { affection: 6, trust: 7, heat: 4 }, goodFor: ["valentina", "mara"],
        flavor: ["Empty halls, low light, and art worth more than your debt watching you both.", "Footsteps echo between the canvases; the quiet feels expensive."] },
      { id: "training", name: "Late Gym Session", cost: 20, energy: 16, backgroundId: "loft", gains: { affection: 5, trust: 5, heat: 5 }, goodFor: ["june"],
        flavor: ["Chalk, sweat, and the honest hum of the late gym.", "The bag's still swinging, the music's low, and there's nothing to hide behind."] }
    ],
    galleryRewards: {
      default: [
        { sceneName: "character_card", label: "Reference card", stage: 0 },
        { sceneName: "cafe_date", label: "Cafe date", stage: 1 },
        { sceneName: "rooftop_scene", label: "Rooftop spark", stage: 1 },
        { sceneName: "bedroom_fadeout", label: "Safe fade-out", stage: 2 }
      ],
      mara: [
        { sceneName: "character_card", label: "Reference card", stage: 0 },
        { sceneName: "market_scene", label: "Market floor loop", stage: 0 },
        { sceneName: "cafe_date", label: "Cafe date loop", stage: 1 },
        { sceneName: "rooftop_scene", label: "Rooftop loop", stage: 1 },
        { sceneName: "bedroom_fadeout", label: "Safe fade-out", stage: 2 }
      ]
    },
    approachPrefs: {
      mara: ["listen", "status"],
      sienna: ["spark", "status"],
      june: ["honest", "listen"],
      valentina: ["listen", "spark"]
    },
    relationshipLabels: ["Stranger", "Acquaintance", "Warming up", "Flirting", "Seeing each other", "Falling for you", "Together"],
    pools: {
      look: ["studies you for a second", "holds your gaze", "looks you over", "watches you over her glass", "reads your face", "tilts her head"],
      beat: ["lets the silence stretch", "takes her time", "leans back", "traces the rim of her glass", "waits you out"],
      warmth: ["her guard slips", "something softer surfaces", "the corner of her mouth lifts", "she stops performing for a second"]
    },
    conversations: {
      global: {
        kiss: [
          "The night ends with a slow kiss, a locked door, and a safe fade to city light and sheets.",
          "She pulls you in at her door, and the rest of the night belongs to the two of you.",
          "One look, one kiss, and the city goes quiet behind a closing door."
        ],
        linger: [
          "The goodbye lingers — close shoulders, warm fingers, a promise neither of you says too loudly.",
          "Neither of you wants to be the first to leave. That tells you something.",
          "She holds the hug a beat too long, then grins like she got caught."
        ]
      },
      mara: {
        nick: { "2": "trouble" },
        greet: {
          "0": [
            "Mara {look}, then your eyes. \"Convince me this isn't another desperate pitch.\"",
            "Mara checks the time before she checks you. \"You've got one drink to be interesting.\"",
            "\"Talk,\" she says, and {beat}. \"Make the first sentence count.\""
          ],
          "1": [
            "Mara already ordered your usual. \"Sit. The real version tonight, not the pitch.\"",
            "\"There he is.\" She {look}, warmer than she'd admit.",
            "She turns her phone face-down. Rare. \"You get my undivided attention. Don't waste it.\""
          ],
          "2": [
            "Mara pulls you in by the collar. \"Skip the strategy, {nick}. I missed you.\"",
            "\"You're late, {nick}.\" She's already smiling, already close.",
            "\"I ordered for both of us,\" she says, and laces her fingers through yours."
          ]
        },
        meet: [
          "You find {name} already at the table, two glasses poured.",
          "{name} is waiting when you arrive, and {look}."
        ],
        win: {
          status: ["She {beat}, then nods. \"Ambition that actually closes. Rarer than money.\""],
          listen: ["\"Better.\" {name}'s guard slips. \"You listened before you sold.\""],
          any: [
            "{name} {warmth}. \"Okay. That landed, don't let it go to your head.\"",
            "She tips her glass to yours. \"You're learning my language.\""
          ]
        },
        lose: {
          any: [
            "{name} checks her watch. \"Interesting premise. Weak execution.\"",
            "\"Mm.\" She {beat}. \"You reached for the easy line. I always notice.\"",
            "Her smile stays polite and goes nowhere. \"Lead with something true next time.\""
          ]
        },
        notice: {
          intelligence: "\"You think before you talk. I like watching it happen.\"",
          reputation: "\"People say your name in rooms you're not in. I noticed.\"",
          cash: "\"You stopped flinching at the bill. Confidence reads.\""
        }
      },
      sienna: {
        nick: { "1": "trouble", "2": "babe" },
        greet: {
          "0": [
            "Sienna slides into the booth like she owns the lease. \"Tell me you brought a better story than your bank balance.\"",
            "\"Well, look who's brave tonight.\" She {look}, grinning.",
            "Sienna pushes a shot across the table. \"Rule one: keep up.\""
          ],
          "1": [
            "\"You came back. Bold.\" {name} {look}, delighted.",
            "She's mid-laugh with the bartender when she spots you. \"Saved you a seat, {nick}.\"",
            "\"Tell me we're doing something reckless tonight,\" she says, eyes bright."
          ],
          "2": [
            "Sienna grabs your hand the second you walk in. \"You're mine tonight, {nick}. No arguments.\"",
            "\"There's my favorite bad idea.\" She kisses your cheek and pulls you toward the noise.",
            "\"I had a whole plan,\" she murmurs, \"and it's mostly just you, {nick}.\""
          ]
        },
        meet: [
          "{name} is already at the dance floor's edge, daring you over with a look.",
          "You spot {name} at the rail, city lights behind her, grinning like trouble."
        ],
        win: {
          spark: ["She laughs close to your ear. \"Risky, charming, not completely doomed. I like the shape of that.\""],
          status: ["\"Big talk.\" She {look}. \"Lucky for you it suits you tonight.\""],
          any: [
            "{name} bites back a smile. \"Okay, that was good. Annoyingly good.\"",
            "She bumps her shoulder into yours. \"Don't stop now, you're on a streak.\""
          ]
        },
        lose: {
          any: [
            "She taps the table twice. \"You folded before the first hand.\"",
            "\"Safe.\" {name} {beat}. \"Safe is the one thing I can't drink to.\"",
            "She's already scanning the room. \"Catch up or catch the door.\""
          ]
        },
        notice: {
          charm: "\"You've got a mouth on you tonight. I approve.\"",
          risk: "\"You don't blink at the edge anymore. Sexy.\"",
          cash: "\"Spending like you mean it. I notice.\""
        }
      },
      june: {
        nick: { "2": "champ" },
        greet: {
          "0": [
            "June notices your tired eyes before your outfit. \"Did you eat today, or are we pretending coffee counts?\"",
            "\"You look like the city's been chewing on you.\" She {look}, not unkindly. \"Sit.\"",
            "June slides you the better chair. \"No pitch tonight. Just talk to me like a person.\""
          ],
          "1": [
            "\"There's a face I like.\" {name}, and {warmth}.",
            "She's already got water and real food waiting. \"Eat first. Then tell me how you actually are.\"",
            "\"You came straight here, didn't you,\" she says, reading you. \"Good.\""
          ],
          "2": [
            "June meets you with a hug that lands like home. \"Missed your dumb face, {nick}.\"",
            "\"Shoes off, guard down,\" she says, tugging you onto the couch. \"You're safe here.\"",
            "\"Come here, {nick},\" she says quietly. \"You don't have to perform for me.\""
          ]
        },
        meet: [
          "{name} waves you over to a quiet corner, two plates already coming.",
          "You find {name} stretching out a long shift, but her smile finds you fast."
        ],
        win: {
          honest: ["Her shoulder brushes yours and stays. \"That was honest. Rare enough to be attractive.\""],
          listen: ["\"You actually heard me.\" {name} {warmth}. \"People forget how.\""],
          any: [
            "{name} squeezes your hand once. \"Yeah. That's the real you.\"",
            "She laughs, low and easy. \"Okay, that got me. Don't tell anyone.\""
          ]
        },
        lose: {
          any: [
            "June softens, but only a little. \"Try less performance next time.\"",
            "\"Hm.\" She {beat}. \"That was the version you think I want. I'd rather have the true one.\"",
            "\"You're tired,\" she says, kindly. \"Go rest. We'll try again.\""
          ]
        },
        notice: {
          fitness: "\"You've been taking care of yourself. It shows, I like it.\"",
          mood: "\"You're lighter tonight. Suits you.\""
        }
      },
      valentina: {
        nick: { "1": "darling", "2": "darling" },
        greet: {
          "0": [
            "Valentina looks past you at the room, then back with a half smile. \"People reveal themselves in what they choose to admire.\"",
            "\"Punctual. Promising.\" She {look} over a glass of something dark and expensive.",
            "\"Tell me something you actually believe,\" she says, \"not something you rehearsed.\""
          ],
          "1": [
            "\"Ah. You.\" {name}, and {warmth}, as if you're a piece she's reconsidering.",
            "She saves you the seat with the best view of the room. \"Sit. Observe with me.\"",
            "\"I thought about you,\" she admits, \"which I don't do often. Don't ruin it.\""
          ],
          "2": [
            "Valentina draws you close by the lapel. \"No audience tonight, {nick}. Just us.\"",
            "\"There's my favorite distraction.\" She {look}, unhurried, certain.",
            "\"Come,\" she says simply, and the rest of the room stops mattering."
          ]
        },
        meet: [
          "{name} is studying a painting when you arrive, and turns as if she felt you.",
          "You find {name} in candlelight, the cafe arranged around her like a frame."
        ],
        win: {
          listen: ["She touches your wrist lightly. \"You noticed the real thing. That is uncommon.\""],
          spark: ["A genuine laugh escapes her; she looks almost surprised. \"You're more dangerous than you look.\""],
          any: [
            "{name} {warmth}. \"Mm. You have taste after all.\"",
            "\"Keep talking,\" she says, leaning in. \"You've earned another minute.\""
          ]
        },
        lose: {
          any: [
            "Her smile remains perfect. \"That sounded memorized.\"",
            "\"Pretty,\" she says of your line, \"and empty. I collect the real thing.\"",
            "She returns her attention to the room. \"Find me when you mean it.\""
          ]
        },
        notice: {
          charm: "\"You've grown charming. Careful, I notice craftsmanship.\"",
          intelligence: "\"A mind worth the evening. Those are rare.\"",
          reputation: "\"Your name carries now. I don't admire just anyone.\""
        }
      }
    },
    lateText: {
      mara: {
        "0": ["{name}: \"Still awake? Saw a pitch tonight worse than yours. Felt nostalgic.\"", "{name}: \"Quick question. Are you actually as interesting as you think you are?\""],
        "1": ["{name}: \"Can't switch my brain off. Distract me.\"", "{name}: \"Thinking about your last bad idea. It almost worked.\""],
        "2": ["{name}: \"Bed's too organized tonight. Come mess it up, {nick}.\"", "{name}: \"I don't do 'I miss you'. But. You know.\""]
      },
      sienna: {
        "0": ["{name}: \"u up? bad decision energy is HIGH tonight\"", "{name}: \"bet you're being boring right now. prove me wrong\""],
        "1": ["{name}: \"sneaking out. you in, or you scared, {nick}?\"", "{name}: \"the night's wasted on sleep. say the word\""],
        "2": ["{name}: \"come over. bring nothing but trouble, {nick}\"", "{name}: \"thinking about you and it's very distracting xx\""]
      },
      june: {
        "0": ["{name}: \"You eat actual food today? Be honest.\"", "{name}: \"Long shift. Your dumb texts would help, if you've got one in you.\""],
        "1": ["{name}: \"Off early. Wondered what you're up to. No agenda.\"", "{name}: \"Can't sleep. Tell me something true.\""],
        "2": ["{name}: \"Left you half the leftovers. Come get them, {nick}.\"", "{name}: \"Just wanted to hear from you. That's the whole text.\""]
      },
      valentina: {
        "0": ["{name}: \"Insomnia and good wine. A dangerous combination. Entertain me.\"", "{name}: \"I was thinking about something you said. Annoyingly.\""],
        "1": ["{name}: \"The night is more interesting when you're awake for it. Are you?\"", "{name}: \"Tell me you're not asleep. I'm not finished with you.\""],
        "2": ["{name}: \"My door is unlocked, {nick}. Interpret that however you like.\"", "{name}: \"Come ruin my evening properly.\""]
      }
    },
    lateReply: {
      mara: {
        sweet: ["You answer honestly. The dots stop, start, stop. \"...okay. That was a good answer,\" she sends.", "You say what you mean. \"Careful,\" Mara replies. \"I could get used to the honest version.\""],
        cool: ["You keep it light. \"Smooth,\" she texts. \"I see what you're doing. It's working.\"", "You give her just enough. Ten minutes of nothing, then: \"Goodnight, problem.\""],
        ignore: ["You leave it. By morning: \"Bold, ignoring me. I don't forget that.\"", "Three dots appear, then vanish. You'll pay for the silence later."]
      },
      sienna: {
        sweet: ["You text back something real and she calls instead. You talk till 2am about nothing.", "\"aw, you have a heart under the swagger,\" she sends. \"don't tell anyone\""],
        cool: ["You play it cool. \"mysterious. hot. annoying. continue,\" she fires back.", "You keep her guessing. \"you're trouble and i'm into it\""],
        ignore: ["You leave her on read. \"rude. i like rude. but ALSO rude,\" arrives an hour later.", "Silence. Sienna hates silence. She'll make you earn it back."]
      },
      june: {
        sweet: ["You tell her the truth about your day. \"Thanks for not faking it,\" she writes. \"Sleep, okay?\"", "You're honest. \"That's the realest thing you've said. Goodnight.\""],
        cool: ["You keep your cards close. \"...okay, man of mystery,\" June sends with an eye-roll.", "You stay breezy. \"Cute. I'll allow it,\" she replies."],
        ignore: ["You don't answer. June doesn't chase. The read receipt just sits there.", "No reply from you. She won't mention it, but she noticed."]
      },
      valentina: {
        sweet: ["You answer with something genuine. \"Now that,\" she writes, \"was worth staying up for.\"", "You're sincere. A pause, then: \"You continue to surprise me. Rare.\""],
        cool: ["You stay elegantly aloof. \"Mm. Restraint. I respect it,\" she replies.", "You play the long game. \"Clever. I do love a slow reveal.\""],
        ignore: ["You leave her unanswered. \"Ignoring me is a strategy,\" she writes later. \"A risky one.\"", "The silence amuses her more than it should. For now."]
      }
    },
    storyBeats: {
      mara: {
        "1": { title: "Off the clock", text: "Mara walks you to the corner instead of calling her car. For three blocks she isn't evaluating anything, just talking, laughing at something stupid you said. At the crossing she stops. \"I don't do this,\" she says, almost a confession. \"Whatever this is. Don't make me regret it.\"" },
        "2": { title: "The honest version", text: "Later, the city quiet through the glass, Mara drops the armor entirely. \"Everyone wants the venture scout,\" she says against your shoulder. \"You wanted the person underneath. That's the part nobody bids on.\" For once she has no exit strategy, and isn't looking for one." }
      },
      sienna: {
        "1": { title: "Past the noise", text: "Sienna drags you out a fire exit into a silent stairwell, away from the music. \"People think I'm just the party,\" she says, breathless, grinning. \"You keep looking like you see the rest of it.\" She bumps her forehead to yours. \"Don't stop.\"" },
        "2": { title: "All in", text: "Sienna, who never bets it all, goes quiet in your arms. \"I push everything to the middle of the table for fun,\" she murmurs. \"This is the first thing I actually don't want to lose.\" Then she laughs at herself, kisses you, and means every reckless word." }
      },
      june: {
        "1": { title: "Guard down", text: "June finally lets you see the tired under the steady. \"I patch people up all day,\" she says, your hand in both of hers. \"Nobody really asks who patches me.\" She studies you a long moment. \"You ask. I noticed.\"" },
        "2": { title: "Home", text: "No performance, no pretense, June pulls you in and just breathes. \"I don't say things I don't mean,\" she says quietly. \"So hear this once: you feel like home. Don't be careless with that.\" And you won't." }
      },
      valentina: {
        "1": { title: "Behind the frame", text: "Valentina leads you past the velvet rope to a piece she never shows. \"I tell people I collect beauty,\" she says. \"The truth is I collect things that are real, and there are almost none.\" She looks at you, not the art. \"Almost.\"" },
        "2": { title: "Unguarded", text: "The cultured distance finally falls away. \"I've spent my life being admired from exactly the right distance,\" Valentina says, close enough now that the distance is gone. \"You came closer than I let anyone. I should be frightened. Instead I'm yours.\"" }
      }
    }
  };
})();
