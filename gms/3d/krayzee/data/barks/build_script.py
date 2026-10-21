#!/usr/bin/env python3
"""Source of data/barks/script.json. Edit lines here, then: python3 data/barks/build_script.py
Tower lines: callsign 'pre' = play the spliced callsign before the body; rwy 'post' = append the active runway clip.
"""
import json, os, re

INTENT_MOOD = {
    'greeting': 'cheery radio hello', 'req_takeoff': 'impatient request', 'req_land': 'breezy radio call',
    'takeoff': 'exhilarated', 'cut_in': 'smug, gleeful', 'queue_jump': 'airily dismissive',
    'apology': 'insincere, offhand', 'insult': 'cheeky taunt', 'retort': 'quick comeback, withering',
    'complain': 'indignant, outraged', 'priority': 'pompous, demanding', 'near_miss': 'startled yelp',
    'landing_brag': 'triumphant, preening', 'go_around': 'grumbling, sulky', 'bump': 'surprised, then amused',
}

VOICE_STYLE = {
    'toff': 'plummy braying RP', 'duchess': 'imperious, frosty grande dame', 'bubba': 'Southern drawl, good-natured',
    'darlene': 'loud sassy Southern twang', 'wingco': 'clipped RAF, jolly', 'geezer': 'cheeky Cockney',
    'sheila': 'brash Aussie, laughing', 'laird': 'gruff Highland Scots', 'heiress': 'bored vocal fry, Valley',
    'comte': 'languid disdainful French', 'baronin': 'clipped stern German', 'tex': 'booming Texas baritone',
    'nan': 'sweet Yorkshire, steel underneath', 'prince': 'breathless nervous posh', 'charmer': 'warm lilting Irish',
}

P = {}
P['toff'] = {
 'greeting': ["Tower, what ho! Rather a splendid day for it.", "Good morning, Tower. Do try to keep up."],
 'req_takeoff': ["Tower, I'd like to take off. Now-ish. Now.", "Ready for departure, old thing. Chop chop."],
 'req_land': ["Tower, landing shortly. Clear the riff-raff, would you?", "Inbound, Tower. Roll out something runway-shaped."],
 'takeoff': ["Tally-ho and up we jolly well go!", "Airborne! Marvellous. Simply marvellous."],
 'cut_in': ["Terribly sorry, old bean. Not sorry at all, actually.", "After me, I think you'll find. Breeding.", "Mind out, there's a good chap. Peerage coming through."],
 'queue_jump': ["Queues are for the post office, darling.", "I say, is this a queue? How quaint."],
 'apology': ["Frightfully sorry, Tower. Won't happen again. It will.", "Sincerest apologies. Put it on Daddy's account."],
 'insult': ["You fly like a startled pheasant, old boy.", "Was that a landing or a cry for help?", "Your plane looks like it was won at a raffle."],
 'retort': ["How dreadfully common of you to say so.", "I'd be offended if I knew who you were.", "Darling, my butler has better comebacks."],
 'complain': ["Tower, someone's pushed in! The absolute cad!", "Tower, I wish to complain. In writing. Gold ink."],
 'priority': ["Do you know who I am? Do write it down.", "I'm fourteenth in line to something, Tower. Priority!"],
 'near_miss': ["Good heavens! I could count their teeth!", "Steady on! That was jolly close!"],
 'landing_brag': ["Down she comes! Applause may now begin.", "Touchdown. One for the history books, what?"],
 'go_around': ["Going round again. How utterly tiresome.", "Round again? I shall be late for luncheon."],
 'bump': ["Boing! Oh, I say!", "Just a little nudge, old sport. Rubber, you know."],
}
P['duchess'] = {
 'greeting': ["Tower. You may address me now.", "Good afternoon. I trust the runway has been swept."],
 'req_takeoff': ["Tower, I shall be departing. Inform the others.", "I am ready. The sky had better be."],
 'req_land': ["Tower, I am descending. Arrange yourselves accordingly.", "I am landing now. Do clear away the commoners."],
 'takeoff': ["Up. As is my right.", "Airborne. Naturally."],
 'cut_in': ["Age before beauty, dear. And I have both.", "Move aside. I was flying before you were invented.", "One does not wait behind a Cessna."],
 'queue_jump': ["I have never queued. I shan't begin today.", "A queue? How tremendously provincial."],
 'apology': ["One is not sorry. One is merely aware.", "Very well. Consider yourself acknowledged."],
 'insult': ["Your landing was simply vulgar.", "I've seen better flying from a tea tray.", "Who let you in? Was it the gardener?"],
 'retort': ["I have outlived better critics than you.", "How sweet. It thinks it may speak to me.", "Hush, dear. The grown-ups are flying."],
 'complain': ["Tower, I have been overtaken. I am appalled.", "Tower, this is intolerable. Fetch your superior."],
 'priority': ["Do you know who I am? I am your betters.", "Tower, I require priority. I always have."],
 'near_miss': ["Good gracious! Insolent little machine!", "I felt that in my pearls."],
 'landing_brag': ["Perfectly done. As always.", "You may now curtsey, Tower."],
 'go_around': ["Round again? This is an outrage.", "I am going around. Someone will pay."],
 'bump': ["How dare that runway touch me.", "Bounced. How undignified. Nobody saw."],
}
P['bubba'] = {
 'greeting': ["Howdy, tower! Y'all ready for some flyin'?", "Mornin', tower. Fired up and full of biscuits."],
 'req_takeoff': ["Tower, I'm fixin' to take off. That alright?", "Ready to go, tower. She's rarin' to fly."],
 'req_land': ["Tower, comin' in hot. Well, warm.", "Tower, bringin' her home. Clear me a spot."],
 'takeoff': ["Yeehaw! Up we go!", "Woo! Look at her climb, Mama!"],
 'cut_in': ["Scuse me, partner, I'm a-squeezin' in!", "Sorry buddy, I was here first. In spirit.", "Hold your horses, I'm landin' right here."],
 'queue_jump': ["Line? I don't see no line.", "Y'all can wait. I got a cookout."],
 'apology': ["Well shoot, my bad, tower. Kinda.", "Sorry 'bout that. Not real sorry, but sorry."],
 'insult': ["You fly like a possum on a pogo stick!", "Bless your heart, was that a landin'?", "My tractor turns tighter than you!"],
 'retort': ["Well ain't you just a big bag of opinions.", "Talk's cheap, partner. So's your plane.", "Heard better trash talk from a raccoon."],
 'complain': ["Tower! Somebody just cut me off!", "Now hold on, tower, that ain't fair!"],
 'priority': ["Do y'all know who I am? Royalty, son!", "Tower, I got priority. Says so on my hat."],
 'near_miss': ["Whoa nelly! That was close!", "Lordy! I seen their fillings!"],
 'landing_brag': ["Greased it! Smooth as gravy!", "Now that's how we land back home!"],
 'go_around': ["Aw, shucks. Round we go again.", "Goin' around. Dagnabbit."],
 'bump': ["Boing! Ha! Do it again!", "Well, that'll buff right out."],
}
P['darlene'] = {
 'greeting': ["Hey tower, sugar! Mama's here!", "Mornin', tower! Y'all miss me?"],
 'req_takeoff': ["Tower, honey, I'm takin' off. Don't wait up.", "Ready to roll, sugar. Let's git."],
 'req_land': ["Tower, I'm comin' down. Clear the porch.", "Landin', hon. Make it pretty for me."],
 'takeoff': ["Wheee! Bye, y'all!", "Up, up and outta here!"],
 'cut_in': ["Move it, sweet pea, Darlene's comin' through!", "Sorry hon, you snooze, you lose!", "Scoot over, darlin'. Mama's landin'."],
 'queue_jump': ["Honey, I don't do lines. I do entrances.", "Y'all were movin' too slow anyhow."],
 'apology': ["Sorry, tower! Ain't nobody perfect, sugar.", "Oops! Well, it happened. Movin' on!"],
 'insult': ["Honey, that plane's uglier than your landin'.", "Bless your heart, you tried.", "Fly much? 'Cause it don't look like it."],
 'retort': ["Oh no you did NOT just say that.", "Sweetie, my cat insults better than that.", "Talk to the tail, darlin'."],
 'complain': ["Tower! Did you SEE that? Rude!", "Tower, that varmint just cut me off!"],
 'priority': ["Do you know who I am? Royalty, sugar!", "Tower, Mama needs priority. Now."],
 'near_miss': ["Lord have mercy! Too close!", "Whoa! Watch your wings, sugar!"],
 'landing_brag': ["Nailed it! Somebody take a picture!", "Smooth as sweet tea, y'all!"],
 'go_around': ["Ugh, round again? Fine.", "Goin' around. Somebody owes me pie."],
 'bump': ["Boing! Oh, that tickled!", "Oopsie! Rubber's a blessin', y'all."],
}
P['wingco'] = {
 'greeting': ["Tower, Wingco here. Spiffing morning for it.", "Morning, Tower! Kettle on?"],
 'req_takeoff': ["Tower, ready for the off. Scramble, what?", "Request takeoff, Tower. Daylight's wasting!"],
 'req_land': ["Tower, returning to base. Pint on the bar, please.", "Coming in, Tower. Wheels down and locked, what."],
 'takeoff': ["Chocks away! Tally-ho!", "Up she goes! Wizard!"],
 'cut_in': ["Bandit at six o'clock! Oh wait, that's me.", "Sorry, old boy, squadron priority!", "Breaking left! Pardon me, chaps!"],
 'queue_jump': ["Queue? We never queued in my day!", "Jumping the line. Bit of initiative, what?"],
 'apology': ["Bit of a prang, Tower. Bad show. Carry on.", "Sorry, Tower. Heat of battle, you understand."],
 'insult': ["You fly like a wet Wednesday, old boy.", "Who taught you to fly, a pigeon?", "That landing was a bally disgrace."],
 'retort': ["Ha! I've been shot at by worse than you.", "Steady, young pup. Some of us have medals.", "Enemy chatter. Ignoring it. Wizard."],
 'complain': ["Tower, some blighter's cut me up!", "Tower, that was simply not cricket!"],
 'priority': ["Do you know who I am? Mentioned in dispatches!", "Tower, I've got medals. Priority, chop chop!"],
 'near_miss': ["Good lord! Nearly took my moustache off!", "Crikey! That was a close shave!"],
 'landing_brag': ["Three-pointer! Textbook, chaps!", "Down and safe. Drinks are on me. Well, on you."],
 'go_around': ["Overshooting. Round again, what a bore.", "Going round. Bad show, bad show."],
 'bump': ["Bounced! Wizard fun!", "Just a scratch, Tower. Carry on."],
}
P['geezer'] = {
 'greeting': ["Alright, tower? Lovely jubbly day for it.", "Wotcha, tower! Miss me?"],
 'req_takeoff': ["Tower, I'm off, yeah? Sweet.", "Ready to go, guv. Gimme the nod."],
 'req_land': ["Tower, comin' in. Put the kettle on.", "Landin' in a sec, tower. Shift yerselves."],
 'takeoff': ["And we're off! Lovely!", "Up we go, sunshine!"],
 'cut_in': ["Shove up, mate, I'm 'avin' that!", "Cheers for the gap, sunshine!", "Oi oi! In I go!"],
 'queue_jump': ["Queue? Nah, mate. Not my style.", "Got a mate on the inside, innit."],
 'apology': ["Sorry, guv. Honest mistake. Ish.", "My bad, tower. Won't 'appen again. Probably."],
 'insult': ["You fly like my nan parks!", "Oi! Learn to fly, you muppet!", "Nice landin'. Was you aimin' for the car park?"],
 'retort': ["Leave it out, mate!", "Yeah? You and whose air force?", "Talk to the 'and, sunshine."],
 'complain': ["Oi, tower! They've pushed in! Out of order!", "Tower, that's well dodgy, that is!"],
 'priority': ["Do you know who I am? Royalty, innit!", "Tower, sort me out first, yeah? I'm proper posh now."],
 'near_miss': ["Blimey! Nearly 'ad me there!", "Cor! That was a bit tasty!"],
 'landing_brag': ["Smooth as you like! Lovely jubbly!", "Did you see that, tower? Pukka!"],
 'go_around': ["Round again? Do me a favour.", "Gutted. Goin' round."],
 'bump': ["Boing! Ha! Proper bouncy!", "Oops! No 'arm done, guv!"],
}
P['sheila'] = {
 'greeting': ["G'day, tower! How's it goin'?", "Mornin', tower! Beaut day, eh?"],
 'req_takeoff': ["Tower, rarin' to go. Righto?", "Ready to rip, tower. Give us the nod."],
 'req_land': ["Tower, comin' in for a landin'. No worries.", "Bringin' her home, tower. Clear the bitumen."],
 'takeoff': ["Yewww! Up we go!", "Bonzer! She's flyin'!"],
 'cut_in': ["Sorry mate, too slow! See ya!", "Budge up, cobber!", "Cheers for the gap, legend!"],
 'queue_jump': ["Queue? Yeah, nah.", "Strewth, this line's longer than a road train."],
 'apology': ["Sorry, tower. She'll be right!", "Whoops! No worries though, eh?"],
 'insult': ["You fly like a drunk galah!", "Mate, my ute handles better than that.", "Fair dinkum, was that a landin'?"],
 'retort': ["Yeah, righto. Cry me a billabong.", "Bit rich comin' from you, eh?", "Settle down, ya drongo."],
 'complain': ["Oi, tower! Some drongo cut me off!", "Tower, that's not on, mate!"],
 'priority': ["Do ya know who I am? Royalty, mate!", "Tower, chuck us to the front, yeah?"],
 'near_miss': ["Crikey! That was close!", "Strewth! Nearly swapped paint there!"],
 'landing_brag': ["Nailed it! Too easy!", "Smooth as a pav, tower!"],
 'go_around': ["Aw, yeah nah. Goin' round.", "Goin' round again. Stone the crows."],
 'bump': ["Boing! Ripper!", "Ha! Bounced like a roo!"],
}
P['laird'] = {
 'greeting': ["Tower. Aye. It's me.", "Mornin', tower. Dreich day for it."],
 'req_takeoff': ["Tower, I'm away. Dinnae argue.", "Ready tae go, tower. Get on wi' it."],
 'req_land': ["Tower, I'm comin' doon. Clear the way.", "Landin' noo, tower. Mind yersel'."],
 'takeoff': ["Up we go, ya beauty!", "Airborne. Grand."],
 'cut_in': ["Shift, ye numpty! Laird comin' through!", "Och, sorry. No really.", "Away ye go, I'm landin' first."],
 'queue_jump': ["I own the land this queue's on.", "Queuin's for other folk."],
 'apology': ["Aye, sorry. Movin' on.", "Sorry, tower. Wasnae me. Well, it was."],
 'insult': ["Ye fly like a wet haggis!", "Ma sheep land better than that.", "Away an' bile yer heid!"],
 'retort': ["Haud yer wheesht.", "Aye? Ah've heard worse at a funeral.", "Ye'll say that tae ma face, will ye?"],
 'complain': ["Tower! Some eejit's cut me up!", "Tower, that's a disgrace, so it is!"],
 'priority': ["D'ye know who I am? I own a mountain!", "Tower, I'm a laird. Priority, noo."],
 'near_miss': ["Jings! That was close!", "Crivvens! Watch where yer goin'!"],
 'landing_brag': ["Smooth as a single malt.", "Landed. Ye may clap."],
 'go_around': ["Round again? Fer cryin' oot loud.", "Goin' round. Ah'm no happy."],
 'bump': ["Boing! Ha! Like a caber!", "Aye, that'll leave a mark. No it won't."],
}
P['heiress'] = {
 'greeting': ["Hi, tower. Ugh. Okay. I'm here.", "Hey tower. Is this thing on? Whatever."],
 'req_takeoff': ["Tower, I'd like to take off. Like, now.", "Can I go yet? I'm literally so bored."],
 'req_land': ["Tower, I'm landing. Make it, like, nice.", "Coming in. Is there valet?"],
 'takeoff': ["Okay, flying. Cute.", "Wheee. Or whatever."],
 'cut_in': ["Oh, were you landing? That's so sad.", "Sorry, not sorry. Literally.", "Um, I'm going first? Obviously?"],
 'queue_jump': ["Lines are so not my thing.", "I don't wait. Daddy says I don't have to."],
 'apology': ["Sorry? I guess? Is that what you want?", "Okay, sorry. Can we move on? Thanks."],
 'insult': ["Your plane is giving discount.", "Um, was that a landing? It was giving crash.", "Ew. Who dressed your plane?"],
 'retort': ["Okay, and? Nobody asked.", "That's cute. Did you think of it yourself?", "Literally don't care. Next."],
 'complain': ["Tower? Someone cut me off? I'm calling Daddy.", "Tower, that was, like, so rude."],
 'priority': ["Do you know who my father is?", "Tower, I have a platinum card. Priority?"],
 'near_miss': ["Oh my God. Like, too close!", "Ew! That almost touched my plane!"],
 'landing_brag': ["Landed. Obviously. You're welcome.", "That was, like, iconic."],
 'go_around': ["Ugh, round again? Seriously?", "Going around. This is so boring."],
 'bump': ["Boing? Okay, that was kind of fun.", "Ew, did I hit something? Gross."],
}
P['comte'] = {
 'greeting': ["Bonjour, tower. You are... adequate.", "Allô, tower. It is I. Rejoice."],
 'req_takeoff': ["Tower, I depart now. It is decided.", "I am ready. Naturellement, I go first."],
 'req_land': ["Tower, I descend. Clear your little runway.", "I am landing. Try to look impressed."],
 'takeoff': ["Et voilà. I fly.", "Magnifique. As always."],
 'cut_in': ["Pardon. No, I am not sorry.", "Excusez-moi. I was always going first.", "After me, peasant. It is tradition."],
 'queue_jump': ["A queue? How very... English.", "I do not queue. I arrive."],
 'apology': ["I apologise. Very well. It is done.", "Sorry? Non. But I say it for you."],
 'insult': ["Your landing is an insult to gravity.", "You fly like a baguette in the wind.", "Quelle horreur. Who taught you, a goose?"],
 'retort': ["Your opinion is noted. And ignored.", "Ah, the peasant speaks. How charming.", "Pfff. I have heard better from a snail."],
 'complain': ["Tower, I have been... overtaken. Unacceptable.", "Tower! This is a scandal! Une catastrophe!"],
 'priority': ["Do you know who I am? Obviously you do not.", "Tower, my family is older than your runway."],
 'near_miss': ["Sacré bleu! Too close!", "Mon Dieu! You nearly ruined my hair!"],
 'landing_brag': ["Perfection. You may weep.", "Like a feather. A French feather."],
 'go_around': ["Again? Quelle tragédie.", "I go around. Under protest."],
 'bump': ["Boing? How undignified.", "Ah. A bounce. It was intentional."],
}
P['baronin'] = {
 'greeting': ["Tower. Good morning. Let us be efficient.", "Tower, I am on frequency. You may begin."],
 'req_takeoff': ["Tower, I am ready. Exactly on schedule.", "Request takeoff. Immediately, please."],
 'req_land': ["Tower, I land in ninety seconds. Precisely.", "Landing now. Clear the runway. Thank you."],
 'takeoff': ["Airborne. As planned.", "Wheels up. Excellent."],
 'cut_in': ["You were too slow. I have corrected this.", "Inefficient. I am going first.", "Move. Your spacing is unacceptable."],
 'queue_jump': ["This queue is badly organised. I fix it.", "I do not wait. Waiting is wasted time."],
 'apology': ["Very well. A small error. It is logged.", "I apologise. Formally. Now we proceed."],
 'insult': ["Your approach was a catastrophe.", "That landing had no discipline.", "Your plane is dirty. And so is your flying."],
 'retort': ["Your opinion is not in the manual.", "I have filed your complaint. In the bin.", "Nein. Simply nein."],
 'complain': ["Tower, I was overtaken. This is not correct.", "Tower, I demand an explanation. In writing."],
 'priority': ["Do you know who I am? I have a schedule.", "Tower, I require priority. This is not a request."],
 'near_miss': ["Achtung! Too close!", "Unacceptable separation! Ridiculous!"],
 'landing_brag': ["Touchdown. Perfect. As calculated.", "On the centreline. Of course."],
 'go_around': ["Going around. Someone will hear about this.", "This is very inefficient."],
 'bump': ["Boing. This was not in the plan.", "A bounce. Annoying. Continuing."],
}
P['tex'] = {
 'greeting': ["Howdy, tower! Big Tex on frequency!", "Mornin', tower! Everything's bigger today!"],
 'req_takeoff': ["Tower, I'm takin' off. Bill me.", "Ready to go, tower. Time is money, son!"],
 'req_land': ["Tower, comin' in. Clear the whole dang runway.", "Landin', tower. I break it, I buy it."],
 'takeoff': ["Yee-haw! Up, up and away!", "Look at her go! Money well spent!"],
 'cut_in': ["Outta my way, I'm late for a merger!", "Sorry, pardner, I bought this slot.", "Make room, big man landin'!"],
 'queue_jump': ["I don't wait in lines. I buy 'em.", "How much for the front of the line? Done."],
 'apology': ["Sorry, tower. Put it on my tab.", "My bad! I'll buy y'all a new tower."],
 'insult': ["You fly like a busted oil derrick!", "Son, my horse flies better than that.", "Cute plane. Come in a cereal box?"],
 'retort': ["Son, I've fired better men than you.", "That's cute. I own your bank.", "Big talk for a little plane!"],
 'complain': ["Tower! That varmint cut me off!", "Tower, I want their licence!"],
 'priority': ["Do you know who I am? I own Texas!", "Tower, I'll buy the airport. Priority!"],
 'near_miss': ["Whoa, doggie! That was close!", "Holy smokes! Watch it, partner!"],
 'landing_brag': ["Smooth as a Cadillac! Hoo-wee!", "That's how we do it in Texas!"],
 'go_around': ["Goin' round! Waste of good fuel.", "Round again. Somebody's fired."],
 'bump': ["Boing! Ha! Do that again!", "Bounced! Bill the rubber company!"],
}
P['nan'] = {
 'greeting': ["Hello, tower, love. Have you eaten?", "Morning, pet. Nana's on the radio."],
 'req_takeoff': ["Tower, love, I'm going now. Be a dear.", "Ready, petal. Don't keep Nana waiting."],
 'req_land': ["Coming in, love. Shift those planes, there's a dear.", "Nana's landing. Make some room, pet."],
 'takeoff': ["Ooh, up we go! Lovely!", "Off we pop! Hold on to your hats!"],
 'cut_in': ["Shift, love, or I'll tell your mother.", "Sorry, petal. Nana goes first.", "Mind out, love. I've a casserole in."],
 'queue_jump': ["Queue? At my age? Don't be daft.", "I've waited seventy years. That'll do."],
 'apology': ["Sorry, love. Now we'll say no more about it.", "Oh dear. Well. These things happen, pet."],
 'insult': ["Ooh, bless. You'll get the hang of it. Never.", "My cat lands better than that, love.", "That landing would shame a pigeon, petal."],
 'retort': ["I'll remember that, love. I remember everything.", "Watch your tone with me, petal.", "That's nice, dear. Now hush."],
 'complain': ["Tower, that one pushed in. I'll be writing.", "Tower, love, they've cut in. Sort it."],
 'priority': ["Do you know who I am? I'm somebody's nan!", "Let Nana through, love. I've a bad hip."],
 'near_miss': ["Ooh! Nearly lost my teeth!", "Eeh, that were close, love!"],
 'landing_brag': ["There we are. Not a cup spilled.", "Lovely. Who wants a biscuit?"],
 'go_around': ["Round again? Ooh, me nerves.", "Going round, love. I'm not best pleased."],
 'bump': ["Ooh! Boing! Like a bouncy castle!", "Oops. Nana's fine, love."],
}
P['prince'] = {
 'greeting': ["Oh! Um, hello, tower. Is this the button?", "Hello! Sorry. Hello. It's me. Sorry."],
 'req_takeoff': ["Um, tower? Might I possibly take off?", "Ready, I think. Probably. Tower?"],
 'req_land': ["Tower, I'm, um, landing. Hopefully.", "Coming in! Oh gosh. Coming in!"],
 'takeoff': ["Oh gosh! We're up! We're actually up!", "Flying! Mummy, I'm flying!"],
 'cut_in': ["Oh no, sorry, I didn't mean to, sorry!", "Is it all right if I just, um, go first?", "Coming through! Sorry! Royal! Sorry!"],
 'queue_jump': ["Oh! I've skipped the queue. Is that allowed?", "Sorry, everyone! Mummy said I could!"],
 'apology': ["Terribly sorry! Was that me? It was me.", "Oh gosh, sorry, sorry, sorry!"],
 'insult': ["You're, um, quite bad at this! Sorry.", "That was a rubbish landing! Gosh, I said it.", "Your plane is, um, silly looking. There."],
 'retort': ["That's, um, rather unkind!", "Well! I'm telling Mummy.", "I know you are, but what am I?"],
 'complain': ["Tower! Someone's pushed in! Is that allowed?", "Um, tower? I've been cut off. Rather rude."],
 'priority': ["Do you know who I am? Neither do I, really!", "Tower, I'm sort of royal? Priority, please?"],
 'near_miss': ["Aaah! Too close! Too close!", "Oh gosh oh gosh oh gosh!"],
 'landing_brag': ["I landed! I actually landed! Did you see?", "Down! Alive! Hooray!"],
 'go_around': ["Going around! Oh dear. Again.", "Round again! Sorry, everyone!"],
 'bump': ["Boing! Oh! Am I dead? No!", "Sorry! Sorry! Bounced!"],
}
P['charmer'] = {
 'greeting': ["Top of the morning, tower. You sound lovely.", "Ah, tower, what a pleasure to hear you."],
 'req_takeoff': ["Tower, would you be a darlin' and let me go?", "Ready when you are, my love. Or before."],
 'req_land': ["Tower, I'm coming in. Save me a dance.", "Landing shortly, darlin'. Clear a spot."],
 'takeoff': ["Up we go, God love her!", "And away! Grand stuff!"],
 'cut_in': ["Ah, sorry now. You don't mind, sure you don't?", "Just slipping in there, God bless.", "After me, pet. Sure it's only manners."],
 'queue_jump': ["Sure the queue'll still be there tomorrow.", "Ah, I'll only be a minute."],
 'apology': ["Ah, tower, how could you stay mad at me?", "Sorry from the bottom of me heart. Mostly."],
 'insult': ["You fly like a sheep in a hurricane.", "Lovely landing. For a sack of spuds.", "God love you, you're trying your best."],
 'retort': ["Ah, sure you don't mean that.", "Grand. I'll pray for your landings.", "Sweet talk won't work on me, darlin'."],
 'complain': ["Tower, that eejit's cut in on me!", "Tower, that's a bit much, now."],
 'priority': ["Do you know who I am? Everyone does, darlin'.", "Tower, a little priority for your favourite?"],
 'near_miss': ["Jaysus! That was close!", "Mother of God, too close!"],
 'landing_brag': ["Soft as a kiss, tower.", "Landed! Pint, anyone?"],
 'go_around': ["Round again? Ah, go on then.", "Going around. Story of me life."],
 'bump': ["Boing! Ah, that's grand!", "Bounced! Lucky I'm handsome."],
}

# D14: the tower calls itself "C-Tower <n>", one number per airport. Welcome lines carry {TOWER}; each airport gets its own
# set (airport 1 keeps ids <voice>.welcome.N; airport n>1 gets <voice>.welcome_a<n>.N, intent 'welcome', airport: n).
# TTS reads "See Tower One" (a bare "C" gets spelt or dropped); the subtitle says "C-Tower 1".
AIRPORTS = [1]
NUM_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']


def tower_name(n):
    return f'C-Tower {n}', f'See Tower {NUM_WORDS[n] if n < 10 else n}'


# Tower: (intent, tier|None, text, callsign 'pre'|None, rwy 'post'|None)
ROUTINE = ['taxi', 'hold_short', 'lineup', 'clear_takeoff', 'clear_land', 'go_around', 'traffic',
           'sequence_1', 'sequence_2', 'sequence_3', 'sequence_4', 'extend', 'vacate', 'welcome',
           'impeccable', 'crown_change', 'scandal']
NO_CS = {'welcome', 'crown_change'}
RWY = {'clear_takeoff', 'clear_land'}
TOWER_STYLE = {'tower_m': 'calm male controller, weary', 'tower_f': 'icy precise female controller', 'tower_trainee': 'eager nervous young trainee'}
TIER_DELIVERY = {1: 'calm, professional', 2: 'strained, over-precise', 3: 'cracking, sarcastic, voice wobbling', 4: 'shouting then catching themselves'}
TRAINEE_TIER = {1: 'polite, uncertain', 2: 'flustered, rushing', 3: 'panicking, high-pitched', 4: 'full panic, near tears'}

T = {}
T['tower_m'] = {
 'taxi': ["taxi to holding point Alpha One, via Alpha.", "taxi via Alpha to the holding point. Gently."],
 'hold_short': ["hold short of the runway.", "hold short. That means stop. Before the runway."],
 'lineup': ["line up and wait.", "line up and wait. And wait. Please wait."],
 'clear_takeoff': ["wind calm, cleared for takeoff,", "cleared for takeoff,"],
 'clear_land': ["cleared to land,", "wind light and variable, cleared to land,"],
 'go_around': ["go around, I say again, go around.", "go around. Climb straight ahead."],
 'traffic': ["traffic, twelve o'clock, half a mile, same level.", "traffic on your left, very close, very royal."],
 'sequence_1': ["number one, continue approach."], 'sequence_2': ["number two, follow the traffic ahead."],
 'sequence_3': ["number three, follow the traffic ahead."], 'sequence_4': ["number four. Make yourself comfortable."],
 'extend': ["extend downwind, I'll call your base.", "extend downwind. Enjoy the view."],
 'vacate': ["vacate next left, taxi to stand.", "vacate when able. Welcome home."],
 'welcome': ["{TOWER}, good morning all stations. Nice and calm today.", "{TOWER} is open. Please. Just once. By the book."],
 'impeccable': ["lovely landing. Genuinely. I'm writing it down.", "that was textbook. I may frame it."],
 'crown_change': ["All stations. New monarch. Long may they... whatever.", "All stations, the Crown has changed hands. Heaven help us."],
 'scandal': ["return to stand immediately. The press are on line two.", "taxi straight to stand. The Palace has phoned."],
}
T['tower_f'] = {
 'taxi': ["taxi to holding point via Alpha. Read back.", "taxi Alpha to the holding point. Don't improvise."],
 'hold_short': ["hold short of the runway.", "hold short. I'll be watching."],
 'lineup': ["line up and wait.", "line up and wait. Emphasis on wait."],
 'clear_takeoff': ["cleared for takeoff,", "surface wind light, cleared for takeoff,"],
 'clear_land': ["cleared to land,", "surface wind light, cleared to land,"],
 'go_around': ["go around. Now.", "go around, climb straight ahead. No discussion."],
 'traffic': ["traffic, two o'clock, converging. Act on it.", "traffic closing. I'd turn, if I were you."],
 'sequence_1': ["number one. Don't waste it."], 'sequence_2': ["number two. Follow the traffic ahead."],
 'sequence_3': ["number three. Follow the traffic."], 'sequence_4': ["number four. Patience is a royal virtue."],
 'extend': ["extend downwind. I'll call your base.", "extend downwind. Think about what you've done."],
 'vacate': ["vacate next exit, taxi to stand.", "vacate promptly. Others have places to be."],
 'welcome': ["{TOWER}. All stations, standard procedures apply. Without exception.", "{TOWER}. Good afternoon. Behave."],
 'impeccable': ["acceptable landing. Very acceptable.", "that was correct. I'm as surprised as you are."],
 'crown_change': ["All stations. New monarch. Same rules.", "All stations. The Crown has moved. The runway has not."],
 'scandal': ["return to stand. The Herald would like a word.", "taxi to stand immediately. Your flight is under review."],
}
T['tower_trainee'] = {
 'taxi': ["um, taxi via Alpha to the... holding point! Yes!", "taxi via Alpha, please! Have a lovely taxi!"],
 'hold_short': ["hold short of the runway, please! Thank you!", "um, hold short? Yes. Hold short."],
 'lineup': ["line up and wait! Ooh, exciting!", "line up and... wait. Wait for me. Sorry."],
 'clear_takeoff': ["cleared for takeoff! Have fun!", "you're, um, cleared for takeoff,"],
 'clear_land': ["cleared to land! Good luck!", "cleared to land, I think,"],
 'go_around': ["go around! Go around! Sorry! Go around!", "um, please go around? Thank you so much!"],
 'traffic': ["traffic! Somewhere! Near you! Look out!", "there's traffic, um, quite close? Ish?"],
 'sequence_1': ["you're number one! Congratulations!"], 'sequence_2': ["number two! Follow the plane in front!"],
 'sequence_3': ["number three! Nearly there!"], 'sequence_4': ["number four! Sorry!"],
 'extend': ["extend downwind, please! I'll call you! Probably!", "um, could you extend downwind? Thanks!"],
 'vacate': ["vacate the runway, please! Brilliant landing!", "vacate when you can! Lovely!"],
 'welcome': ["Hi! {TOWER}! It's Toby! First week!", "{TOWER}, good morning! I've got my cards!"],
 'impeccable': ["wow! That was amazing! Can I have your autograph?", "perfect landing! I'm telling Gerald!"],
 'crown_change': ["Everyone! There's a new king! Or queen! Hooray!", "All stations! New monarch! Should I bow?"],
 'scandal': ["um, the newspaper's here? Please go to your stand?", "the Palace is on the phone! For you! Stand, please!"],
}

SCOLD_GROUPS = ['scold_queue', 'scold_takeoff', 'scold_cut', 'scold_runway', 'scold_landing', 'scold_buzz',
                'scold_near_miss', 'scold_bump', 'scold_generic', 'reply_priority']
S = {}
S['tower_m'] = {
 'scold_queue': ["you were number four. Return to the holding point.", "there is a queue. You're not at the front.", "That's the third time! The queue is not a suggestion!", "THE QUEUE! Respect the... sorry. Sorry. Hold position."],
 'scold_takeoff': ["you are not cleared for takeoff. Stop, please.", "nobody said takeoff. I'd remember saying takeoff.", "Did I say takeoff? Did anyone hear me say takeoff?", "I have NOT cleared... oh, they've gone. They've just gone."],
 'scold_cut': ["you've cut in on traffic. Extend and re-sequence.", "there was an aircraft there. I saw you see it.", "You cut in on final! My tea's gone cold!", "AAARGH! I mean... traffic noted. Fine. Everything's fine."],
 'scold_runway': ["vacate the runway immediately, traffic on final.", "that runway was occupied. By someone who asked.", "It's not your runway! It's a shared runway!", "GET OFF MY RUNWAY! ...Apologies. Please vacate."],
 'scold_landing': ["that was not the runway. Please note for next time.", "that was very much not the runway.", "You landed on... that's not... we HAVE runways! Two!", "Why do I bother painting numbers on them? WHY?"],
 'scold_buzz': ["you are too close to the tower. Climb immediately.", "please stop buzzing the tower. My owls are falling over.", "I can see your face! I can see your FACE!", "That's it, I'm under the desk. Owl down. Owl down."],
 'scold_near_miss': ["traffic alert. Increase separation immediately.", "that was far too close. Again.", "You nearly shared a cockpit! Separation! Look it up!", "My heart. My actual heart. Please. Separation."],
 'scold_bump': ["report damage, if any.", "did you just bounce off another aircraft?", "Stop bouncing off things! This isn't a fairground!", "Boing. Boing. Thirty-one years. Boing."],
 'scold_generic': ["please follow instructions.", "I'll say that again. Slowly.", "I'm very calm. I'm very, very calm.", "Somebody bring me a biscuit. A big one."],
 'reply_priority': ["noted. You're still number three.", "I know exactly who you are. That's the problem.", "I don't care if you're royalty! Wait! Everyone's royalty!", "EVERYONE is royal! EVERYONE! Hold short!"],
}
S['tower_f'] = {
 'scold_queue': ["you are not first. Hold position.", "the queue has an order. You're not first in it.", "How fascinating. Hold. Position.", "I am perfectly calm. HOLD. POSITION."],
 'scold_takeoff': ["takeoff clearance not issued. Stop immediately.", "you were not cleared. I'm noting the time.", "I didn't clear you. I never will.", "Unbelievable. Truly. I'm writing a book."],
 'scold_cut': ["you've cut in on traffic. Extend downwind.", "you've cut in. Again. Extend. Downwind.", "So smoothly done. I'm almost impressed. Almost.", "THAT WAS... I'm fine. You're number six. Number SIX."],
 'scold_runway': ["runway occupied. Exit immediately.", "that runway is in use. By someone who asked.", "Get. Off. My. Runway. Please.", "I have never raised my voice. GET OFF IT!"],
 'scold_landing': ["that was not a runway. Taxi to stand.", "an unusual choice of surface. Recorded.", "How creative. The paperwork will be enormous.", "There are NUMBERS on the runways! BIG ones!"],
 'scold_buzz': ["too low near the tower. Climb now.", "my tea has ripples in it. Climb.", "I could read your registration without binoculars.", "I CAN SEE YOUR NOSTRILS! Climb!"],
 'scold_near_miss': ["traffic alert. Turn away now.", "separation is not a suggestion.", "Close enough to exchange business cards.", "I'm going to count to ten. One. TWO."],
 'scold_bump': ["contact noted. Report your status.", "you've bounced off another aircraft. Lovely.", "The rubber was not invented for this purpose.", "Stop BOUNCING! Everyone stop bouncing!"],
 'scold_generic': ["comply with instructions.", "I'll repeat that for the hard of listening.", "I'm smiling. It's not a nice smile.", "I'm taking my break. Early. Forever."],
 'reply_priority': ["you are an aircraft. Hold short.", "everyone on this frequency is somebody.", "I don't care who you are. That's rather the point.", "I KNOW who you are! EVERYONE knows! HOLD!"],
}
S['tower_trainee'] = {
 'scold_queue': ["um, I don't think you're first? Hold, please?", "there's a queue! It's on my card! Queue!", "Oh no, oh no, the queue's all wrong now!", "I've dropped my cards! Everyone just go! No! Don't go!"],
 'scold_takeoff': ["um, you're not cleared? I don't think? Let me check.", "nobody's cleared! I haven't cleared anybody!", "You're taking off! Why are you taking off?!", "I'm going to get fired in my first week!"],
 'scold_cut': ["um, was there a gap there? There wasn't a gap.", "you've cut in! That's not on my card!", "Go around? Someone go around! Anyone!", "I want my mum!"],
 'scold_runway': ["um, the runway's busy? Sorry. Please leave it?", "two planes on one runway! That's one too many!", "Get off! Please! Pretty please!", "AAAAH! Okay. Okay. Breathing. Breathing."],
 'scold_landing': ["um, that's not the runway? Is it? Let me check.", "that's not the runway! It's definitely not runway!", "Where are you landing?! Where are you GOING?!", "Gerald! GERALD! Come back!"],
 'scold_buzz': ["you're quite low? Near me? Hello?", "too close! I can see you waving!", "You're going to hit the... oh, you missed. Phew!", "I'm under the desk! Over! Under the desk!"],
 'scold_near_miss': ["um, traffic? Quite close traffic?", "you nearly hit each other! Separation! It's a rule!", "My laminated card says this shouldn't happen!", "I've laminated my resignation! Over!"],
 'scold_bump': ["oh! You bounced! Are you okay?", "stop bumping! Please!", "Everyone's bouncing! It's like a bouncy castle!", "Nobody told me about the bouncing!"],
 'scold_generic': ["um, could you follow instructions? Thanks!", "please? Please do what I say?", "I'm doing my best! Are you doing your best?", "I'm going to cry. On frequency. Sorry."],
 'reply_priority': ["oh! Yes! Very important! Still hold short, though?", "everyone says that! Everyone's important!", "I don't know who anyone is! I'm new!", "You're all royalty! I'm just Toby!"],
}

# Callsign splice clips, generated by each tower voice. Titles read with level "list" intonation, digits as one list read then cut.
SPLICE_TITLES = ['baron', 'baroness', 'viscount', 'viscountess', 'earl', 'countess', 'marquess', 'marchioness', 'duke', 'duchess',
                 'archduke', 'archduchess', 'prince', 'princess', 'crown_prince', 'crown_princess', 'king', 'queen', 'emperor', 'empress',
                 'majesty', 'highness', 'grace']
DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner']
RWYS = {'09': 'runway zero niner.', '27': 'runway two seven.', '04': 'runway zero four.', '22': 'runway two two.'}


# TTS-only spelling: the clone reads spelling, not intent, so accents survive only when spelled (docs/VOICES.md).
# `text` stays the subtitle (RADIO shows `text`); `say` is what the TTS reads; `subtitle` repeats `text` when they differ.
_TH = [(r'\bthe\b', 'ze'), (r'\bthis\b', 'zis'), (r'\bthat\b', 'zat'), (r'\bthey\b', 'zey'), (r'\bthem\b', 'zem'),
       (r'\bthere\b', 'zere'), (r'\bwith\b', 'wiz'), (r'\bthink\b', 'sink'), (r'\bthank\b', 'sank')]
ACCENT = {
    'comte': _TH + [(r'\bit\b', 'eet'), (r'\bis\b', 'eez'), (r'\bhave\b', "'ave"), (r'\bhair\b', "'air"),
                    (r'\bhorror\b', "'orror"), (r'\bheard\b', "'eard"), (r'\bvery\b', 'verry'), (r'\bweep\b', 'weeep'),
                    (r'\bhow\b', "'ow"), (r'\b(\w{3,})ing\b', r'\1eeng')],
    'baronin': _TH + [(r'\bwe\b', 've'), (r'\bwas\b', 'vas'), (r'\bwere\b', 'vere'), (r'\bwill\b', 'vill'), (r'\bwhat\b', 'vat'),
                      (r'\bwait\b', 'vait'), (r'\bwaiting\b', 'vaiting'), (r'\bwasted\b', 'vasted'),
                      (r'\bwheels\b', 'veels'), (r'\bwriting\b', 'vriting'), (r'\bway\b', 'vay'),
                      (r'\brunway\b', 'runvay'), (r'\bhave\b', 'haff'), (r'\bgood\b', 'goot'), (r'\band\b', 'und'),
                      (r'\bis\b', 'iss'), (r'\bschedule\b', 'shedule'), (r'\bvery\b', 'fery'),
                      (r'\bseconds\b', 'zeconds'), (r'\bsimply\b', 'zimply')],
    # Scots: Qwen reads nae/heid/tae as English words; spell the sound instead. Light.
    'laird': [(r'nae\b', 'nay'), (r'\bheid\b', 'heed'), (r'\btae\b', 'tay'), (r'\bwi\'', 'wee')],
    # Cockney: th-fronting and a dropped t, lightly.
    'geezer': [(r'\bAlright\b', 'Awright'), (r'\bwith\b', 'wiv'), (r'\bthink\b', 'fink'), (r'\bnothing\b', 'nuffin'),
               (r'\bLittle\b', 'Li\'l'), (r'\bGot a\b', 'Go\' a'), (r'\bWotcha\b', 'Wotcher'),
               (r'\bout of order\b', 'aht of order')],
}


def accented(voice, text):
    out = text
    for pat, rep in ACCENT.get(voice, []):
        def sub(m, rep=rep):
            r = m.expand(rep)
            return r[:1].upper() + r[1:] if m.group(0)[:1].isupper() else r
        out = re.sub(pat, sub, out, flags=re.I)
    return out


# Manual-listen notes, carried into barks.json as a 'listen' flag.
REVIEW = {'cs_title_marchioness': 'tower_m: re-heard alone as "Martian S" (fine in the list read); listen before shipping'}


def secs(text):
    words = len(re.findall(r"[\w'’-]+", text))
    return round(min(4.5, 0.6 + words / 2.9), 1)


def main():
    out = []
    for v, intents in P.items():
        for intent, lines in intents.items():
            for i, t in enumerate(lines, 1):
                e = {'id': f'{v}.{intent}.{i}', 'voice': v, 'intent': intent, 'text': t,
                     'delivery': f'{INTENT_MOOD[intent]}; {VOICE_STYLE[v]}; radio-clipped', 'maxSeconds': secs(t)}
                s = accented(v, t)
                if s != t: e['say'] = s; e['subtitle'] = t
                out.append(e)
    for v in T:
        for n in AIRPORTS:
            sub_name, say_name = tower_name(n)
            for i, t in enumerate(T[v]['welcome'], 1):
                e = {'id': f'{v}.welcome.{i}' if n == 1 else f'{v}.welcome_a{n}.{i}', 'voice': v, 'intent': 'welcome',
                     'airport': n, 'text': t.replace('{TOWER}', sub_name), 'say': t.replace('{TOWER}', say_name),
                     'delivery': f'{TOWER_STYLE[v]}; standard ATC cadence', 'maxSeconds': secs(t.replace('{TOWER}', say_name))}
                e['subtitle'] = e['text']
                out.append(e)
        for intent in ROUTINE:
            if intent == 'welcome': continue
            for i, t in enumerate(T[v][intent], 1):
                e = {'id': f'{v}.{intent}.{i}', 'voice': v, 'intent': intent, 'text': t,
                     'delivery': f'{TOWER_STYLE[v]}; standard ATC cadence', 'maxSeconds': secs(t)}
                if intent not in NO_CS: e['callsign'] = 'pre'
                if intent in RWY: e['rwy'] = 'post'
                out.append(e)
        tiers = TRAINEE_TIER if v == 'tower_trainee' else TIER_DELIVERY
        for g in SCOLD_GROUPS:
            for tier, t in enumerate(S[v][g], 1):
                e = {'id': f'{v}.{g}.t{tier}', 'voice': v, 'intent': g, 'tier': tier, 'text': t,
                     'delivery': f'{tiers[tier]}; {TOWER_STYLE[v]}', 'maxSeconds': secs(t)}
                if tier <= 2: e['callsign'] = 'pre'
                out.append(e)
        for w in SPLICE_TITLES:
            e = {'id': f'{v}.cs_title_{w}', 'voice': v, 'intent': 'splice_title', 'text': w.replace('_', ' ').title(),
                 'delivery': 'level list intonation, no final fall, crisp', 'maxSeconds': 1.2}
            if f'cs_title_{w}' in REVIEW: e['review'] = REVIEW[f'cs_title_{w}']
            out.append(e)
        for d in DIGITS:
            out.append({'id': f'{v}.cs_digit_{d}', 'voice': v, 'intent': 'splice_digit', 'text': d.title(),
                        'delivery': 'flat ATC digit, cut from one list read', 'maxSeconds': 0.6})
        for k, t in RWYS.items():
            out.append({'id': f'{v}.rwy_{k}', 'voice': v, 'intent': 'splice_rwy', 'text': t,
                        'delivery': 'ATC cadence, sentence-final fall', 'maxSeconds': 1.6})

    ids = [e['id'] for e in out]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    long = [e for e in out if e['maxSeconds'] > 4.2]
    for e in long: print('LONG', e['id'], e['text'])
    doc = {
        'version': 1,
        'notes': 'Generated by build_script.py. callsign:"pre" = play [title][digit][digit] splice before the body; '
                 'rwy:"post" = append rwy_<active>. Pilot lines never contain names. Subtitles add names.',
        'pilotIntents': list(INTENT_MOOD), 'towerRoutine': ROUTINE, 'towerScolds': SCOLD_GROUPS,
        'lines': out,
    }
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'script.json'), 'w') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    from collections import Counter
    c = Counter(e['voice'] for e in out)
    for v, n in c.items(): print(v, n)
    print('total', len(out))


if __name__ == '__main__':
    main()
