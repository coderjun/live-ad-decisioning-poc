# Specification: release 1

What release 1 must do. Each requirement has an ID so tests and pull requests can cite it. Open questions are marked as such and get resolved by a decision record in `decisions/`.

Release 1 uses server-guided ad insertion (SGAI): the server marks the break in the playlist as an HLS Interstitial, and the player fetches and plays the ads itself. Nothing is stitched into the stream, so there are no stitching events, and quartile events (proof of viewing) are out of scope (PLAY-2).

## Trace events

The names below are this project's trace events, defined in `packages/contracts`. They are not SCTE-35 terms. SCTE-35 only signals where a break starts and ends; everything after that is ours to name and measure.

### The deadline chain

One ad break passes through eight hops, in this order (the `Hop` enum). Each has one authoritative recorder (`authoritativeRecorder`).

1. `cue_observed` (mapper): the mapper has read and accepted an SCTE-35 cue for a new break in the source playlist. It is the same moment as the `source_load_completed`, outcome `new_cue`, that found the cue (MAP-7). Generation may start here.
2. `manifest_published` (mapper): the mapper first serves a playlist revision that contains the break's interstitial.
3. `manifest_loaded` (player): the player has loaded a playlist and discovered the break's interstitial in it. This is discovery of that specific interstitial, not any playlist load. The gap after `manifest_published` is the player's reload interval, and it counts against the deadline.
4. `asset_list_requested` (player): the player requests the interstitial's asset list (the `X-ASSET-LIST` URL). The player decides when; the server cannot.
5. `asset_list_answered` (decision service): the decision service has finished writing its response. This is a service-side mark. The player may record a secondary mark when it receives the response.
6. `break_reached` (player): the playhead reaches the interstitial's START-DATE. This is the playback deadline, observed directly.
7. `first_ad_frame` (player): the player decodes the first frame of the first ad.
8. `primary_resumed` (player): the player returns to the program.

- CHAIN-1: Every hop is recorded as a `HopMark` with the hop, the recorder, and the time in the recorder's clock.
- CHAIN-2: The authoritative recorder's mark defines the hop. Another component may record a secondary mark for the same hop, with its own `recordedBy`; secondary marks are used to compare clocks (CLOCK-2), never to replace the authoritative mark. The decision service always records a secondary `asset_list_requested` when the request arrives.

### Timed steps

Everything between the hops that takes time is a timed step: the mapper reading the source playlist, making a creative, the decision service's work for a break, and the player loading and playing each ad. Their names are the `SourceStage`, `CreativeStage`, `DecisionStage`, and `AdAssetStage` enums.

- STEP-1: Every step is recorded as `<step>_started`, then exactly one of `<step>_completed` or `<step>_failed`, so each duration is measured, including for a step that fails.
- STEP-2: `_failed` means the step broke or couldn't run: an error, an unreachable store, or a timeout. Its reason goes in `detail`. A negative answer is not a failure: it is a `_completed` mark with an `outcome` (`outcomes` in `packages/contracts`): `new_cue` or `no_new_cue` for source loads, `passed` or `rejected` for checks, `hit` or `miss` for cache lookups. The step ends with `_completed` even when the answer arrives at the same moment, so every step ends the same way.
- STEP-3: Each step that waits on something outside its own code has a timeout, set in config, for calls that hang. Hitting it ends the step with `_failed`, `detail: "timeout"`. The timeout bounds stuck work; it is not the break deadline. The player's load timeouts are hls.js's own.

### Creative readiness

Making a personalized creative ready runs beside the chain, in the decision service, which runs the Generator. Its steps are `CreativeStage`s, recorded as `CreativeMark`s.

- READY-1: A creative goes through generation, packaging, checks, and fetch-back, in that order (STEP-1), then ends with `creative_ready` or `creative_failed`.
- READY-2: `creative_ready` means validated and retrievable: `checks_completed` with outcome `passed`, the packaged HLS creative stored at the URL the asset list will give the player, and `fetch_back_completed`, meaning the decision service fetched that URL back successfully. Generated, or packaged but unchecked, is not ready.
- READY-3: A creative that can't be made ready ends with `creative_failed`, with the reason in `detail`, right after the step that ended it: a `*_failed` mark, or `checks_completed` with outcome `rejected`. So which step stopped it is a recorded fact, not text to parse. The break then gets the advertiser's pre-approved creative (DEC-4).
- READY-4: Missing the break doesn't stop a creative. Every step runs to its end mark even after the asset list is answered, so durations are measured in full rather than cut off at the deadline. A miss is not a failure and gets no mark of its own: it shows as `creative_ready` after the decision service's secondary `asset_list_requested` (CLOCK-3). The finished creative stays stored and can play in a later break (CACHE-2).

### Ad playback

- PLAY-1: For each asset in the asset list, the player records `AdAssetMark`s with the asset's `assetIndex`: `asset_playlist_load_*` for the asset's own HLS playlist, `first_segment_load_*` for its first media segment, both fetched from wherever the asset is hosted (origin or CDN), and `asset_playback_*` from its first frame to its end, or to a playback error. With the hops, these time every step from the cue to the return, including the gap between one asset and the next, and from the last asset to `primary_resumed`.
- PLAY-2: These are not hops, because their order against the hops isn't fixed: the player may load an asset before `break_reached`. Asset 0's `asset_playback_started` is the same moment as `first_ad_frame`; the hop is authoritative for the chain. Asset start and end are timing, not proof of viewing, so quartile events stay out of scope.

### Creative cache

Stored creatives are reused across breaks, as in the baseline (see `decisions/0004-creative-cache.md`).

- CACHE-1: A creative is stored under the baseline's key: advertiser, viewer segment, content category, and fit. Its `creativeId` is derived from that key, so every mark for one creative shares it, across breaks.
- CACHE-2: A stored creative plays in any later break whose decision asks for its key, if it fits the time left in the break, as in the baseline. Eligibility, brand safety, and fit are decided fresh for every break; the cache only supplies the creative.
- CACHE-3: The decision service keeps its own index of ready creatives: for each key, the creative's URL, its duration, and when it became ready. An entry is added at `creative_ready`, after the creative's one fetch-back (READY-2). A hit is answered from the index alone; the creative is not fetched again while the player waits.
- CACHE-4: Judgments are cached under a hash of the Judge's exact input: the advertisers asked about and the content the Judge sees. The same input gives the same judgment, so a hit skips a model call without changing any result (BASE-1). Eligibility is never cached: frequency caps, dayparts, and flight dates change with the viewer and the time, and they are cheap code. The decision itself is never cached.
- CACHE-5: Both lookups are timed steps (`creative_cache_lookup_*` and `judgment_cache_lookup_*`), completed with outcome `hit` or `miss`, or `_failed` when the cache itself is broken. A failed lookup is handled as a miss, but stays a failure in the trace, so broken infrastructure never reads as a cold cache. A creative cache miss is what lets generation start (GEN-1).
- CACHE-6: Release 1's store and index are local, behind interfaces. An origin or CDN store is another implementation, and the same marks then time it. Stored creatives don't expire in release 1. If the index names a creative the store no longer has, the player's asset load fails and records it (PLAY-1); release 1 doesn't revalidate.

### Correlation

- CORR-1: Every mark carries `breakId`, our identifier, which is stable for a break and loop iteration (MAP-2). These fields are optional, recorded whenever they exist:
  - `spliceEventId`: from a `splice_insert()` command, when the cue has one.
  - `segmentationEventId`: from a segmentation descriptor, when the cue has one. A cue may have either, both, or neither.
  - `mediaSequence`: the playlist's `EXT-X-MEDIA-SEQUENCE`, which says which segments it covers.
  - `playlistRevision`: our counter for the served playlist's content. It changes whenever the content changes, including when an interstitial is added without any new segment, so it can change while `mediaSequence` stays the same.
  - `programDateTimeMs`: the event's position on the media timeline, when it has one.
- CORR-2: Fields that can't exist yet are left out, not invented. A rejected cue has no `breakId` (MAP-6), and neither has a source load that found no new cue (MAP-7).

## Clocks and deadlines

- CLOCK-1: There are two kinds of time. Wall-clock time (`atMs`) is when something happened, in the clock of the component that recorded it: the mapper, the decision service, or the player. Media time (`programDateTimeMs`) is a position in the stream, from `EXT-X-PROGRAM-DATE-TIME`. Durations are only computed between marks in the same clock domain, unless CLOCK-2 applies.
- CLOCK-2: To compare marks across components, estimate each clock's offset from paired marks of the same hop: the player's and the decision service's marks for `asset_list_requested` and `asset_list_answered` bracket one round trip. Release 1 runs every component on one machine, so the offsets should be near zero; the benchmark reports them anyway, so the method is proven before it matters.
- CLOCK-3: How the deadline maps to playback. The cue gives the splice point as a presentation timestamp (PTS). The mapper converts it to program date-time, using the segment that contains it, and publishes that as the interstitial's START-DATE (`BreakSchedule.spliceProgramDateTimeMs`). Each player reaches that point later than the live edge, by however far it plays behind live. So there are two deadlines, and the benchmark reports both:
  - The readiness deadline: a creative must be ready (READY-2) before the player asks for the asset list. Measured within the decision service's clock: `creative_ready` against its secondary `asset_list_requested`.
  - The playback deadline: `break_reached`, when this player actually needs the ad. Slack is measured from `asset_list_answered` to `break_reached`, after the clock offset in CLOCK-2.
- CLOCK-4: A generated creative meets the deadline only if it met the readiness deadline. The playback slack shows how much more time a different player request timing could have given it.
- CLOCK-5: The cue source (x9k3) is a fourth clock domain. It is not ours and records no marks, so its time is read only from its own timestamps, carried on the mapper's `SourceLoadMark` as `sourceModifiedMs`, with `sourceModifiedFrom` saying where it came from:
  - `file_mtime`: the playlist file's modification time, when the mapper reads the file the source writes. Millisecond resolution.
  - `http_last_modified`: the HTTP `Last-Modified` header, when the mapper fetches the playlist over HTTP. One-second resolution, so a lag from it is known only to within a second.

  Release 1 runs on one machine, so the source's offset from the mapper is taken as zero. CLOCK-2's method can't estimate it, because the source records nothing. The timestamp is the playlist's last change, so if more than one revision went by before the mapper read it, the measured wait is shorter than the real one: it is a lower bound.
- CLOCK-6: A wall clock can jump while something is being timed: time sync can step or slew it, and a machine can sleep. So each recorder also reads its monotonic clock, `performance.now()` in the player and `process.hrtime` in the services, and puts it on the mark as `monotonic`: the milliseconds since the run started, and a `runId` made when the process or page starts. A duration between two marks from the same recorder and the same `runId` uses `monotonic`. Any other pair uses `atMs`, under CLOCK-1 and CLOCK-2. A restart changes the `runId`, so it can't be read as elapsed time. The source has no monotonic clock we can read (CLOCK-5).

## Cue source

- CUE-1: Cue traces are deterministic: the same VOD source and the same SCTE-35 sidecar produce the same breaks at the same offsets every run. x9k3 loops the VOD as live (see `decisions/0002-cue-source.md`).
- CUE-2: Each trace sets the cue lead time, the time from cue to splice point. The default is 4 seconds, the commonly recommended minimum. Traces with longer and shorter lead times test the edges.

## Mapper

- MAP-1: For each accepted cue-out, publish one HLS Interstitial (`EXT-X-DATERANGE`, `CLASS="com.apple.hls.interstitial"`) whose START-DATE is the splice point's program date-time (CLOCK-3), with an `X-ASSET-LIST` URL that points at the decision service.
- MAP-2: The interstitial ID is stable for a given break and loop iteration, so a playlist reload never creates a second break.
- MAP-3: One rendition only in release 1.
- MAP-4: Resume policy: open question. The candidates are resuming at the live edge, or at the point the break started. Decide this after the interstitial spike.
- MAP-5: If the decision service is unreachable, the break still appears in the playlist; the player's fallback behavior is then measured and recorded, not hidden.
- MAP-6: A cue that can't become a break is recorded as a `CueRejectedMark`, with a reason, a SHA-256 of the raw cue so it can be found again, and any ids it had.
- MAP-7: Every read of the source playlist is a timed step, recorded as a `SourceLoadMark`: `source_load_started`, then `source_load_completed` with outcome `new_cue` or `no_new_cue`, or `source_load_failed` when the source is unreachable or the playlist can't be parsed. A completed load carries the source's own last-modified time when the source gives one (CLOCK-5). For the load that found a cue, the gap from that time to `source_load_started` is the mapper's polling wait, and `source_load_started` to `source_load_completed` is the load itself. Together they are the time the cue sat in the source before the chain began.

## Decision service

- DEC-1: Answers the asset-list request with an HLS Interstitials asset list whose ads fit the break's duration.
- DEC-2: Eligibility rules (flight dates, daypart, frequency cap, audience rules) are deterministic code, ported from the baseline with the same results.
- DEC-3: Brand safety and contextual fit come from a Judge. Judge implementations: replay (the default, from recorded responses), Jev, and any Jev-compatible server set by `JEV_URL`.
- DEC-4: Safety blocks an advertiser when it is false or below its threshold. Fit decides the creative: a confident strong fit uses a personalized creative only if one is ready (READY-2) when the asset list is answered, whether it was made for this break or found in the cache (CACHE-2); otherwise the advertiser's pre-approved creative plays. The house ad closes the break.
- DEC-5: Every decision is logged with its judgments, probabilities, thresholds, route, and the marks it recorded.
- DEC-6: Between its secondary `asset_list_requested` and `asset_list_answered`, the decision service times eligibility, the judgment cache lookup, the Judge (only on a judgment miss), and the creative cache lookup, as `DecisionMark`s (STEP-1). What remains of that interval is building and writing the response. The creative cache lookup at `cue_observed` (GEN-1) is a `DecisionMark` too.

## Generator

- GEN-1: Generation starts at `cue_observed`, after a cache miss (CACHE-3), keyed by advertiser, viewer segment, and content category, as in the baseline.
- GEN-2: Generator implementations: a stub with an injected delay (the default; it returns a prepackaged creative after N milliseconds), and fal.
- GEN-3: Every generated creative goes through the steps in READY-1 to READY-3, including the stub's.

## Benchmark

- BENCH-1: Runs a set of cue traces through the full chain with a headless hls.js player and reports each hop-to-hop duration, each timed step (STEP-1), cache hit, miss, and failure rates, and the end-to-end total, at p50, p95, and p99.
- BENCH-2: Runs cold (empty creative cache) and warm (cache primed), and sweeps the stub's injected delay to find where generated creatives stop meeting the readiness deadline.
- BENCH-3: Records every failure, rejected cue, stall, and retry in a trace file that ships with the results, along with the clock offsets from CLOCK-2.
- BENCH-4: The default run needs no API keys and costs nothing.

## Behavior carried over from the baseline

- BASE-1: For the 20 labeled scenarios in `baseline/data/scenarios.json`, the new decision logic produces the same route, brand-safety result, and fit as the baseline, given the same Judge responses. The characterization tests enforce this.
