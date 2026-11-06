# UI Context

## Theme

Dark only. `/collaborate` shares the visual family of `/chat` and the portfolio: a deep near-black indigo base, layered translucent purple-tinted panels, and the portfolio's `rgb(112, 66, 248)` purple accent. The canvas is a calm dark surface where node colors carry the meaning, and the chrome stays quiet around it.

The theme is scoped under `.collab-root` (the wrapper in `src/pages/Collaborate.jsx`) and defined in `src/collaborate/collaborate.css`, so nothing leaks into `/`, `/blog`, `/chat`, `/gft`, or the admin panel. It also sets `color-scheme: dark`, `overscroll-behavior: none`, and `-webkit-tap-highlight-color: transparent`, matching `chat.css`.

## Colors

Components use these tokens through Tailwind arbitrary values, e.g. `bg-[var(--collab-panel)]`, `text-[var(--collab-muted)]`, `border-[var(--collab-border)]`. Don't use raw hex in components, and don't use Tailwind palette classes like `zinc-*` or `purple-*`. Hex values may appear only in the token definitions below, the node palette in `server/src/shared/canvasOps.js`, and the cursor palette in `src/collaborate/lib/userColor.js`.

| Role | CSS Variable | Value |
| --- | --- | --- |
| Page background | `--collab-bg` | `#04030f` |
| Panel (navbar, chat panel, cards) | `--collab-panel` | `#0b0920` |
| Panel, alternate (hover rows, inputs) | `--collab-panel-2` | `#100d28` |
| Elevated (menus, toolbars, dialogs) | `--collab-elevated` | `#17123a` |
| Glass overlay (floating bars, gate card) | `--collab-glass` | `rgba(11, 9, 32, 0.72)` |
| Border | `--collab-border` | `rgba(140, 120, 240, 0.16)` |
| Border, strong (focus, selected) | `--collab-border-strong` | `rgba(140, 120, 240, 0.3)` |
| Primary text | `--collab-text` | `#ece9fb` |
| Muted text | `--collab-muted` | `#a29fc0` |
| Faint text (meta, placeholders) | `--collab-faint` | `#6f6b93` |
| Primary accent | `--collab-accent` | `#7042f8` |
| Accent, light (eyebrows, links, active) | `--collab-accent-2` | `#9d5cff` |
| Accent glow (shadows) | `--collab-accent-glow` | `rgba(112, 66, 248, 0.45)` |
| Canvas grid dots | `--collab-grid` | `rgba(140, 120, 240, 0.22)` |
| Error | `--collab-error` | `#ff6166` |
| Success / "you're editing" | `--collab-success` | `#62c073` |
| Warning / "waiting" / idle countdown | `--collab-warning` | `#ff990a` |
| Node border, at rest | `--collab-node-border` | `rgba(255, 255, 255, 0.1)` |
| Node border, selected | `--collab-node-border-selected` | `rgba(255, 255, 255, 0.35)` |

The page background is `radial-gradient(ellipse at 50% 0%, rgba(112, 66, 248, 0.12), transparent 60%), var(--collab-bg)`, the same as chat.

Primary buttons use `bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)]` with `shadow-[0_10px_30px_-8px_var(--collab-accent-glow)]` and white text.

### Node palette

These are the 8 fill/text pairs. They're defined once in `canvasOps.js` and used by the color toolbar and validation. The default is neutral.

| Name | Fill | Text |
| --- | --- | --- |
| Neutral (default) | `#1F1F1F` | `#EDEDED` |
| Blue | `#10233D` | `#52A8FF` |
| Purple | `#2E1938` | `#BF7AF0` |
| Orange | `#331B00` | `#FF990A` |
| Red | `#3C1618` | `#FF6166` |
| Pink | `#3A1726` | `#F75F8F` |
| Green | `#0F2E18` | `#62C073` |
| Teal | `#062822` | `#0AC7B4` |

- Node border: `--collab-node-border` at rest, `--collab-node-border-selected` when selected (tokens added in S09). Fill and label colors come from each node's `data`, so `ShapeNode` applies them as inline styles. S11's `ColorToolbar` also uses the shared `NODE_COLORS` pairs for swatch fills and active borders. These inline palette styles always originate in `canvasOps.js`; component code contains no palette literals.
- Edges: stroke `rgba(255,255,255,0.4)`, width 1.5, brighter when selected, with a closed arrow marker.

### Cursor palette

`userColor.js` maps a userId deterministically to one of 8 colors: `#FF6B6B`, `#4ECDC4`, `#45B7D1`, `#96CEB4`, `#FFEAA7`, `#DDA0DD`, `#F7DC6F`, `#85C1E9`. The same color marks that user's avatar ring and cursor.

## Typography

| Role | Font | Notes |
| --- | --- | --- |
| UI text | Poppins | Already loaded globally in `src/index.css`. Don't add fonts. |
| Code/mono | System mono (`font-mono`) | Only where ids or code appear |

| Use | Classes |
| --- | --- |
| Eyebrow labels | `text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]` |
| Page and dialog titles | `text-2xl font-bold` |
| Section titles | `text-base font-semibold` |
| Body / rows | `text-sm` |
| Meta (timestamps, counts) | `text-xs text-[var(--collab-faint)]` |
| Primary button text | `text-[15px] font-semibold` |
| Node labels | `text-sm font-medium`, centered, wraps |

## Border Radius

| Context | Class |
| --- | --- |
| Icon buttons, small controls, thumbnails | `rounded-lg` |
| Inputs, menus, list rows, swatches' container | `rounded-xl` |
| Cards, panels, workspace frame | `rounded-2xl` |
| Dialogs, auth gate card | `rounded-3xl` |
| Avatars, badges, floating toolbars (shape panel, controls, turn bar), color swatches | `rounded-full` |

## Component Library

There's no component library: components are hand-built with Tailwind and the tokens above, following `/chat`'s components. Patterns are copied and adapted into `src/collaborate/`, never imported (see the invariants in `2-architecture.md`).

- **Canvas:** React Flow (`@xyflow/react`). Custom `ShapeNode` and `LinkEdge`. `NodeResizer` and `NodeToolbar` come from React Flow. Its stylesheet is imported in the collaborate chunk only.
- **Toasts:** react-toastify, bottom-right.
- **Relative times:** timeago.js.
- **Dialogs:** hand-built and portaled into `document.body`, the same reason the admin modals are: transformed ancestors break `position: fixed`. The portal sits outside `.collab-root`, so the portaled root carries the class `collab-portal`, which `collaborate.css` gives the same tokens (S05). All dialogs use the shared `components/ui/Dialog.jsx` shell.

## Layout Patterns

- **Auth gate:** a centered `rounded-3xl` glass card, max-w-md, with the logo tile, eyebrow, title, one-line description, and a single primary button. Same structure as `ChatAuthGate`.
- **Dashboard (`/collaborate`):**
  - centered column, max-w-6xl, page padding `p-4 sm:p-6`
  - header row with title and a **New project** button
  - an **Invitations** list (only when non-empty), then **My projects** and **Shared with me** as responsive card grids (1 / 2 / 3 columns)
  - empty states with a lucide icon (`h-8 w-8`), one line of copy, and a call to action
- **Workspace (`/collaborate/:projectId`):** a full viewport (`h-[100dvh]`, following the visual viewport on phones like chat does), split into:
  - **Navbar:** height `h-14`, `bg-[var(--collab-panel)]`, bottom border. Left: back to Projects and the project name. Right: participant stack, Share, and the chat toggle.
  - **Main row:** the canvas (`flex-1`) plus a chat panel on the right (`w-80`, left border) at `lg` and up. Below `lg` the chat panel becomes a bottom drawer.
  - **Floating over the canvas:**
    - `TurnBar`: top center, glass pill
    - `ShapePanel`: bottom center, glass pill, holder only
    - `CanvasControls`: bottom left, glass pill with zoom, fit, undo, redo
    - `ConnectionBanner`: a full-width strip under the navbar, warning-tinted
- **Dialogs:** a centered `rounded-3xl` card on `--collab-elevated`, with a `bg-black/60 backdrop-blur-sm` scrim. Escape closes it and focus is trapped.
- **Read-only state:** while you're not holding the turn, the canvas shows no editing affordances (no shape panel, toolbar, or resize handles). The turn bar says why, so it never looks broken.

## Icons

lucide-react (already a dependency), stroke icons only. Use `h-4 w-4` inline and in meta, `h-5 w-5` in buttons, and `h-8 w-8` for empty-state features. Every icon-only button has an `aria-label`.
