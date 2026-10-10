# Specification: release 1

What release 1 must do. Each requirement has an ID so tests and pull requests can cite it. Open questions are marked as such and get resolved by a decision record in `decisions/`.

## The deadline chain

One ad break passes through six hops, in this order. The names are the `Hop` enum in `packages/contracts`.

1. `cue_observed`: the mapper reads an SCTE-35 cue for a new break in the source playlist. Generation may start here.
2. `manifest_published`: the mapper serves a playlist that contains the break's interstitial.
3. `asset_list_requested`: the player requests the interstitial's asset list. The player decides when; the server cannot.
4. `asset_list_answered`: the decision service has sent its response.
5. `first_ad_frame`: the player decodes the first frame of the first ad.
6. `primary_resumed`: the player returns to the program.

- CHAIN-1: Every hop is recorded as a `HopMark`: break ID, hop, and time in epoch milliseconds.
- CHAIN-2: Hops are recorded where they happen: 1 and 2 by the mapper, 4 by the decision service, and 3, 5, and 6 by the player. Request 3 is also logged by the decision service, so the two clocks can be compared.
- CHAIN-3: The deadline for a break is the time from `cue_observed` to the splice point announced in the cue. A generated ad meets the deadline only if it was generated, packaged as HLS, and passed checks before `asset_list_requested`.

## Cue source

- CUE-1: Cue traces are deterministic: the same VOD source and the same SCTE-35 sidecar produce the same breaks at the same offsets every run. x9k3 loops the VOD as live (see `decisions/0002-cue-source.md`).
- CUE-2: Each trace sets the cue lead time, the time from cue to splice point. The default is 4 seconds, the commonly recommended minimum. Traces with longer and shorter lead times test the edges.

## Mapper

- MAP-1: For each cue-out, publish one HLS Interstitial (`EXT-X-DATERANGE`, `CLASS="com.apple.hls.interstitial"`) anchored to the program date-time of the splice point, with an `X-ASSET-LIST` URL that points at the decision service.
- MAP-2: The interstitial ID is stable for a given break and loop iteration, so a playlist reload never creates a second break.
- MAP-3: One rendition only in release 1.
- MAP-4: Resume policy: open question. The candidates are resuming at the live edge, or at the point the break started. Decide this after the interstitial spike.
- MAP-5: If the decision service is unreachable, the break still appears in the playlist; the player's fallback behavior is then measured and recorded, not hidden.

## Decision service

- DEC-1: Answers the asset-list request with an HLS Interstitials asset list whose ads fit the break's duration.
- DEC-2: Eligibility rules (flight dates, daypart, frequency cap, audience rules) are deterministic code, ported from the baseline with the same results.
- DEC-3: Brand safety and contextual fit come from a Judge. Judge implementations: replay (the default, from recorded responses), Jev, and any Jev-compatible server set by `JEV_URL`.
- DEC-4: Safety blocks an advertiser when it is false or below its threshold. Fit decides the creative: a confident strong fit may use a generated ad, if one is ready and has passed checks; otherwise the advertiser's pre-approved ad plays. The house ad closes the break.
- DEC-5: Every decision is logged with its judgments, probabilities, thresholds, route, and the hop times it saw.

## Generator

- GEN-1: Generation starts at `cue_observed`, keyed by advertiser, viewer segment, and content category, as in the baseline.
- GEN-2: Generator implementations: a stub with an injected delay (the default; it returns a prepackaged ad after N milliseconds), and fal.
- GEN-3: A generated clip is ready only after it is packaged as HLS and passes ffprobe checks for duration, codec, and resolution. Each of the three steps is timed separately.

## Benchmark

- BENCH-1: Runs a set of cue traces through the full chain with a headless hls.js player and reports each hop, and the end-to-end total, at p50, p95, and p99.
- BENCH-2: Runs cold (empty creative cache) and warm (cache primed), and sweeps the stub's injected delay to find where generated ads stop meeting the deadline.
- BENCH-3: Records every failure, stall, and retry in a trace file that ships with the results.
- BENCH-4: The default run needs no API keys and costs nothing.

## Behavior carried over from the baseline

- BASE-1: For the 20 labeled scenarios in `baseline/data/scenarios.json`, the new decision logic produces the same route, brand-safety result, and fit as the baseline, given the same Judge responses. The characterization tests enforce this.
