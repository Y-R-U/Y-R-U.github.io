// Story / Chapter system - 3 runs with distance-triggered dialogues
// Each chapter has exactly 2 dialogue lines

export const RUN_NAMES = [
    "The Corsair's Awakening",
    "The Dark Fleet",
    "The Kraken's Abyss"
];

const RUN_CHAPTERS = {
    // ===== RUN 1: The Corsair's Awakening =====
    1: [
        {
            id: 'r1_intro',
            triggerDistance: 0,
            title: "Chapter I: The Beginning",
            dialogues: [
                { speaker: 'Old Sailor', text: "So ye want to be a pirate, do ye? Trade between ports, attack enemy ships, and upgrade yer vessel. The further ye sail from Haven's Rest, the tougher they get." },
                { speaker: 'Old Sailor', text: "Yer cannons fire on their own when enemies get close. If ye fall in battle, ye'll keep some gold for permanent upgrades. Now go, and may the winds favor ye!" }
            ]
        },
        {
            id: 'r1_ch2',
            triggerDistance: 1500,
            title: "Chapter II: Open Waters",
            dialogues: [
                { speaker: 'Mysterious Merchant', text: "Ye've sailed far from home, captain. Brigantines roam these parts — their cannons hit harder than the sloops near Haven." },
                { speaker: 'Mysterious Merchant', text: "Each port has different prices. A canny captain can make a fortune trading between them. Buy low, sell high!" }
            ]
        },
        {
            id: 'r1_ch3',
            triggerDistance: 3000,
            title: "Chapter III: The Deep Blue",
            dialogues: [
                { speaker: 'Ghost Captain', text: "Ye dare sail these waters? The galleons here carry heavy gold, but their broadsides can sink a ship in moments." },
                { speaker: 'Ghost Captain', text: "There are whispers of dark ships in the fog... and something far worse lurking in the deep..." }
            ]
        },
        {
            id: 'r1_ch4',
            triggerDistance: 5000,
            title: "Chapter IV: The Cursed Seas",
            dialogues: [
                { speaker: 'Cursed Pirate', text: "Turn back while ye still can... The Man-o-Wars that patrol these waters answer to Captain Blacktide himself." },
                { speaker: 'Cursed Pirate', text: "His lieutenant commands a black warship ahead. Defeat that fiend, and ye may yet live to see another sunrise..." }
            ]
        },
        {
            id: 'r1_boss',
            triggerDistance: 8000,
            title: "Chapter V: The Lieutenant",
            spawnBoss: 1,
            unlockCreepy: 1,
            dialogues: [
                { speaker: "Blacktide's Lieutenant", text: "So... another fool seeks passage through these waters. I am the shield of Captain Blacktide, and none shall pass!" },
                { speaker: "Blacktide's Lieutenant", text: "Prepare to meet the depths, corsair! My black warship has sent hundreds to Davy Jones — ye'll be no different!" }
            ]
        }
    ],

    // ===== RUN 2: The Dark Fleet =====
    2: [
        {
            id: 'r2_intro',
            triggerDistance: 0,
            title: "Chapter I: Return to the Seas",
            dialogues: [
                { speaker: 'Old Sailor', text: "Ye defeated the Lieutenant, but Blacktide's fleet still darkens these waters. His armada is stronger now — be prepared." },
                { speaker: 'Old Sailor', text: "The Kraken stirs in the deep, drawn by the chaos... but it ignores yer puny vessel. For now. Focus on Blacktide." }
            ]
        },
        {
            id: 'r2_ch2',
            triggerDistance: 2000,
            title: "Chapter II: Dark Sails",
            dialogues: [
                { speaker: 'Scarred Survivor', text: "I barely escaped with me life... Blacktide's fleet has doubled. Dark ships patrol every route." },
                { speaker: 'Scarred Survivor', text: "He's fortified his position. Ye'll need serious firepower to break through his escort fleet." }
            ]
        },
        {
            id: 'r2_ch3',
            triggerDistance: 5000,
            title: "Chapter III: Heart of Darkness",
            dialogues: [
                { speaker: 'Ghost Captain', text: "I sense Blacktide's presence growing stronger. The sea itself grows cold with his dark magic." },
                { speaker: 'Ghost Captain', text: "His flagship is massive — surrounded by loyal warships. Strike swift, or they'll overwhelm ye." }
            ]
        },
        {
            id: 'r2_boss',
            triggerDistance: 9000,
            title: "Chapter IV: Captain Blacktide",
            spawnBoss: 2,
            unlockCreepy: 2,
            dialogues: [
                { speaker: 'Captain Blacktide', text: "YOU! The corsair who slew my lieutenant! I am Blacktide, terror of the seven seas, and even death could not stop me!" },
                { speaker: 'Captain Blacktide', text: "My flagship and loyal fleet shall crush ye! And if by some miracle ye survive... the Kraken awaits. It answers only to ME!" }
            ]
        }
    ],

    // ===== RUN 3: The Kraken's Abyss =====
    3: [
        {
            id: 'r3_intro',
            triggerDistance: 0,
            title: "Chapter I: The Ancient Stirring",
            dialogues: [
                { speaker: 'Ancient Spirit', text: "With Blacktide fallen, the chains that bound the Kraken weaken. The beast stirs in the abyss, drawn to the surface." },
                { speaker: 'Ancient Spirit', text: "No mortal has faced the Kraken and lived. But ye are no ordinary pirate. Sail forth, and end this terror once and for all." }
            ]
        },
        {
            id: 'r3_ch2',
            triggerDistance: 3000,
            title: "Chapter II: Trembling Seas",
            dialogues: [
                { speaker: 'Terrified Merchant', text: "The sea trembles! Ships are vanishing without a trace — pulled beneath the waves by something monstrous!" },
                { speaker: 'Terrified Merchant', text: "The Kraken's tentacles stretch for miles. If ye plan to fight it... may the gods have mercy on yer soul." }
            ]
        },
        {
            id: 'r3_ch3',
            triggerDistance: 6000,
            title: "Chapter III: The Abyss Calls",
            dialogues: [
                { speaker: 'Ghost Captain', text: "I can feel it below us... ancient, hungry, and furious. The Kraken's rage shakes the very foundations of the sea." },
                { speaker: 'Ghost Captain', text: "When it surfaces, the ocean itself becomes yer enemy. Strike its body between the tentacles — that is its weakness." }
            ]
        },
        {
            id: 'r3_boss',
            triggerDistance: 10000,
            title: "Chapter IV: The Kraken Awakens",
            spawnBoss: 3,
            dialogues: [
                { speaker: '???', text: "The water goes deathly still. Then the ocean erupts. A nightmare of tentacles and ancient fury rises from the abyss." },
                { speaker: 'Your Crew', text: "KRAKEN! ALL HANDS TO BATTLE STATIONS! This is it, Captain — everything we've fought for comes down to this!" }
            ]
        }
    ]
};

export class StorySystem {
    constructor() {
        this.completedChapters = new Set();
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this.isShowingDialogue = false;
        this.onDialogueComplete = null;
        this.currentRun = 1; // Set by game based on persistent data
    }

    setRun(runNumber) {
        this.currentRun = Math.min(runNumber, 3);
    }

    checkTriggers(playerDistFromHome) {
        const chapters = RUN_CHAPTERS[this.currentRun] || RUN_CHAPTERS[3];
        for (const chapter of chapters) {
            if (this.completedChapters.has(chapter.id)) continue;
            if (playerDistFromHome >= chapter.triggerDistance) {
                this.triggerChapter(chapter);
                return true;
            }
        }
        return false;
    }

    triggerChapter(chapter) {
        this.currentDialogue = chapter;
        this.dialogueIndex = 0;
        this.isShowingDialogue = true;
        this.completedChapters.add(chapter.id);
    }

    advance() {
        if (!this.isShowingDialogue) return;
        this.dialogueIndex++;
        if (this.dialogueIndex >= this.currentDialogue.dialogues.length) {
            this.isShowingDialogue = false;
            const completedChapter = this.currentDialogue;
            this.currentDialogue = null;
            if (this.onDialogueComplete) this.onDialogueComplete(completedChapter);
        }
    }

    getCurrentLine() {
        if (!this.isShowingDialogue || !this.currentDialogue) return null;
        return this.currentDialogue.dialogues[this.dialogueIndex];
    }

    getChapterTitle() {
        if (!this.currentDialogue) return null;
        return this.currentDialogue.title;
    }

    reset() {
        this.completedChapters = new Set();
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this.isShowingDialogue = false;
    }

    // Serialize for localStorage
    serialize() {
        return {
            completedChapters: [...this.completedChapters],
            currentRun: this.currentRun
        };
    }

    deserialize(data) {
        if (data && data.completedChapters) {
            this.completedChapters = new Set(data.completedChapters);
        }
        if (data && data.currentRun) {
            this.currentRun = data.currentRun;
        }
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this.isShowingDialogue = false;
    }
}
