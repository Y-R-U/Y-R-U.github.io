import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
cast={
 'crumb':{'name':'Crumb','description':'A tired adult British male infantryman with a low, slightly gravelly London voice. Dry sarcasm, understated comic timing, conversational and clearly spoken. Not shouting.','reference':'Right then. Another glorious morning in a field nobody wanted. I suppose we had better look busy before the general gets ideas.'},
 'spud':{'name':'Spud','description':'A cheerful adult male soldier from Yorkshire in northern England. Broad warm middle-low voice, friendly regional accent, enthusiastically dim and slightly mischievous. Clear, conversational comic delivery.','reference':'Oh, lovely! A walk in the countryside, fresh air, and somebody else doing the paperwork. Do you reckon there will be sandwiches?'},
 'peas':{'name':'Peas','description':'An adult British male clerk turned soldier, with a crisp precise middle-pitched voice and educated southern English accent. Fastidious, deadpan, mildly irritated, dry intelligent comedy. Clear natural speech.','reference':'I have checked the orders twice. They are still ridiculous. For the record, this was not covered during the induction.'},
 'titch':{'name':'Titch','description':'A young adult male Scottish soldier with a light, higher-pitched voice and a gentle Edinburgh accent. Quick nervous wit, brave but apprehensive, expressive conversational delivery. Clearly spoken, not whispering.','reference':'Aye, I am coming. Just checking whether that bush is armed. You can never be too careful with the local scenery.'},
 'general':{'name':'Headquarters','description':'A pompous older British male army general with a rich rounded baritone and exaggerated upper-class received pronunciation. Cheerful confidence completely unearned. Dry absurd comedy, clipped authoritative radio announcements.','reference':'Splendid work, gentlemen. Headquarters has reviewed the situation and decided that the situation is somebody else\'s problem. Carry on.'},
 'biscuit':{'name':'Inspector Biscuit','description':'A fussy middle-aged British male tea inspector, with a nasal higher-mid voice, precise upper-class pronunciation and indignant theatrical delivery. Pompous, officious, comically concerned about tea.','reference':'I am here to inspect the tea, not the artillery. Kindly point those unpleasant things away from my biscuits. Standards must be maintained.'}
}
scripts={
'crumb':{
 'move':['Yes, sir. Lovely place to get shot.','Marching. Under protest.','Another inspirational bit of grass.'],
 'hold':['Holding. My favourite speed.','Fine. I will guard this particular mud.'],
 'join':['Back with the idiots. Missed you.'],
 'rifle':['Rifle it is. The boring end faces me.'],
 'grenade':['Grenades. Management has stopped pretending.'],
 'flamer':['Subtlety has left the building.'],
 'arm':['Pin out. Try not to supervise too closely.','Explosive suggestion incoming.'],
 'cancel':['Good. A rare outbreak of common sense.'],
 'kill':['He has clocked off.','That is one complaint resolved.'],
 'hurt':['Oi! That is government property.'],
 'fire':['I am not a bloody campfire!'],
 'friendly':['Same side, you absolute teapot!'],
 'blocked':['Lovely destination. Shame about the forest.'],
 'idle':['I could be at home disappointing my wife.','Do we get overtime for standing here?','This war could have been a strongly worded letter.','I joined for the boots. They squeak.']},
'spud':{
 'move':['Coming! Is this the way to lunch?','Right you are. Tactical ambling.','Ooh, new mud!'],
 'hold':['Staying put. Born for this.','I will keep an eye on the scenery.'],
 'join':['The gang is back! Terrible news for everyone.'],
 'rifle':['Pointy end forwards. Got it.'],
 'grenade':['Pocket fireworks! Lovely.'],
 'flamer':['Who ordered the extra crispy forest?'],
 'arm':['Special delivery! No returns!','Catch! Actually, please do not.'],
 'cancel':['Aw. I had my throwing face on.'],
 'kill':['That worked! Nobody look surprised.','Oh dear. He has dropped everything.'],
 'hurt':['Ow! That was my favourite bit!'],
 'fire':['Too crispy! Too crispy!'],
 'friendly':['Oi! I am the friendly idiot!'],
 'blocked':['Cannot get through. Tree says no.'],
 'idle':['Anyone else thinking about potatoes?','I have named that tree Gerald.','If we win, can I keep the helmet?','Lovely day. Apart from the war bit.']},
'peas':{
 'move':['Relocating the administrative error.','A bold strategy. Is there a second page?','Very well. I have noted my objections.'],
 'hold':['Holding. Finally, an efficient order.','I shall inventory the bullets as they arrive.'],
 'join':['Rejoining this organisational failure.'],
 'rifle':['Standard issue. Standard disappointment.'],
 'grenade':['An argument with a three-second conclusion.'],
 'flamer':['That will invalidate the warranty.'],
 'arm':['Please stand outside the complaint radius.','Preparing a strongly explosive memo.'],
 'cancel':['Amendment accepted. Limbs retained.'],
 'kill':['File closed. Permanently.','A small reduction in paperwork.'],
 'hurt':['That goes in the incident report.'],
 'fire':['This is not regulation heating!'],
 'friendly':['Check the helmet colour, you muppet!'],
 'blocked':['The route exists only in your imagination.'],
 'idle':['I have calculated our odds. Would you prefer a biscuit?','Our strategy appears to be enthusiastic trespassing.','The map says scenic. The map is a liar.','I am billing this as a team-building exercise.']},
 'titch':{
 'move':['Aye. Terrible idea. On my way.','Legs first, courage later.','Right behind you. Metaphorically.'],
 'hold':['Not moving? Best order all day.','I will stay here and look difficult to hit.'],
 'join':['Wait for me, you oversized targets!'],
 'rifle':['Right. The sensible bad idea.'],
 'grenade':['This wee thing seems awfully confident.'],
 'flamer':['We have brought a barbecue to a war.'],
 'arm':['Little present! Big feelings!','Throwing! Everybody be somewhere else!'],
 'cancel':['Aye. Let us keep all the fingers.'],
 'kill':['I meant to do that. Mostly.','Down he goes. Up goes my pulse.'],
 'hurt':['Oi! There is hardly any of me!'],
 'fire':['My trousers have declared independence!'],
 'friendly':['Friendly fire is a rubbish name for this!'],
 'blocked':['That tree has seniority, apparently.'],
 'idle':['If I stand very still, can I be scenery?','I have a cunning plan. It involves going home.','Do you think the enemy gets better tea?','I am not nervous. I am vibrating tactically.']},
 'general':{
 'brief0':['Take the clearing. We have already printed the flag.'],
 'brief1':['Hold the tea position. The mortar is still on back order.'],
 'brief2':['Push north. Negotiate with the forest using grenades.'],
 'brief3':['Intelligence promises a shortcut. Do try to act surprised.'],
 'brief4':['Protect the tea inspector. Losing him means two inspectors.'],
 'brief5':['Hold until the kettle boils. This is not a metaphor.'],
 'deploy':['Off you pop. I shall command from somewhere upholstered.','Good luck, gentlemen. Do keep the receipts.'],
 'wave':['More volunteers for the opposing argument.','Enemy reinforcements. How terribly clingy.'],
 'last':['One helmet left. Make it look like several.'],
 'loss':['A vacancy has opened in the optimism department.','Headquarters regrets the inconvenience to his hat.'],
 'win':['Splendid. I shall accept full responsibility for your success.','Victory! Put the expensive bits back in the box.'],
 'defeat':['A valuable lesson. Unfortunately, none of you are available to learn it.','We shall describe this as an aggressive personnel reduction.'],
 'complete':['The war is won. The tea is cold. History will omit the second part.'],
 'upgrade':['Excellent purchase. Practically a survival policy.'],
 'barracks':['Fresh kit, same questionable leadership.'],
 'forest':['The forest has been promoted to kindling.'],
 'time':['Time is running short. Unlike the expense report.']},
 'biscuit':{
 'arrival':['Inspector Biscuit. I trust this is the queue for tea.'],
 'idle':['These explosions are bruising the biscuits.','I shall be mentioning all of this in my review.'],
 'lost':['You cannot leave me here! I am a department!'],
 'hurt':['I am deducting a star for this!']}
}
clips=[]
for voice,events in scripts.items():
 for event,lines in events.items():
  for n,text in enumerate(lines):clips.append({'id':f'{voice}-{event}-{n+1:02d}','voice':voice,'event':event,'text':text})
(ROOT/'tools/voice-source/script.json').write_text(json.dumps({'cast':cast,'clips':clips},indent=2)+'\n')
print(f'{len(cast)} voices, {len(clips)} clips')
