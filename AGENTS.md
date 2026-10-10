# Agent instructions

Read this before changing anything. It applies to every coding agent and every person working here.

## What this repo is

An open experiment: can a personalized, generated ad be ready and playable between an SCTE-35 cue and the ad break, using server-guided ad insertion (SGAI) with HLS Interstitials? Release 1 measures that deadline chain end to end. Why: `docs/intent.md`. What it must do: `docs/spec.md`. Choices and their reasons: `docs/decisions/`.

## Layout

- `packages/contracts`: Zod schemas and types shared by every service. The only package other packages may import.
- `services/mapper`: turns SCTE-35 cues in a live HLS playlist into HLS Interstitials.
- `services/decision`: answers the player's interstitial asset-list request.
- `apps/player`: the hls.js player; timestamps the hops only the player can see.
- `bench`: replays cue traces and reports each hop at p50, p95, and p99.
- `baseline`: the original Python proof of concept, tagged `v0-baseline`. Frozen. Never edit it; it is the reference the characterization tests run against.

## Commands

- `pnpm install`: install, and set up the git hooks.
- `pnpm check`: lint, typecheck, and test. Run it before you say you're done.
- `pnpm format`: fix formatting and safe lint issues.
- `pnpm test`: run all tests with Vitest.

## Rules

- Contracts first. A new request, response, or event gets a Zod schema in `packages/contracts` before any code uses it. Parse at every service boundary.
- Services talk over HTTP, never by importing each other.
- Code decides facts; models make judgment calls. Eligibility, timing, budgets, and gates are deterministic code with tests. Only the Judge and the Generator call models, and each sits behind an interface with a replay or stub implementation.
- Deterministic by default. Tests and the benchmark's default mode never call a paid API or need a key.
- Every hop of the deadline chain is timestamped with the names in `packages/contracts` (`Hop`). Don't invent new hop names in a service.
- Changing behavior that the characterization tests cover is a decision, not a refactor. Say so and update the spec.
- No secrets in code, tests, or fixtures. Keys come from `.env`, which is never committed.
- Keep changes small and on a branch. Don't push or open pull requests unless asked.

## What runs automatically

- On every file edit (Claude Code): Biome formats it and reports lint errors back.
- Before an agent turn ends (Claude Code): the workspace must typecheck.
- On commit: Biome, typecheck, and a gitleaks secret scan if gitleaks is installed.
- On push: the tests.
- In CI: Biome, typecheck, tests, and gitleaks.
