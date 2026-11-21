# Agent Evaluation Rubrics (Evals)

This directory contains data-driven evaluation rubrics for the `@pedroab0/skills` suite following the [Anthropic Agent Skills evaluation standard](https://platform.claude.com/docs/pt-BR/agents-and-tools/agent-skills/best-practices#evaluations-and-iteration).

## How to Run Agent Evals

Agent evals evaluate the agent's end-to-end autonomous decision making, tool choice, boundary enforcement, and output fidelity.

To run an evaluation:

1. **Clean Session**: Open a fresh agent session (e.g. in Claude Code, Antigravity, Cursor, or Kiro) with only the target skill installed.
2. **Submit Query**: Send the exact `query` specified in the evaluation scenario.
3. **Score Expected Behaviors**: Inspect the agent's execution transcript and resulting workspace files against each item in `expected_behavior`.
4. **Iterate Across Models**: Test with light models (e.g. Haiku / Flash), balanced models (Sonnet), and advanced reasoning models (Opus / Pro) to ensure instructions are sufficiently explicit without being overly verbose.

## Evaluation Files

- `figma-extractor.json`: Ingest boundaries, quota preservation, and proactive spec reuse.
- `figma-to-spec.json`: Offline JSON and URL ingestion, codebase-aware gap analysis vs standalone Markdown specs, cross-skill disambiguation, proactive cache reuse, and Zero-Hammer rate-limit boundaries.
- `figma-node-builder.json`: Component reuse (anti-div soup), icon fallback protocol, and validation feedback loops.
- `figma-to-code.json`: Disambiguation from `figma-to-spec` / `figma-extractor`, codebase discovery, and image placeholder protocol.
- `generate-meta-repo.json`: Greenfield polyglot meta-repo scaffolding, existing local clone migration, and incremental Day-2 workspace evolution.
