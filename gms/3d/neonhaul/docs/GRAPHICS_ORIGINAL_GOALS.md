# Original Neonhaul prompt — recovered for the graphics upgrade

Source: local Claude user history, session `2bb474f2-e878-4838-a8cf-9dba6102b096`, timestamp `1786924275248`. Exact user prompt below. Later settled decisions in DECISIONS.md supersede historical requirements where applicable.

```text
This is a new yru game project. I want you to work on the following as a manager, you will spin up sub-agents (one at a time) to work on the project, or you could spin up a sub-agent to manage an entire section where it spins up its own sub-agents one at at time, where you wait for its results. etc.
I want you to wake yourself every 30mins to ensure everything is still progressing as expected, or if you need to kick things off again. This is likely the loop command, so if you would prefer to run via a loop (if that makes more sense?) do that.
But I need you to keep only a single agent running at a time for 2 reasons: 1. this ensures I keep under the usage limit for a 5hr block, 2. plus gives spare usage for other needs.
Here is the goal:
A cyberpunk city, mobile first. threejs web game. The city is very large and tall. But is in different varients of darkness, daytime should look interesting, but still fairly dark - a tiny bit of daylight might sometimes get through some of the cloud/smog/between the buildings...
But i think it will look awesome if it is a mostly dark atmosphere. This will make the neon lighting etc. look great. So it isn't a dark game, but a dark setting, which allows us to improve performance, buildings should be simple structures, glass/metallic - I want it to look awesome but good on performance.
This high contrast with neon lighting means the buildings can have less detail - but reflections will be good/important.
Find tricks that can make things look amazing for cheap, e.g. we don't need to render anything inside buildings. If it is warranted to do so - we could use a texture or image to show the inside? But most of the windows can be non-seethrough.
First step is to find amazing looking AAA cyber city graphics so we can have our agents use these example images to build against, they should compare them side by side to compare. (open the images you found in a browser so i can check them)
2nd step is to plan, you can have a 2nd agent review the plan.
3rd step is to kick off agents to build. At certain times have a blind agent run (it can run as an additional agent (so while it is running it will be the only time 2 agents can run at the same time). The purpose of the blind agent is to do blind image compares against the source images you found in step 1.
We rank the result (our score vs original AAA source material) - when we finish our first attempt at the game so we have a game we can play test - we can continue to improve - these scores will serve to show where some of the graphics may need improvement.
The game, while looking amazing, is very simple. left finger down to fly/move, right finger down to look around (settings option to flip). flying should feel extremely easy.
The game-play is simple, there will be neon transparent landing/pickup/loading zones (blue/green/yellow etc). You stop (finger off, should auto-stop quickly) in the blue zone, and you get a very sleek looking dock menu/ perhaps have an image (via our local flux) for the person, we will use our local vid gen to give a low res video for a simple looping video (try have it talk for 2s, then reverse play then loop?)
The docking panel should look amazing, as it is the main part of the game. you get to accept deliveries/make deliveries - the delivery payments and any toasts should look part of an overhead hud system, the cockpit/inside vehicle should look great, simple window/huds that float in the air. There will be a simple panel/screen that shows some cool looking speed/current task etc as part of the dashboard.
There should be an awesome looking mini-map. (part of a reer view? only if reer-view works /looks good?)
All vehicles should be futuristic and sleek, mostly black or metal/glass (some reflective surfaces) - very cool looking. Some simple variations between vehicle types would be based on length/height/width of vehicles but the curves are similar on all and any lights on vehicles would be similar except for special ones (e.g. police/etc)
I will be generating some background music in SUNO AI, and some background/foreground radio chatter in SUNO AI. (any foreground chatter should also show in a popup hud? ensure it stays up long enough to be read by slow readers).
Give me the prompt/background chatter/foreground chatter prompt in the original plan document with AAA graphics. it should say spoken word only, lyrics should be a single prompt with simple instructions in [square] brackets, shouted words would be both [Man Shouting] AND CAPITALIZED TEXT.
Also provide some song prompts, I assume some background music without words (instrumental?) may make the majority, but if you think some should have lyrics, provide those as well.
I will likely do the SUNO AI parts toward the end, so just allow it to be plugged in at any time.
simple vehicle sounds and other effects etc. can be generated by your agents.
As manager, you can make all game-play decisions to get us to the first playable state, from there as we continue working we will tweak and discuss anything that needs changing. But until I can play it (so it needs to be committed/pushed into git/pages, so i can try it). there won't be much to discuss, so you make the calls till then.
```
