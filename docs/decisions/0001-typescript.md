# 0001: Port the proof of concept from Python to TypeScript

Status: accepted, 2026-10-08

## Context

The v0 proof of concept is about 900 lines of dependency-free Python plus a JavaScript player. Release 1 splits it into a mapper, a decision service, a player, and a benchmark that share typed contracts.

## Decision

Port to TypeScript now, while the code is small, protected by black-box characterization tests that run against the Python baseline (`v0-baseline`).

## Why

- The player has to be TypeScript or JavaScript anyway: hls.js, Shaka, and Bitmovin are all JavaScript SDKs. One language means one toolchain, and one set of types shared by the player and the services.
- Contracts defined once in Zod give runtime validation at every boundary and an OpenAPI description for free.

Not a reason: the claim that coding agents do better in typed languages. The evidence we found is mixed, and one published comparison of the same agent in Rust and Python showed near-parity. We don't rely on it.

## Consequences

- The Python baseline stays in `baseline/`, frozen, as the reference for the characterization tests.
- Escape hatch: the Judge sits behind HTTP. If the port slips, the benchmark ships in TypeScript and calls the Python decision logic.
