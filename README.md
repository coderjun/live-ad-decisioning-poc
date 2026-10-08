# Live Ad Decisioning: the right tool at each layer

A proof of concept for deciding what plays in a live streaming ad break when
brand safety, contextual fit, personalization, and a hard time limit all apply
at once. Author: Jun Heider. First published 2026-09-30.

## The problem

Streaming ad breaks now carry four demands at the same moment:

- **Brand safety.** An advertiser must not appear next to content it would
  object to.
- **Contextual fit.** The ad should suit what the viewer was just watching.
- **Personalization.** The creative itself, not only the choice of ad, should
  suit the viewer.
- **Live.** The break arrives on the broadcaster's schedule, with a fixed
  duration, and nothing waits for a slow decision.

Meeting all four at once takes the right balance between deterministic and
non-deterministic decisions, and between freeform and strictly typed outputs.
Rules where the answer is a fact, typed judgments with calibrated confidence
where the answer is a call, and generation only where the judgments allow it.

## The idea

Put each decision where it belongs, and make the boundary between them
explicit and auditable.

| Layer | Decided by | Why |
| --- | --- | --- |
| Break timing | Deterministic code | An SCTE-35 cue is a fact, not a judgment |
| Eligibility | Deterministic code | Flights, dayparts, frequency caps, and audience rules are business rules |
| Brand safety and contextual fit | A typed-decision model | These are judgments, and each needs a calibrated probability attached |
| Creative | A video generation model | Only when the judgments clear their thresholds and the break has time |

What's new here is how the two judgments are used. Brand safety decides
whether an advertiser may appear at all: if it is false or not confident
enough, that advertiser is blocked. Fit decides whether an advertiser plays
and which creative: a strong, confident fit earns a personalized ad,
generated once per advertiser, viewer segment, and context category, then
reused for every matching viewer. A confident weaker fit, or a strong fit
whose custom ad is not ready yet, gets the advertiser's pre-approved
creative, since every frame of it was approved by a person. Every qualifying
advertiser plays while the break has time, strong fits first, and the house
ad closes the break. Every judgment, probability, threshold, route, and cache
outcome is logged.

## The method

On receiving an SCTE-35 splice point, or its HLS equivalent, announcing a
break of duration D:

1. **Filter** candidate advertisers with deterministic eligibility rules:
   campaign flight dates, daypart, frequency cap per viewer, and audience
   rules (alcohol only for viewers 21 or older with no children in the
   household). Order in `data/advertisers.json` breaks ties between equally
   good fits.
2. **Judge.** Submit the content context of the segment preceding the break,
   such as captions and scene descriptions, together with the eligible
   candidates, to a typed-decision model. It returns typed judgments, for
   example brand safe as a boolean, contextual fit as a choice from a fixed
   set, and the context category as a choice from a fixed set, each with a
   calibrated probability. Typing the category is what makes caching work: free
   text would make every break unique.
3. **Gate.** Compare each probability to a per-judgment threshold, with a
   stricter bar for brand safety than for fit.
4. **Block on brand safety.** If brand safety is false or below its
   threshold, the advertiser is out. A different creative cannot fix a bad
   adjacency, so uncertain safety never falls back to a creative from the
   same advertiser.
5. **Qualify on fit.** A brand-safe advertiser qualifies when the model is
   confident, above the fit threshold, that its fit is strong, or at least
   weak. Qualifying advertisers fill the break in order: strong fits first,
   then weak, best fit first within each (strong probability counts double,
   weak single). Each plays one ad, and only if it fits whole in the time
   left.
6. **Pick the creative on fit.** If fit is strong and above its threshold,
   look for a personalized creative in the cache, keyed on advertiser, viewer
   segment, context category, and fit. On a hit, serve it. On a miss, generate
   one from the advertiser's approved assets only if both budgets allow it:
   - **The daily generation budget** has room. Five per rolling 24 hours in
     this POC, matching fal's free tier. The cache is always checked first, so
     no generation is spent on a creative that already exists.
   - **The clock** allows it: expected generation time plus overhead fits
     before the break starts. Short clips at low resolution generate in under
     a second; a 15-second clip at 768p can take longer than it plays, so
     long creatives come from the cache, not a live generation.

   If either budget says no, serve the pre-approved creative now, and
   generate for the next matching viewer once quota allows. While a custom
   creative generates, the house ad plays, and the player switches to the
   custom creative the moment it is ready; if it is not ready while there is
   still time for it to play whole, the pre-approved creative plays instead.
   Only the best strong fit in a break may generate. A weaker fit serves the
   pre-approved creative. Generated creatives run at
   most 15 seconds.
7. **Close with the house ad.** The house ad plays once after the qualifying
   ads if time remains, or alone when no advertiser qualifies.
   The house ad, in `data/house-ad.json`, is the network's own promo and never
   passes through rules or judgment.
8. **Log** every judgment, probability, threshold, route, cache outcome, and latency, so any
   ad that played can be explained afterward.

## Architecture

```
HLS stream with SCTE-35 cues
        |
        v
Player (static hls.js page) --- break reached, duration D ---> Ad intelligence API (Python)
                                                                  |
                                 1. eligibility rules (code)
                                 2. typed judgments (Jev), one call for all
                                 3. brand safety gate (code) --- fails ---> advertiser out
                                 4. fit gate (code) --- not confident ---> advertiser out
                                                                  |
                          qualifying advertisers, strong fits first, while time remains:
              +---------------------------------------------------+
              |                                                   |
     strong, confident fit                          confident weaker fit
              |                                                   |
   custom ad from cache, or generated                  pre-approved creative
   by fal H3 Max Turbo on a miss,                                 |
   house ad while it generates                                    |
   (pre-approved creative now if it can't be,                     |
    custom ad generated for next time)                            |
              |                                                   |
              +------> house ad once if time remains <------------+
                                        |
                              Player plays break
                                                                  |
                                                         decision log for audit
```

## What this POC simplifies

- **Breaks are short.** The stream carries a one-second marker at each break,
  announcing the break's planned duration D. The player pauses the program,
  plays the qualifying ads and then the house ad once, never past D, and resumes
  the program where it left off. The server's stream clock pauses with it, so
  this works for one viewer at a time. Production would fill all of D with an
  ad pod in a stream shared by every viewer.
- **The generation budget is a daily count.** Production would budget by
  cost, per campaign.
- **The cache is a local directory.** In production it would be object
  storage behind a CDN, and popular segment and category combinations would
  be warmed ahead of scheduled breaks.
- **Generation is anchored to approved artwork.** Each creative is animated
  from the advertiser's approved still as the first frame and must land on
  the advertiser's approved end card as the last frame, with a fixed seed and
  no prompt rewriting, so every approved generation can be reproduced for
  audit. In this POC the approved assets are placeholder cards; in production
  they come from the advertiser's asset library.
- **All data is test data** this is a POC.

## Status

| Piece | State |
| --- | --- |
| Architecture and method | In Progress |
| Dummy data: advertisers, viewers, breaks, labeled scenarios | Done |
| Live HLS stream with SCTE-35 cues | In progress |
| Player with break handling, static hls.js page | In progress |
| Eligibility rules | In progress |
| Typed judgments and threshold gate | In progress |
| Creative cache, generate on miss, fallback | Done |
| Scorecard over labeled scenarios | In progress |

## Data and media

All data is test data. No real viewers, advertisers, or campaigns.

## Running it

Requires Python 3.10+ and ffmpeg. No packages to install.

```bash
cp .env.example .env        # add TYPESAFE_API_KEY and FAL_KEY
python3 app.py              # builds the stream on first run, then serves it
open http://localhost:8000  # pick a viewer; it plays muted until "Start with sound"
python3 scorecard.py        # labeled scenarios against Jev; never calls fal
```

| File | What it is |
| --- | --- |
| `decisioning.py` | The method: eligibility rules, Jev judgments, gates, creative cache and generation |
| `stream.py` | The Network: program clips and break slates looped as a live HLS stream with cues |
| `app.py` | HTTP: the page, `/live.m3u8`, and `POST /decide` |
| `index.html` | The player: detects each break, asks `/decide`, plays the ads, shows the log |
| `scorecard.py` | Runs `data/scenarios.json` through the same decision code |

Program clips go in `assets/program-<break-id>.mp4` (see
`assets/PROGRAM-PROMPTS.md`); until then a title card stands in. Every
decision is appended to `media/decisions.jsonl`, and generated creatives are
cached in `media/cache/`.

## License

Apache License 2.0. See `LICENSE`.
