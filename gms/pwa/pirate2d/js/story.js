// Story / Chapter system - triggered by distance milestones

const CHAPTERS = [
    {
        id: 'intro',
        triggerDistance: 0,
        title: 'Chapter I: The Beginning',
        dialogues: [
            { speaker: 'Old Sailor', text: 'So ye want to be a pirate, do ye? The seas are dangerous, but the rewards are plentiful for those with the courage to seek them. To make money, trade between ports or attack enemy pirates. Use yer profits to upgrade yer ship \u2014 ye\'ll need it.' },
            { speaker: 'Old Sailor', text: 'Yer cannons fire on their own when enemies get close. The further ye sail from Haven\'s Rest, the tougher they get. If ye fall in battle, ye\'ll keep some of yer gold for permanent upgrades. Now go, and may the winds favor ye!' }
        ]
    },
    {
        id: 'chapter2',
        triggerDistance: 1500,
        title: 'Chapter II: Open Waters',
        dialogues: [
            { speaker: 'Mysterious Merchant', text: 'Ye\'ve sailed far from home, captain. The waters ahead hold greater treasures... and greater dangers.' },
            { speaker: 'Mysterious Merchant', text: 'I\'ve heard tales of brigantines roaming these parts. Their cannons hit harder than the sloops near Haven.' },
            { speaker: 'Mysterious Merchant', text: 'Seek out the trading posts \u2014 each port has different prices. A canny captain can make a fortune trading between them.' }
        ]
    },
    {
        id: 'chapter3',
        triggerDistance: 3000,
        title: 'Chapter III: The Deep Blue',
        dialogues: [
            { speaker: 'Ghost Captain', text: 'Ye dare sail these waters? Many have tried... few return.' },
            { speaker: 'Ghost Captain', text: 'The galleons here carry heavy gold, but their broadsides can sink a ship in moments. Upgrade yer armor if ye want to survive.' },
            { speaker: 'Ghost Captain', text: 'There are whispers of ghost ships in the fog... and something far worse lurking in the deep...' }
        ]
    },
    {
        id: 'chapter4',
        triggerDistance: 5000,
        title: 'Chapter IV: The Cursed Seas',
        dialogues: [
            { speaker: 'Cursed Pirate', text: '*cough* Turn back... while ye still can...' },
            { speaker: 'Cursed Pirate', text: 'The Man-o-Wars that patrol these waters answer to no flag. And the ghost ships... they\'re real, captain.' },
            { speaker: 'Cursed Pirate', text: 'But if ye\'re brave \u2014 or foolish \u2014 enough to press on, the legendary treasure of Captain Blacktide awaits...' }
        ]
    },
    {
        id: 'chapter5',
        triggerDistance: 8000,
        title: 'Chapter V: Blacktide\'s Domain',
        dialogues: [
            { speaker: '???', text: 'So... another fool seeks my treasure.' },
            { speaker: 'Captain Blacktide', text: 'I am Blacktide, terror of the seven seas! Even in death, my fleet guards these waters.' },
            { speaker: 'Captain Blacktide', text: 'The Kraken answers my call. Turn back now, or face the abyss!' },
            { speaker: 'Captain Blacktide', text: 'But know this \u2014 defeat my Kraken, and riches beyond imagination shall be yours... if ye survive.' }
        ]
    },
    {
        id: 'chapter6',
        triggerDistance: 12000,
        title: 'Chapter VI: Beyond the Edge',
        dialogues: [
            { speaker: 'Ancient Spirit', text: 'No mortal has ever sailed this far. You have proven yourself worthy, captain.' },
            { speaker: 'Ancient Spirit', text: 'These waters are endless \u2014 the enemies will never stop coming, and they only grow stronger.' },
            { speaker: 'Ancient Spirit', text: 'But so too will your legend grow. Sail on, Corsair. Sail on forever.' }
        ]
    }
];

export class StorySystem {
    constructor() {
        this.completedChapters = new Set();
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this.isShowingDialogue = false;
        this.onDialogueComplete = null;
    }

    checkTriggers(playerDistFromHome) {
        for (const chapter of CHAPTERS) {
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
            this.currentDialogue = null;
            if (this.onDialogueComplete) this.onDialogueComplete();
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
            completedChapters: [...this.completedChapters]
        };
    }

    deserialize(data) {
        if (data && data.completedChapters) {
            this.completedChapters = new Set(data.completedChapters);
        }
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this.isShowingDialogue = false;
    }
}
