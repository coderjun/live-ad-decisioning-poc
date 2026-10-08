# Program clip prompts

The live stream is a fictional 24/7 channel, "The Network", that rotates
through seven short program segments. Each segment sets up one ad break in
`data/breaks.json`, so the clip only has to show what that break's
`preceding_context` describes. The app loops them into a live HLS stream and
marks each break with SCTE-35 style cues (`#EXT-X-CUE-OUT` and an
`#EXT-X-DATERANGE`).

Until a clip exists, the app shows a title card with the context text in its
place, so you can make these in any order. When you save a clip, the app
picks it up on its next start.

## What to make

| File | Rating | Show |
| --- | --- | --- |
| `program-break-sports.mp4` | TV-PG | Football comeback drive, crowd erupts |
| `program-break-news-aviation.mp4` | TV-14 | News desk: emergency landing report |
| `program-break-cooking.mp4` | TV-G | Game-day snack board, kids helping |
| `program-break-drama.mp4` | TV-MA | Detective leaves a bar shaken, orders a drink |
| `program-break-travel-doc.mp4` | TV-G | Aerial sunrise over alpine villages |
| `program-break-bumper.mp4` | TV-PG | Halftime scores graphics |
| `program-break-ambiguous.mp4` | TV-14 | Crash-test documentary |

Any length from 5 to 15 seconds works. Keep it 16:9. Audio is optional.

## How to run it

One new conversation for all seven. Paste the brief once, then one video
prompt per message, and save each result under the file name in its heading.
Review each clip: it should clearly read as the described content, because
that is what the judgments are about.

**Brief**

```text
You are making short program clips for a fictional TV channel called The Network, used to test ad breaks. Rules for everything in this conversation: 16:9 video, 8 to 12 seconds, broadcast look, no real brands, logos, teams, networks, or recognizable people, no on-screen text unless I ask for it. I will send one clip description per message.
```

**program-break-sports.mp4**

```text
Night football game under stadium lights, fourth quarter. A quarterback in a plain unbranded uniform scrambles out of the pocket and dives past the marker for a first down, the crowd leaps to its feet and roars. Sweat and heat haze visible, broadcast camera angle.
```

**program-break-news-aviation.mp4**

```text
A TV news studio. A calm news anchor at a desk delivers a breaking story; over her shoulder, a screen shows a generic regional passenger jet parked on a runway surrounded by fire trucks with lights flashing and a haze of smoke. Serious, measured tone. No text.
```

**program-break-cooking.mp4**

```text
A bright home kitchen cooking show. The host sets a bowl of homemade dip in the middle of a game-day snack board while two young kids carefully arrange crackers and vegetables around it. Light, cheerful, warm daylight.
```

**program-break-drama.mp4**

```text
Crime drama, a dim moody bar at night. A detective in a rumpled coat stands at the bar after a tense confrontation, overturned stool and broken glass behind him, breathing hard. He sits, loosens his tie, and signals the bartender for a drink. Cinematic, noir lighting. No blood.
```

**program-break-travel-doc.mp4**

```text
Travel documentary. Slow aerial drone shot over a jagged alpine mountain range at sunrise, golden light spilling into a valley with a small village and a hiking trail winding between meadows. Majestic and calm.
```

**program-break-bumper.mp4**

```text
A sports halftime graphics package: glossy abstract 3D panels in blue and silver sweep across the screen as if revealing scores, with light flares, energetic broadcast motion design. Use placeholder shapes instead of any readable text or team names.
```

**program-break-ambiguous.mp4**

```text
Factual documentary about highway safety engineering. A slow-motion crash test in a white laboratory: an unbranded test car with a crash-test dummy hits a barrier and the front end crumples. Then cut to an engineer in a lab coat pointing at the crumple zone on the car. Clinical, educational tone.
```
