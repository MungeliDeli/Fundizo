# Design

UX/UI design docs, wireframes, flows and visual assets live here.

## The design canvas

**Mockups:** https://claude.ai/code/artifact/b15f329f-a705-43c5-afdd-a49240d5d935

It holds light and dark **phone** mockups of: campaign page, donate, waiting for PIN, thank you + reshare, "published: share it", home feed, and create steps 2 and 4. It also has a colour and type sheet.

**How to use it:** treat it as the _idea_ of the look and the flows, not a pixel spec. Fundizo is a **responsive web app for phones and desktops**: design each screen mobile-first, then give it a real desktop layout (top navigation, multi-column where it helps, e.g. campaign story beside a sticky donate card). The mockups say "harambee"; the product is **Fundizo**.

## Visual direction: Copper & Ink

| Role                          | Light                             | Dark                              |
| ----------------------------- | --------------------------------- | --------------------------------- |
| Ground (page)                 | `#F6F3EE`                         | `#121110`                         |
| Surface (cards, inputs)       | `#FFFFFF`                         | `#1C1A17`                         |
| Sunken (tracks, placeholders) | `#EEEAE3`                         | `#26231F`                         |
| Line (borders)                | `#E3DDD3`                         | `#35312B`                         |
| Ink / Ink 2 / Ink 3 (text)    | `#17150F` / `#57514A` / `#736C61` | `#F3EFE7` / `#BDB6A9` / `#9A9386` |
| Copper (money actions)        | `#B4532A`                         | `#E58B5D`                         |
| On copper                     | `#FFFFFF`                         | `#1B0F08`                         |
| Copper soft / Copper text     | `#F7E7DD` / `#8F3F1D`             | `#3B2519` / `#F2B08C`             |
| Verified / Verified soft      | `#1D6A55` / `#E0EFE8`             | `#66C4A4` / `#173129`             |

- **Type:** Bricolage Grotesque (600/700) for headings and amounts; Inter for everything else. Amounts use tabular figures.
- **Buttons:** copper for the one money action on a screen (Donate, Pay); ink for moving through a flow (Continue); outline for secondary.
- **Shape:** 14 px radius on controls, 20 px on cards; touch targets ≥ 44 px.
- **Dark mode** follows the device setting.

## Conventions

- One folder or file per area, named after the feature IDs or flow it covers, e.g. `donate-sheet/` (D-01–D-10) or `campaign-wizard/` (C-01–C-07).
- Export images as compressed PNG, SVG or WebP. Link to Figma (or similar) sources rather than committing huge binaries.
- Feature docs in [docs/features/](../features/) link to the relevant design here.
- Design constraints from the spec that every screen must respect: phone-first, one task per screen, big buttons, works on 3G and Android 8+ (Chrome and Opera Mini), page under 300 KB before images, plain words, local-language ready.
