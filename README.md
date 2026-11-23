# Fundizo

A trusted, mobile-money-native fundraising platform for Zambia: hospital bills, funerals, school fees, weddings, church and community projects. Donors give with **MTN MoMo** and **Airtel Money**. Every kwacha is tracked in a double-entry ledger, and money only leaves once the people and the campaign behind it are verified.

> **Status:** Phase 0 (Foundation): documentation only. We build one feature at a time, end to end, following the [MVP plan](docs/product/MVP-PLAN.md).

## Where to start

| If you want to…                                        | Read                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Understand the product and why it exists               | [docs/product/SPEC.md](docs/product/SPEC.md)                           |
| See the build order, one slice at a time               | [docs/product/MVP-PLAN.md](docs/product/MVP-PLAN.md)                   |
| See what we're building and in which phase             | [docs/product/features/FEATURES.md](docs/product/features/FEATURES.md) |
| Learn the engineering rules (or brief an AI agent)     | [CLAUDE.md](CLAUDE.md)                                                 |
| Understand the system design                           | [docs/architecture/README.md](docs/architecture/README.md)             |
| Know the security rules                                | [docs/security/SECURITY.md](docs/security/SECURITY.md)                 |
| Install the tools and libraries needed to run the code | [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)                           |
| Document a feature you're building                     | [docs/features/README.md](docs/features/README.md)                     |
| Find every doc                                         | [docs/README.md](docs/README.md)                                       |

## Repository layout

```
Fundizo/
├── CLAUDE.md                 Engineering rules, design decisions, security practices
├── README.md                 This file
├── docs/
│   ├── README.md             Index of all documentation + doc conventions
│   ├── DEPENDENCIES.md       Toolchain, packages and libraries
│   ├── product/              What we're building
│   │   ├── SPEC.md           Product and technical specification
│   │   ├── MVP-PLAN.md       Build order: one end-to-end slice at a time
│   │   └── features/         Feature list (FEATURES.md is canonical; CSV/XLSX are exports)
│   ├── architecture/         How it's built
│   │   ├── README.md         Architecture overview, module map, target code layout
│   │   └── decisions/        Architecture Decision Records (ADRs)
│   ├── security/             Threat model, controls, checklists
│   ├── features/             One doc per feature as it's built (by feature ID)
│   └── design/               UX/UI design docs and assets
└── .github/                  PR template (CI workflows come with F-02)
```

The code (`apps/api`, `apps/web`, `apps/admin`, `packages/shared`) arrives slice by slice, starting with slice 0 of the MVP plan. The planned layout is in [docs/architecture/README.md](docs/architecture/README.md#target-code-layout).

## Contributing in one paragraph

Pick a feature ID from [FEATURES.md](docs/product/features/FEATURES.md) and branch as `feat/D-06-mtn-collection`. Write or update its doc in [docs/features/](docs/features/) **before or alongside** the code. Commit with a conventional-commit message that names the ID, e.g. `feat(D-06): request-to-pay adapter`. Open a PR using the template, and update the feature's status in the same PR. Any new architectural decision gets an ADR.
