# Fundizo documentation

| Area         | Doc                                                                                                                 | What's in it                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Product      | [product/SPEC.md](product/SPEC.md)                                                                                  | Problem, users, verification, fundraising models, flows, money flow, compliance, NFRs, stack, data model, AI roadmap |
| Product      | [product/features/FEATURES.md](product/features/FEATURES.md)                                                        | **Canonical** feature list with stable IDs and statuses                                                              |
| Product      | [product/features/FEATURES.csv](product/features/FEATURES.csv), [.xlsx](product/features/Fundizo_Feature_List.xlsx) | Exports of the same list for issue trackers and spreadsheets                                                         |
| Architecture | [architecture/README.md](architecture/README.md)                                                                    | Module map, donation sequence, target code layout                                                                    |
| Architecture | [architecture/decisions/](architecture/decisions/)                                                                  | ADRs: why things are the way they are                                                                                |
| Security     | [security/SECURITY.md](security/SECURITY.md)                                                                        | Threat model, controls, incident response                                                                            |
| Setup        | [DEPENDENCIES.md](DEPENDENCIES.md)                                                                                  | Toolchain, packages, libraries, external services                                                                    |
| Features     | [features/](features/)                                                                                              | One living doc per feature as it's built                                                                             |
| Design       | [design/](design/)                                                                                                  | UX/UI design docs and assets                                                                                         |
| Agents       | [../CLAUDE.md](../CLAUDE.md)                                                                                        | Rules for Claude Code and engineers                                                                                  |

## Conventions for all docs

- Markdown, with diagrams as Mermaid code blocks (they render on GitHub).
- Use relative links between docs.
- Keep docs next to the truth: when the code changes, its doc changes in the same PR.
- **Keeping the feature list in sync:** edit `FEATURES.md` first. Then update the matching row in `FEATURES.csv` (CRLF line endings) and the `.xlsx`, or say in the PR that the exports need regenerating. A small export script is planned so that only the Markdown is edited by hand.
- Dates are absolute (`2026-11-23`), not "last week".
