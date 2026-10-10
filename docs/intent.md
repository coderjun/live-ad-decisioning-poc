# Intent

Why this exists. What it must do is in `spec.md`; how it does it is in the code.

## The outcome

Give streaming teams a measured, reproducible answer to one question: can a personalized, AI-generated ad be ready and playable between an SCTE-35 cue and the start of the ad break?

Today that question gets argued from model demos ("it generated a clip in 1.5 seconds"). A model's inference time is one hop of many. The answer that matters is the whole chain, from the cue to the first ad frame on screen and back to the program, at the 95th and 99th percentile, not the average.

## Who it's for

- Streaming and ad-tech engineers deciding whether just-in-time generative creative is worth building.
- Engineering leaders deciding where AI belongs in a latency-critical, brand-sensitive pipeline.

## What success looks like

- Anyone can clone the repo and reproduce the benchmark on a laptop, for free, with no API keys.
- The result is a number with a trace behind it: each hop's p50, p95, and p99, cold and warm, with every failure recorded.
- Either answer counts. "Yes, with this much time to spare" and "No, and this hop is why" are both useful. A precise no is a success.

## Principles

- Rules decide facts; models make judgment calls. Eligibility, timing, and budgets are code. Brand safety and contextual fit are model judgments with probabilities, gated by thresholds in code.
- Measure, don't claim. Every hop is timestamped and every decision is logged so it can be explained afterward.
- Use standards. SCTE-35 for cues, HLS Interstitials for server-guided ad insertion, and players that implement them unmodified.
- Buy the commodity, build the differentiator. See `decisions/`.

## Out of scope for release 1

Production scale, multiple renditions, CDN delivery, consent and per-person data handling, VAST, and a second player.
