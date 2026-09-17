# DESIGN.md — Jun's Knowledge Base

## Design Read

Reading this as: **personal learning tool** for a **multi-domain ADHD learner**,
with a **Japandi** language — warm Japanese restraint meets Scandinavian clarity.

Reference: Wabi-sabi paper textures, indigo dyeing (藍染め), Scandinavian
hygge warmth, Muji's functional minimalism, Kinfolk editorial.

Do's: generous whitespace, domain color-coding, one-action focus, warm
natural materials, editorial typography for reading, scannable hierarchy.

Don'ts: overwhelming dashboards, cold tech-blue, dense data tables,
decorative animation, gradient washes, card-heavy layouts.

## Dials

```
DESIGN_VARIANCE: 6
MOTION_INTENSITY: 3
Product density profile: D4 (productivity tool)
Reasoning: Japandi has distinctive aesthetic (variance 6) but this is a
daily-use learning tool, not marketing. ADHD users need calm, not cinematic
motion. D4 balances information density with breathing room.
```

## Domains

| Domain | Label | Color | Icon concept |
|--------|-------|-------|-------------|
| ai | AI | #6251b5 (violet) | brain/circuit |
| dev | 개발 & CS | #2878a9 (blue) | code brackets |
| accounting | 회계 | #2d855f (green) | ledger |
| economics | 경제 & 통계 | #c75b39 (terracotta) | chart |
| design | 디자인 | #b83f7d (magenta) | pen tool |
| startup | 창업 | #b7791f (ochre) | rocket |
| english | 영어 | #16858b (teal) | book |
| other | 기타 | #78716c (warm gray) | folder |

## Color Tokens

```yaml
colors:
  # Japandi base — warm paper tones
  bg-primary: "#f7f3ee"        # warm off-white (washi paper)
  bg-secondary: "#ffffff"      # clean white surface
  bg-warm: "#f0ebe3"           # sand/linen
  bg-ink: "#1a1814"            # sumi ink (dark mode base)

  # Text
  text-primary: "#2c2820"      # charcoal (not pure black)
  text-secondary: "#6b6560"    # warm gray
  text-muted: "#9c9590"        # lighter warm gray

  # Accent — indigo (藍色)
  accent-primary: "#3d5a80"    # deep indigo
  accent-hover: "#2c4a6e"      # darker indigo
  accent-light: "#e8eef5"      # indigo wash

  # Warm accent — oak/amber
  accent-warm: "#b8860b"       # dark goldenrod
  accent-warm-light: "#f5eddb" # cream

  # Borders & surfaces
  border: "#e5ded5"            # warm border
  border-light: "#ede8e1"      # lighter
  shadow: "rgba(44, 40, 32, 0.06)"

typography:
  heading:
    fontFamily: "'Noto Serif KR', 'Noto Serif JP', Georgia, serif"
    weight: [400, 700]
    note: "Serif for editorial reading feel — Japandi warmth"
  body:
    fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif"
    weight: [300, 400, 500, 600]
    note: "Clean sans for UI and body text"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    weight: [400]

spacing:
  unit: 8px
  page-max-width: 1200px
  sidebar-width: 240px
  content-max-width: 720px   # reading width
  border-radius: 6px         # subtle, not bubbly

motion:
  transition-fast: "150ms ease"
  transition-normal: "250ms ease"
  transition-slow: "400ms cubic-bezier(0.16, 1, 0.3, 1)"
```

## ADHD UX Principles

1. **One inbox, zero friction capture** — quick-add from any view
2. **Domain switching** — top-level tabs, never more than 1 click to any domain
3. **Shallow hierarchy** — max 2 levels deep from any entry point
4. **Visual progress** — subtle completion indicators per domain
5. **Focus mode** — single-concept distraction-free reading
6. **Scannable cards** — title + 1-line excerpt + domain color + tags
7. **Random exploration** — "Surprise me" for when focus drifts
8. **Recent & favorites** — always visible, no digging
9. **Warm, calm aesthetic** — reduce cognitive load through visual quiet
10. **No overwhelming dashboards** — show 3-5 items max per section
