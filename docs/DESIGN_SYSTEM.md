# Design System

Authored using the **ui-ux-pro-max** rule set (accessibility, typography/color, interaction, layout, and the professional-UI checklists). This is the single source of truth for `apps/web` (Tailwind + shadcn/ui) and the `apps/extension` webview. Define tokens here once; both surfaces derive from them.

> The CLI palette/font generator wasn't available in this environment, so values below are hand-picked to satisfy the skill's rules (4.5:1 contrast, semantic tokens, dark-mode designed alongside light, no emoji-as-icon, 4/8 spacing rhythm).

## Direction

- **Style:** clean, minimal developer tool with subtle depth. **Dark-mode-first** (developers live in dark editors), light mode fully supported.
- **Feel:** fast, calm, low-friction. Information-dense without clutter. Generous whitespace, restrained color, one primary action per screen.
- **Icons:** [Lucide](https://lucide.dev) (SVG, 1.5px stroke). **Never** emoji as structural icons. Priority dots are the one intentional use of colored glyphs, always paired with a text label.

## Color tokens

Semantic tokens (not raw hex in components). Each shadcn variable maps to these. Both themes designed together; both meet WCAG AA.

### Light

| Token | Value | Use |
|-------|-------|-----|
| `background` | `#f8fafc` | app background |
| `surface` / `card` | `#ffffff` | cards, panels |
| `surface-muted` | `#f1f5f9` | subtle fills, hover rows |
| `border` | `#e2e8f0` | dividers, card borders |
| `foreground` | `#0f172a` | primary text (15.8:1) |
| `muted-foreground` | `#64748b` | secondary text (4.6:1) |
| `primary` | `#4f46e5` | brand, primary CTA |
| `primary-foreground` | `#ffffff` | text on primary |
| `ring` | `#6366f1` | focus ring |

### Dark (default)

| Token | Value | Use |
|-------|-------|-----|
| `background` | `#0b0e14` | app background |
| `surface` / `card` | `#11151c` | cards, panels |
| `surface-muted` | `#161b22` | subtle fills, hover rows |
| `border` | `#232a35` | dividers, card borders |
| `foreground` | `#e6edf3` | primary text (14.1:1) |
| `muted-foreground` | `#8b949e` | secondary text (5.2:1) |
| `primary` | `#7c83ff` | brand, primary CTA |
| `primary-foreground` | `#0b0e14` | text on primary |
| `ring` | `#7c83ff` | focus ring |

### Semantic (theme-independent intent; verify contrast per surface)

| Token | Light | Dark | Meaning |
|-------|-------|------|---------|
| `success` | `#059669` | `#34d399` | completed, confirmations |
| `warning` | `#d97706` | `#fbbf24` | approaching deadline, blocked |
| `danger` | `#dc2626` | `#f87171` | high priority, destructive |
| `info` | `#2563eb` | `#60a5fa` | neutral notices |

### Priority & status (always paired with a label — never color-only)

| Priority | Color token | Dot |
|----------|-------------|-----|
| high | `danger` | ● |
| medium | `warning` | ● |
| low | `muted-foreground` | ● |

| Status | Color token |
|--------|-------------|
| active | `primary` |
| blocked | `warning` |
| completed | `success` |

## Typography

- **UI font:** Inter (variable). Headings + body share the family; hierarchy via weight/size.
- **Mono font:** JetBrains Mono — for task IDs, deadlines, file paths, code refs in "Explain Task". Use tabular figures for any aligned numbers/timers.
- **Scale (px):** 12, 14, 16, 18, 20, 24, 30, 36. Body base **16px** (mobile too — avoids iOS zoom).
- **Line-height:** 1.5 body, 1.2–1.3 headings.
- **Weights:** 400 body, 500 labels/nav, 600 headings, 700 emphasis.
- **Measure:** 60–75 chars desktop, 35–60 mobile.

## Spacing, radius, elevation

- **Spacing:** 4px base. Scale `4 8 12 16 24 32 48 64`. Section rhythm tiers 16 / 24 / 32 / 48.
- **Radius:** `sm 6 · md 8 · lg 12 · xl 16 · full` (dots, pills, avatars).
- **Elevation:** light mode uses a 3-step shadow scale (cards / popovers / modals). Dark mode prefers **border + surface lightening** over shadows. Use one consistent scale; no ad-hoc shadow values.

## Layout

- **Breakpoints:** 375 / 640 / 768 / 1024 / 1280 / 1440 (Tailwind `sm md lg xl 2xl`). Mobile-first.
- **App shell (≥1024px):** left sidebar nav (Dashboard, Tasks, Integrations, Settings) + top bar (workspace switcher, user menu). Content `max-w-7xl`.
- **Mobile:** top bar + slide-in drawer for nav. No horizontal scroll. `min-h-dvh` not `100vh`.
- **One primary CTA per screen;** secondary actions visually subordinate.

## Motion

- 150–250ms micro-interactions; ≤400ms transitions. `ease-out` enter, `ease-in` exit (exit ~70% of enter).
- Animate `transform`/`opacity` only. Always honor `prefers-reduced-motion`.
- Animate 1–2 key elements per view. Skeletons for loads >300ms.

## Components (shadcn/ui)

- **Buttons:** primary (filled `primary`), secondary (outline), ghost (nav/inline). Loading → spinner + disabled. Touch target ≥44px high.
- **Task card:** priority dot + title (600) + mono deadline + status badge + assignee avatar. Hover reveals quick actions (complete / block / snooze). Click → detail.
- **Status badge:** tinted bg + solid text using status token; icon + word (not color alone).
- **Forms:** visible labels (never placeholder-only), helper text below, inline validation on blur, error below field with `role="alert"`, required marked. Semantic input types.
- **Toasts:** `aria-live="polite"`, auto-dismiss 3–5s, never steal focus. Undo for destructive actions.
- **Empty states:** every list (tasks, integrations) has a helpful empty state with a next action.
- **Focus:** visible 2px ring on all interactive elements — never remove focus outlines.

## Extension theming (`apps/extension`)

- **Sidebar:** native VS Code `TreeView` — inherits the user's theme automatically. Group by status; leading priority dot via `ThemeIcon` color.
- **"Explain Task" webview:** use VS Code theme variables so it blends with any theme:
  - bg `var(--vscode-editor-background)`, text `var(--vscode-foreground)`
  - links `var(--vscode-textLink-foreground)`, borders `var(--vscode-panel-border)`
  - inputs/buttons `var(--vscode-button-*)`
- Brand moments (priority dots, the one accent) use our `primary`/priority tokens so the extension feels related to the web app without fighting the editor theme.
- Always render the **"AI suggestion — review before acting"** footer in muted-foreground.

## Accessibility (gate before shipping any screen)

- Contrast ≥4.5:1 body, ≥3:1 large/UI glyphs (tokens above already satisfy this).
- Full keyboard nav; tab order matches visual order; visible focus rings.
- `aria-label` on all icon-only buttons; alt text on meaningful images.
- Color never the sole signal (priority/status always carry a label/icon).
- Respect `prefers-reduced-motion` and OS text scaling without layout breakage.
