# 0004: Reuse generated creatives across breaks, as the baseline does

Status: accepted, 2026-10-19

## Context

A generated creative often finishes after its break has passed (READY-4). The baseline keeps every finished creative in a cache keyed on advertiser, viewer segment, content category, and fit, and serves it to any later viewer and break with the same key. Release 1 needs a rule for the same situation, and a way to time the cache, because in production it sits on an origin server or behind a CDN, where a lookup and a fetch cost real time against the deadline.

## Decision

Keep the baseline's behavior: a stored creative plays in any later break whose decision asks for its key, as long as it fits the time left in the break.

The decision service keeps its own cache, so a hit never waits on the store:

- An index of ready creatives (key to URL, duration, and when it became ready), written once the creative has passed its one fetch-back.
- Judgments, under a hash of the Judge's exact input, so repeated content skips a model call with no change in result.

Eligibility and the decision itself are never cached. Every lookup is a timed step with a `hit` or `miss` outcome, or `_failed` when the cache is broken (CACHE-1 to CACHE-6 in `spec.md`).

## Why

- It matches the baseline, which the characterization tests compare against (BASE-1). Refusing a creative that already exists would be a behavior change with no gain.
- Generation is the slow, paid step. Reuse is the warm path that BENCH-2 measures.
- The cache only supplies the creative. Eligibility, brand safety, and fit are decided for every break, and a cached judgment is reused only for identical Judge input, so reuse can't let an advertiser play where it otherwise wouldn't.
- Answering a hit from the decision service's own index keeps the store off the critical path. The store's cost lands where it belongs: on the player's asset loads (PLAY-1), from origin or CDN.
- Timing lookups now, against local caches, sets the baseline for comparing an origin, a CDN, or a shared cache later with the same marks.
- A lookup that fails is recorded as a failure, not a miss, so a broken cache can't pass for a cold one.

## Consequences

- The index can go stale: it may name a creative the store no longer has. Release 1 doesn't revalidate; the player's failed asset load records it (CACHE-6). A later release may revalidate off the critical path.
- Stored creatives never expire in release 1, as in the baseline. Expiry, and invalidation when an advertiser's approved assets change, are open for a later release.
- Release 1's store is local. Swapping in an origin or CDN store is a new implementation of the store interface, not a change to the marks.
