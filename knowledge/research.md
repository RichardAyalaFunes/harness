# Harness and software-factory research

Checked 2026-11-07. Primary sources:

1. [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/), 2026-02-11. Its experiment emphasizes agent-readable repository knowledge, bounded instructions, and feedback/checks around agents. Adopt a short entry contract and indexed evidence rather than putting all context into one prompt.
2. [StrongDM: Software Factories and the Agentic Moment](https://factory.strongdm.ai/), 2026-02-06, and [techniques](https://factory.strongdm.ai/techniques). Its approach uses specifications and scenarios to drive automated implementation and validation. Adopt explicit outcomes and scenario evidence. The owner's human discussion and required AI reviews remain our policy; we do not adopt StrongDM's no-human-code-review rule or spending assumptions.
3. [Official Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode). `codex exec` can receive explicit context through stdin; use read-only mode for consultation. Actual installed flags were inspected locally.

Our synthesis: a harness is the operating system around model calls—context, tools, orchestration, validation, recovery, evaluation, and user-facing results. A small software-factory loop turns a business brief into scenarios, a plan, an implementation, evidence, and review. This workspace supports development; it does not by itself satisfy the business-harness assessment. These are design interpretations, not claims of proven reliability.
