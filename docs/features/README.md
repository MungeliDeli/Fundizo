# Feature documentation

Every feature we build gets a living doc here. It explains how the feature **actually works in the code**: the flows, the API, the data, the money impact, the security rules, and the failure modes. The spec says what we intended; these docs say what we built.

## Rules

- **One doc per feature, or per tightly coupled group of features.** Name it after the primary feature ID from [FEATURES.md](../product/features/FEATURES.md): `D-06-mtn-collection.md`, or `A-01-phone-otp-login.md` (which also covers A-03). List every covered ID at the top.
- **Start from [`_TEMPLATE.md`](_TEMPLATE.md).** Delete sections that truly don't apply, but always keep _Security & privacy_ and _Failure modes_.
- **Write it before or alongside the code**, and update it in the same PR whenever behaviour changes. Reviewers check that the doc matches the code.
- **Link, don't copy.** Point to the spec section, the ADRs, the design files in [docs/design/](../design/), and the code paths, rather than duplicating them.
- When a feature ships, set the doc status to `Shipped` and update [FEATURES.md](../product/features/FEATURES.md).

## Index

| Doc | Feature IDs | Status |
| --- | --- | --- |
| _none yet: the first arrives with slice 0 of the [MVP plan](../product/MVP-PLAN.md)_ | | |
