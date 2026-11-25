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
| Edge stroke (S12) | `--collab-edge` | `rgba(255, 255, 255, 0.4)` |
| Edge stroke, selected (S12) | `--collab-edge-selected` | `rgba(255, 255, 255, 0.8)` |

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
- Edges (S12): width 1.5 using `--collab-edge`, brighter with `--collab-edge-selected` when selected, with a closed arrow marker added only to display edges. Smooth-step routing for different-node edges; self-loops use an exterior curved path. Parallel edges may overlap. Labels are small elevated midpoint pills, with an isolated inline textarea while editing. S12 adds the two edge tokens to `collaborate.css`; they are specified here before implementation.

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
- **Dashboard (`/sysdesign`):**
  - centered column, max-w-6xl, page padding `p-4 sm:p-6`
  - header row with title and a **New project** button
  - an **Invitations** list (only when non-empty), then **My projects** and **Shared with me** as responsive card grids (1 / 2 / 3 columns)
  - empty states with a lucide icon (`h-8 w-8`), one line of copy, and a call to action
- **Workspace (`/sysdesign/:projectId`):** a full viewport (`h-[100dvh]`, following the visual viewport on phones like chat does), split into:
  - **Navbar:** height `h-14`, `overflow-hidden`, `bg-[var(--collab-panel)]`, bottom border. Left: a back link (`aria-label="Back to projects"`) and the project name (`min-w-0 truncate`). Below `sm` the word Projects is hidden, the role badge is hidden, the Chat label is hidden, and the participant stack shows two avatars plus a count. At `sm` and above the word Projects, the role, the Chat label, and up to five avatars return. Share stays icon-only below `sm`.
  - **Main row:** at `lg` and above, a relative `min-w-0 flex-1` canvas column plus, when chat is open, one complementary panel (`lg:w-80`, left border). Below `lg` that same panel is the bottom flex child, capped at `max-h-[70%]`, with no second copy, scrim, or focus trap. The canvas column holds the canvas and `TurnBar`.
  - **Floating over the canvas:**
    - `TurnBar`: top center, glass pill
    - `ShapePanel`: bottom center, glass pill, holder only
    - `CanvasControls`: bottom left, glass pill with undo, redo, Delete selected (holder only), zoom, fit
    - `ConnectionBanner`: a full-width strip under the navbar, warning-tinted
- **Dialogs:** a centered `rounded-3xl` card on `--collab-elevated`, with a `bg-black/60 backdrop-blur-sm` scrim. Escape closes it and focus is trapped.
- **Read-only state:** while you're not holding the turn, the canvas shows no editing affordances (no shape panel, toolbar, or resize handles). The turn bar says why, so it never looks broken.

## S24 chat layout

Implemented under `specs/24-project-chat-panel.md` and code-approved by Codex. Browser layout, keyboard/focus, live-media and two-account checks remain open; see HANDOFF.md. Chat starts closed on a new project route. One `<aside role="complementary">` is mounted only while the workspace is ready and the panel is open. At `lg` and above it is a `w-80` right column with a left border. Below `lg` it is the bottom flex child of the workspace main area, `max-h-[70%]`, with a top border. There is no scrim, focus trap, or `aria-modal`. The canvas and navbar stay available. Opening and closing resize the canvas through flex. The page does not call `fitView`.

The navbar Chat button is `#project-chat-toggle`. It sets `aria-expanded` and `aria-controls="project-chat-panel"`. The accessible name includes the unread count, and the visible badge shows `99+` above 99. The panel header has a sound toggle (`aria-pressed`) and Close chat. Escape closes the panel only while `matchMedia("(max-width: 1023px)")` matches, then focus returns to the toggle. Composer keys stop at the panel so they do not reach the canvas. Enter sends, Shift+Enter inserts a newline, and an IME composition Enter does not send.

The message list is the only vertical scroller. The first load and the user's own successful send move to the bottom. A live message follows only when the reader was already within 64px of the bottom. Load earlier and its Retry button capture the first visible message and its offset before the request. A failed earlier page keeps that anchor and the current messages until the reader scrolls. Scrolling while the earlier page is pending or failed releases the old anchor, and Retry captures the row now in view. A later live row or media resize keeps that new position when the reader is away from the bottom. Late image or video growth is observed on the message content, not the fixed panel height. That growth follows the bottom only when the reader is already near it. Otherwise it keeps the visible message and offset. A stable polite region shows `Sam is typing…`, `Sam and Jo are typing…`, or `Several people are typing…`. Bubbles use plain text, `You` for the signed-in user, and `Deleted user` when the sender is missing. The visible time is timeago.js. The `<time>` element exposes the canonical ISO timestamp. Images and videos keep a labelled `target="_blank"` link. A local visual viewport hook sets the workspace shell height, with `h-[100dvh]` as the fallback. Reduced motion sets `scroll-behavior: auto` on the panel scroller. The sound preference is independent of the turn chime.

## S25 controls and shortcuts (implemented, Approved)

S25 passed Codex's final review on 2026-11-12. Committed as `c14a185` (commit 69, 2026-11-13). Code/effect/controlled-XYDrag tests pass; real browser layout, focus, touch hardware, IME and two-account behavior are still unverified. S28 adds ShareDialog and InvitationsList; browser and shared-project checks remain open. S29a and S29b are Approved and uncommitted. S30 adds the portfolio navbar link and is Ready for review; launch QA remains not run.

The bottom-left `CanvasControls` glass pill now starts with labelled `Undo` and `Redo` icon buttons (lucide `Undo2` / `Redo2`, `h-5 w-5`), then a thin divider, then the existing zoom in, zoom out and fit buttons. They are always visible. When unavailable (a watcher or viewer, saves pending, a replay, a gesture, or an empty stack) they render with the real `disabled` attribute and `disabled:opacity-40`; titles are `Undo (Ctrl+Z)` and `Redo (Ctrl+Shift+Z)`. A polite `role="status"` region at the end of the pill shows `Undoing…` or `Redoing…` during a replay and is empty (hidden) otherwise. No modal, toolbar row or preference was added. While a replay runs, ordinary canvas editing becomes read-only through the existing `selectCanEdit` gate (shape panel, toolbar, handles and resizer hide); selection, pan, zoom, chat, cursors and turn controls stay usable.

The canvas wrapper is the keyboard surface: `tabIndex=0`, `role="application"`, `aria-label="Diagram canvas"` and a `focus-visible` outline in `--collab-accent`. A pointer press on the React Flow pane focuses it, but not when the target is a button or chrome, or when a field already holds focus. A native `keydown` listener is attached to that element (bubbling phase, `useCanvasShortcuts`), never to `document` or `window`, so keys typed in a portaled editor never reach it. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes; unmodified `+`, `=` and `-` zoom for every role. Ctrl/Cmd with `+ - =` is left to browser zoom. Ignored: defaultPrevented, composition (`isComposing`, keyCode 229), repeat, any Alt combination, Ctrl+Meta together, events outside the surface, and targets or focused elements that are inputs, textareas, selects, contenteditable (any value but `false`, including descendants) or `role=textbox`. `preventDefault` and `stopPropagation` happen only when the store action actually accepted the command.

Gesture tracking uses React Flow's drag start/stop, `NodeResizer`'s resize start/end and connect start/end; each ends before its final commit. While active, capture-phase window cleanup also observes touchend/touchcancel stopped by d3 at the node, waits for the last finger, handles mouse/pen release/cancellation and window blur, and ignores an editor's blur. Cleanup clears tracking without dispatching an aborted gesture; normal completion still commits. Exact listeners are removed on cleanup. See the final S25 review and architecture contract; these tests do not replace browser/touch-hardware QA.

## Icons

lucide-react (already a dependency), stroke icons only. Use `h-4 w-4` inline and in meta, `h-5 w-5` in buttons, and `h-8 w-8` for empty-state features. Every icon-only button has an `aria-label`.

### S29b mobile, accessibility and empty canvas

Shapes can be added by click, tap, Enter or Space as well as by drag. Activation places the shape at the center of the visible canvas, then steps it 24 flow units so the next one does not sit on the same point. The step wraps after eight. The shape row scrolls sideways if it does not fit, and a drop on the panel itself does not add a node.

On a ready canvas with no nodes, a pointer-ignoring hint reads `Click a shape below to add it, drag one onto the canvas, or start from a template.` for the holder, `This canvas is empty.` for a viewer, and `This canvas is empty. Request the turn to start drawing.` for anyone else. It is not a live region.

The holder sees `Delete selected` after Redo. It is disabled until a node or edge is selected. A touch screen shows connection handles on the selected node without hover, and both connection and resize handles are 16px when the pointer is coarse. Desktop sizes stay 8px.

Below `sm` the navbar keeps the back icon, the project name, two avatars, a `+N` count, Share, and Chat. The words Projects and Chat, the role badge, and avatars after the second one return at `sm`.

After a dialog submit fails and the controls unlock, focus returns to the control that was in use when it is still inside the dialog and enabled. Otherwise it returns to the autofocus field, then the first tabbable control.

### S28 sharing and invitations

The Share dialog uses the common dialog shell and a scrollable body. Owners see invitation controls, pending invitations and member role/removal controls; members see a read-only roster and inline leave confirmation. The dashboard shows invitation cards above project lists, wrapping actions below the details on small screens.

### S31

The holder shape panel includes a Templates button after a divider. Starter templates opens a scrollable list of three preview cards with names, descriptions and Add to canvas actions; Close receives initial focus. Insertion adds without replacing existing content, then calls fitBounds on the new diagram.

### S32

The Starter templates dialog shows two groups with Eyebrow headings: group titles use `h3` and template names use `h4`. As built in S32, eleven cards shared one scrolling list under two groups; S33 below replaces that layout.

### S33

Seven wrapping pill group buttons use `aria-pressed` to identify the selected group. Only that group is visible; its scrolling list restarts at the top on a group change. The last group is remembered while the workspace stays open.
