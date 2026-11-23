# Architecture Decision Records (ADRs)

An ADR records one significant decision: the context, what we chose, what we rejected, and the consequences. Future team members (and AI agents) can then see _why_ things are the way they are, without re-arguing them.

## When to write one

- When choosing or replacing a framework, database, provider or major library.
- When a decision affects money, security, data model shape or module boundaries.
- When deviating from a rule in CLAUDE.md or the spec.

## How

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-short-title.md` (next number).
2. Status starts as `Proposed`; it becomes `Accepted` once agreed in the PR.
3. **Never rewrite an accepted ADR.** To change course, write a new one and mark the old one `Superseded by NNNN`.

## Index

| #                                     | Title                                                       | Status   |
| ------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](0001-baseline-architecture.md) | Baseline architecture and engineering decisions (from SPEC) | Accepted |
| [0002](0002-mvp-providers-zynlepay-brevo-aws.md) | MVP providers: ZynlePay sandbox, Brevo email/SMS, AWS | Proposed |
