# Live Ad Decisioning

Can a personalized, AI-generated ad be ready and playable between an SCTE-35 cue and the ad break?

This repo is building a reproducible answer. It measures the whole deadline chain of server-guided ad insertion (SGAI) with HLS Interstitials: from the cue, through the manifest, the player's asset-list request, and the decision, to the first ad frame and back to the program, at p50, p95, and p99.

Status: release 1 is in progress. The original proof of concept is in `baseline/`.

- Why: [docs/intent.md](docs/intent.md)
- What: [docs/spec.md](docs/spec.md)
- Decisions and their reasons: [docs/decisions/](docs/decisions/)
- How to work in this repo, for people and coding agents: [AGENTS.md](AGENTS.md)

## Development

Requires Node 22 or later and pnpm.

```bash
pnpm install
pnpm check
```

## License

Apache License 2.0. See `LICENSE`.
