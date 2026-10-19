# 0003: Plain intent and spec documents instead of GitHub Spec Kit

Status: accepted, 2026-10-08

## Context

We separate why (`intent.md`), what (`spec.md`), and how (the code). Tools exist to scaffold this, notably GitHub Spec Kit.

## Decision

Use two plain Markdown documents and short decision records, with requirement IDs that tests and pull requests cite.

## Why

- In early 2026 Spec Kit's own community raised maintenance concerns (many open pull requests and a month without commits). A spec format should outlive the tool that generates it.
- Two Markdown files work with every agent and every editor, and need nothing installed.
- Community starter templates for AI-assisted development exist, but none has meaningful adoption yet.

## Consequences

If a spec tool becomes a clear standard, these documents can move into it. A reusable starter template will be extracted from this repo after release 1.
