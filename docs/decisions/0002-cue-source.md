# 0002: Use x9k3 for deterministic SCTE-35 cue traces

Status: accepted, 2026-10-08. Confirm license and maintenance before release.

## Context

The benchmark needs a live HLS stream with real SCTE-35 cues at known times, repeatable run after run.

## Options

- x9k3 (BSD-3-Clause): an HLS segmenter that loops a VOD as live and inserts SCTE-35 from a sidecar file of timestamps and cues, in several HLS tag styles. Built on threefive, a widely used SCTE-35 library. Python, run as a separate tool, so the language doesn't matter.
- Eyevinn Channel Engine (Apache-2.0, TypeScript): VOD-to-live with HLS Interstitial ad breaks, but no SCTE-35, and its interstitial support needs confirming. Fallback.
- realeyes-media/moe-replay: inactive (4 commits), no license stated, and no SCTE-35 or interstitials. Rejected; without a license it can't be reused.
- Port the baseline's own looping stream: it emits only a custom tag, not SCTE-35. Rejected.
- AWS Elemental MediaTailor: supports HLS Interstitials for live, but is paid with no free tier. Used only as a commercial point of comparison.

## Decision

x9k3 produces the source stream and cues. The mapper, which we build, turns those cues into interstitials. The mapper is the differentiating piece; the cue source is a commodity.
