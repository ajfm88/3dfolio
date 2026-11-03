# Slice 05: Projects Dashboard

**Lane:** client · **Depends on:** S03, S04 · **Unblocks:** S07

## Goal

`/collaborate` becomes the real projects dashboard. A signed-in user sees **My projects** and **Shared with me**. They can create a project, which takes them straight to `/collaborate/:projectId`. As the owner, they can edit a project's name and description and delete it. Clicking any card opens the workspace placeholder from S04, which S07 replaces.

Everything goes through the S03 REST API (`/api/projects`). There's no server change, no socket use, and no new dependency. The **Invitations** list is S28, not this slice.

## Design

New and changed files:

```text
src/collaborate/
├── collaborate.css                      ← edit: tokens also on .collab-portal
├── lib/
│   └── projectLimits.js                 ← new: client mirror of the project limits
├── store/
│   └── useProjectsStore.js              ← new: list, create, update, delete
├── routes/
│   └── ProjectsPage.jsx                 ← rewrite: replaces the S04 placeholder
└── components/
    ├── ui/
    │   └── Dialog.jsx                   ← new: portaled, focus-trapped dialog shell
    └── projects/
        ├── ProjectCard.jsx              ← new
        └── ProjectDialogs.jsx           ← new: create, edit, delete
```

`Collaborate.jsx`, `WorkspacePage.jsx`, `useSessionStore.js`, and `axios.js` are **not** changed.

### Page layout

This follows `3-ui-context.md` → Layout Patterns → Dashboard.

```text
┌──────────────────────────────────────────────────────────────┐
│ [logo] ajfm88 Collaborate                  [+ New project] ◯ │  ← header row (◯ = Clerk UserButton)
│        ← Back to portfolio                                   │
│                                                              │
│ MY PROJECTS · 3                                              │  ← eyebrow + count
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│ │ card     │ │ card     │ │ card     │                       │  ← grid 1 / sm:2 / lg:3
│ └──────────┘ └──────────┘ └──────────┘                       │
│                                                              │
│ SHARED WITH ME · 0                                           │
│ ┌──────────────────────────────────────┐                     │
│ │ (icon) Nothing shared with you yet.  │                     │  ← empty state
│ └──────────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

- Page column: `mx-auto max-w-6xl p-4 sm:p-6`.
- **Header row:** on the left, the logo (`LOGO_SRC`, `h-8 w-8`), the title `ajfm88 Collaborate` (`text-2xl font-bold`), and under it a `Link` to `/` reading `← Back to portfolio` (`text-xs text-[var(--collab-muted)] hover:text-[var(--collab-accent-2)]`, as in chat's sidebar). On the right, the **New project** primary button (lucide `Plus` `h-5 w-5`), then `<UserButton />` from `@clerk/clerk-react`.
- **Sections:** each heading is an eyebrow (`text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]`) reading `My projects` or `Shared with me`, followed by `· N` in `text-[var(--collab-faint)]`. Below it, a grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`. The sections are separated by `mt-10`.
- **Owned cap:** when `owned.length >= MAX_OWNED_PROJECTS`, **New project** is disabled. A meta line under the header reads `You own 20 of 20 projects. Delete one to create another.` (`text-xs text-[var(--collab-warning)]`). The server still enforces the cap; this only mirrors it.

### States

| State | Shows |
| --- | --- |
| First load in progress (`!hasLoaded && isLoading`) | The header row, then a centered spinner (the same markup as `CollaborateLoader`, without `min-h-[100dvh]`, inside `py-24`) |
| Load failed (`!hasLoaded && loadError`) | The header row, then a `rounded-2xl` panel: `Couldn't load your projects.` and a secondary **Try again** button that calls `loadProjects()` |
| Loaded | Both sections. A section with no items shows its empty state |

**Empty states**: a `rounded-2xl border border-dashed border-[var(--collab-border)] bg-[var(--collab-panel)] p-8 text-center` panel with a lucide icon (`h-8 w-8 text-[var(--collab-faint)]`), one line of copy (`text-sm text-[var(--collab-muted)]`), and an optional call to action:

| Section | Icon | Copy | Call to action |
| --- | --- | --- | --- |
| My projects | `FolderPlus` | `You don't have any projects yet.` | Primary **New project** button (also disabled at the cap) |
| Shared with me | `Users` | `Nothing shared with you yet. Projects you're invited to appear here.` | none |

### `ProjectCard`

```text
┌─────────────────────────────────────┐
│ Payments platform          [✎] [🗑] │  ← name (link) · owner-only actions
│ Event-driven checkout with a        │  ← description, 2 lines max
│ ledger service…                     │
│                                     │
│ [owner]  👥 3  ·  updated 5 min ago │  ← role badge · memberCount · timeago
└─────────────────────────────────────┘
```

- `relative rounded-2xl border border-[var(--collab-border)] bg-[var(--collab-panel)] p-5 transition-colors hover:border-[var(--collab-border-strong)] hover:bg-[var(--collab-panel-2)]`.
- **Whole card clickable, with valid HTML.** The project name is a `<Link to={`/collaborate/${project._id}`}>` with `after:absolute after:inset-0 after:content-['']`, so its pseudo-element covers the card. The action buttons sit above it with `relative z-10`. Don't wrap buttons inside a link or a clickable `div`.
- **Name:** `text-base font-semibold text-[var(--collab-text)] truncate`, with a `focus-visible` ring (`focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--collab-accent-2)] after:rounded-2xl`) so keyboard focus shows on the whole card.
- **Description:** `mt-2 text-sm text-[var(--collab-muted)] line-clamp-2`. When it's empty, show `No description` in `text-[var(--collab-faint)]`. The installed Tailwind (3.4.19) ships `line-clamp` in core, so no plugin is needed.
- **Footer** (`mt-4 flex items-center gap-3 text-xs text-[var(--collab-faint)]`):
  - Role badge, `rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize`:
    - owner: `bg-[var(--collab-elevated)] text-[var(--collab-accent-2)] border border-[var(--collab-border-strong)]`. Don't put an opacity modifier on a `var()` color: Tailwind can't apply alpha to an unparsed variable.
    - editor: `text-[var(--collab-success)] border border-[var(--collab-border)]`.
    - viewer: `text-[var(--collab-muted)] border border-[var(--collab-border)]`.
  - lucide `Users` `h-4 w-4` + `memberCount`, with an `aria-label` / `title` of `N people have access`.
  - `updated {format(project.updatedAt)}` using `format` from `timeago.js`.
  - **Shared cards only** (role isn't `owner`): `by {owner.fullName}` after a `·`. If `owner` is `null`, omit it.
- **Owner-only actions** (`role === "owner"`): two icon buttons at the top right, `relative z-10 rounded-lg p-1.5 text-[var(--collab-muted)] hover:bg-[var(--collab-elevated)] hover:text-[var(--collab-text)]`:
  - `Pencil` (`h-4 w-4`), `aria-label="Edit project"`, opens the edit dialog.
  - `Trash2` (`h-4 w-4`), `aria-label="Delete project"`, hover text `--collab-error`, opens the delete dialog.
  - Shared cards render **no** action buttons.
- `ProjectCard` receives `project`, `onEdit`, and `onDelete` as props. It doesn't touch any store.

### Dialogs

All three use the `Dialog` shell. `ProjectsPage` owns which dialog is open: `{ kind: "create" | "edit" | "delete", project? }` in local state, or `null`.

| Dialog | Title | Body | Buttons |
| --- | --- | --- | --- |
| Create | `New project` | **Name** input (`maxLength` 80, placeholder `Untitled project`, autofocus) and **Description** textarea (`maxLength` 500, 3 rows, optional). Both show a `n/80` / `n/500` counter in meta style | **Cancel** (secondary) · **Create project** (primary) |
| Edit | `Edit project` | Same fields, prefilled from the project | **Cancel** · **Save changes**, disabled when neither trimmed value changed or the trimmed name is empty |
| Delete | `Delete project?` | `{name} and its canvas will be permanently deleted for everyone who has access. This can't be undone.`, with the name in `font-semibold text-[var(--collab-text)]` | **Cancel** (autofocused) · **Delete project** (danger: `bg-[var(--collab-error)] text-white`) |

- **Submitting:** while a request is in flight, disable every control in the dialog (including Cancel, Escape, and the scrim) and show `Loader2` with `animate-spin` in the primary button. Re-enable on failure, and keep the user's input.
- **Create:** send `{ name, description }`. A blank name is allowed, and the server stores `"Untitled project"`. On success, close and `navigate(`/collaborate/${project._id}`)` (core user flow step 3).
- **Edit:** send **only the fields that changed**, trimmed: `{ name? , description? }`. On success, close and toast `Project updated`.
- **Delete:** on success, close and toast `Project deleted`.
- **Errors:** the store toasts the server's `message` (fallbacks below), and the dialog stays open.

### `Dialog` shell (`components/ui/Dialog.jsx`)

A reusable dialog that S28's ShareDialog will also use.

```jsx
<Dialog open onClose={fn} labelledBy="id" dismissible={!submitting}>{children}</Dialog>
```

- Return `null` when it's not `open`.
- `createPortal` into `document.body`. Add a comment explaining why, as the admin modals do: a transformed ancestor becomes the containing block for `position: fixed`.
- **Theme across the portal.** The portal sits outside `.collab-root`, so the `--collab-*` variables wouldn't resolve. The outermost portaled element gets the class `collab-portal`, and `collaborate.css` defines the tokens on it (see below).
- **Markup:** a scrim `fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm` containing a panel `w-full max-w-md rounded-3xl border border-[var(--collab-border)] bg-[var(--collab-elevated)] p-6 shadow-2xl shadow-black/40` with `role="dialog" aria-modal="true" aria-labelledby={labelledBy}`.
- **Escape** calls `onClose` when `dismissible`. **Scrim click** (`mousedown` that both starts and ends on the scrim itself, not the panel) calls `onClose` when `dismissible`.
- **Focus:**
  - On open, focus the first element with `autoFocus`, else the first focusable element in the panel.
  - **Tab** and **Shift+Tab** wrap within the panel. Use a `keydown` listener on the panel that collects `button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])` that aren't disabled.
  - On close, return focus to the element that was focused when the dialog opened.
- **Body scroll:** set `document.body.style.overflow = "hidden"` while open, and restore the previous value on close or unmount.
- No animation library: don't use framer-motion inside the collaborate chunk.

### `collaborate.css` (edit)

Split the `.collab-root` block so a portaled dialog gets the theme without the page background:

```css
.collab-root,
.collab-portal {
  /* all 17 --collab-* tokens, unchanged */
  color-scheme: dark;
  color: var(--collab-text);
}

.collab-root {
  /* background, overscroll-behavior, -webkit-tap-highlight-color: unchanged */
}
```

Add a short comment on why `.collab-portal` exists. Don't change any values.

## Implementation

### `src/collaborate/lib/projectLimits.js` (new)

```js
export const MAX_OWNED_PROJECTS = 20;
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 500;
```

Add a comment that these mirror `server/src/lib/projectAccess.js`, which can't be imported here because it imports Mongoose, and that the server stays authoritative.

### `src/collaborate/store/useProjectsStore.js` (new)

```js
state:   { owned: [], shared: [], isLoading: false, hasLoaded: false, loadError: false }
actions: loadProjects(), createProject({ name, description }), updateProject(id, patch), deleteProject(id)
```

- **`loadProjects()`** is the dashboard's mount action:
  - First reset to `{ owned: [], shared: [], hasLoaded: false, loadError: false }`, then set `isLoading: true`.
  - Then `GET /projects` and set `owned`, `shared`, `hasLoaded: true`.
  - On failure, toast the message (fallback `Failed to load your projects`) and set `loadError: true`.
  - Finally, `isLoading: false`.
  - Resetting first is deliberate. The store is module-level and outlives the route, so without it a re-entry, or signing in as a different account, would briefly render the previous visit's or the previous user's projects. Comment why.
- **`refreshProjects()`** (internal; may be exported for S28): the same `GET`, **without** the reset and without touching `isLoading`. On failure, keep the current lists and toast. It's called after every successful mutation, so the lists always match the server's order (`updatedAt` desc) and fields.
- **Latest-wins guard:** keep a module-level `let listRequest = 0`. Both load and refresh capture `const request = ++listRequest` and apply results (and `finally` state) only if `request === listRequest`. This is the same pattern and reason as `authRequest` in `useSessionStore.js`.
- **`createProject(input)`**: `POST /projects`, then `refreshProjects()` without awaiting it, then return `res.data.project`. On failure, toast the message (fallback `Failed to create the project`) and return `null`.
- **`updateProject(id, patch)`**: `PATCH /projects/:id` with `patch`, then `await refreshProjects()`, then return `true`. On failure, toast (fallback `Failed to update the project`) and return `false`.
- **`deleteProject(id)`**: `DELETE /projects/:id`, then `await refreshProjects()`, then return `true`. On failure, toast (fallback `Failed to delete the project`) and return `false`.
- **A 404 on edit or delete** (the project was deleted, or you were removed, elsewhere) toasts the server's `Project not found`, calls `refreshProjects()` so the stale card disappears, and returns `false`. The dialog closes in that case: `ProjectsPage` closes it when the action returns `false` **and** the project is no longer in either list after the refresh.
- Use `axiosInstance` from `../lib/axios`. Don't use sockets. Success toasts are the page's job, not the store's.

### `src/collaborate/routes/ProjectsPage.jsx` (rewrite)

- Remove the S04 placeholder content: the connection line and `Signed in as`.
- Call `loadProjects()` on mount (`useEffect(..., [loadProjects])`).
- Render the header, the states, the two sections, and the open dialog as described above.
- Hold the open-dialog state and a `submitting` flag. Call the store actions, then close, navigate, or toast as described in Dialogs.
- Read state with store selectors only. No `axios`, no `socket`.

### `src/collaborate/components/projects/ProjectCard.jsx` (new)

As specified in Design.

### `src/collaborate/components/projects/ProjectDialogs.jsx` (new)

Export `CreateProjectDialog`, `EditProjectDialog`, and `DeleteProjectDialog`. Each:

- Takes `{ open, project?, submitting, onSubmit, onClose }` and renders through `Dialog`.
- `onSubmit` receives the trimmed values (create), only the changed fields (edit), or nothing (delete).
- Inputs:
  - **Labels:** `text-xs font-medium uppercase tracking-wider text-[var(--collab-muted)]`.
  - **Fields:** `w-full rounded-xl border border-[var(--collab-border)] bg-[var(--collab-panel-2)] px-3 py-2 text-sm text-[var(--collab-text)] placeholder:text-[var(--collab-faint)] focus:border-[var(--collab-border-strong)] focus:outline-none`.
  - `maxLength` comes from `projectLimits.js`.
- **Enter** in the name input submits (a `<form onSubmit>`). Enter in the description textarea inserts a newline.
- **Secondary button:** `rounded-xl border border-[var(--collab-border)] px-4 py-2 text-sm font-semibold text-[var(--collab-text)] hover:bg-[var(--collab-panel-2)]`.
- **Primary button:** the gradient primary from `3-ui-context.md`, at `rounded-xl px-4 py-2 text-sm`.

### Out of scope

- Invitations, members, sharing, and leaving a project (S26, S28).
- Any workspace content. `WorkspacePage` stays the S04 placeholder.
- Socket listeners. The dashboard isn't live; changes made elsewhere appear on the next load.
- Search, sorting controls, pagination (owned is capped at 20).
- Server, `App.jsx`, `package.json`, `vite.config.js`, or Tailwind config changes.

## Dependencies

- None. Everything used is already installed: `react-router-dom`, `react-toastify`, `timeago.js`, `lucide-react`, `zustand`, `@clerk/clerk-react`, and `react-dom`'s `createPortal`.

## Verify when done

Local server against the **live** database (Q2). Clean up every project you create.

To run it locally (see the S04 review in the tracker):
- **Server:** `CLIENT_URL=http://localhost:5173` in the process environment, since `server/.env` lists only the production origins.
- **Frontend:** `VITE_CLERK_PUBLISHABLE_KEY` (the same value as `CLERK_PUBLISHABLE_KEY` in `server/.env`) and `VITE_API_URL=http://localhost:3000/api`, passed on the command line.
- Don't create or edit any `.env` file.

- [ ] **Empty states:** with an account that owns nothing and has nothing shared, both empty states render, and **New project** works from both places.
- [ ] **Create:**
  - [ ] With a blank name → you land on `/collaborate/<new id>`. Back on the dashboard, the card reads `Untitled project` with the `owner` badge, `1`, and `updated just now`.
  - [ ] With a name and description → you land on the new id, and the card shows both. The newest project is first.
  - [ ] Typing past 80 / 500 characters isn't possible (`maxLength`), and the counters are right.
- [ ] **Edit:**
  - [ ] Pencil → prefilled. **Save changes** is disabled until something changes.
  - [ ] Changing only the description sends only `description` (DevTools → Network → payload).
  - [ ] A whitespace-only name keeps Save disabled.
  - [ ] On success, the toast `Project updated` appears and the card moves to the top.
- [ ] **Delete:** trash → confirm → the toast `Project deleted`, and the card is gone. Reloading confirms it's gone.
- [ ] **Errors:**
  - [ ] Stop the server, then create → a toast appears, the dialog stays open with the input kept, and the buttons re-enable.
  - [ ] Delete the project from another tab first, then edit it in this one → the toast `Project not found`, the dialog closes, and the card disappears.
- [ ] **Cap:** with 20 owned projects (scratch-seed them from a one-off script outside the repo, then delete them), **New project** is disabled and the warning line shows.
- [ ] **Shared:**
  - [ ] Add account B to one of A's projects as a viewer with a scratch `updateOne`, since there's no invite API until S26.
  - [ ] B's dashboard shows it under **Shared with me** with the `viewer` badge, `by <A's name>`, and **no** edit or delete buttons. Clicking it opens the placeholder.
  - [ ] Remove B again afterwards.
- [ ] **Navigation:**
  - [ ] Clicking anywhere on a card (not its buttons) opens `/collaborate/<id>`. The action buttons don't navigate.
  - [ ] **Back to portfolio** goes to `/`, and the socket closes (S04 behavior).
- [ ] **Account switch:** sign out with `UserButton`, then sign in as another account → no project from the first account ever renders, even briefly.
- [ ] **Dialog:**
  - [ ] Escape and a scrim click close it; neither does anything while submitting.
  - [ ] Tab and Shift+Tab stay inside it, and focus returns to the button that opened it.
  - [ ] The page behind doesn't scroll.
  - [ ] Dialog colors match the theme (proof that `.collab-portal` works): elevated panel, light text, no unstyled default colors.
- [ ] **Keyboard:** Tab reaches every card and action button, and Enter on a focused card opens it. Icon buttons have their `aria-label`s.
- [ ] No raw hex or Tailwind palette colors in the new JSX. No imports from `src/chat/`, `src/blog/`, or `framer-motion`. Components don't import `axios` or the socket.
- [ ] `/blog` loads, and `/chat` loads and connects.
- [ ] `npm run build` at the repo root passes with no new warnings from collaborate code. The entry chunk is the same size as after S04 (577.55 kB, give or take a few bytes). `cd server && npm test` passes (unchanged).
- [ ] `git status` shows only the files listed in Design, plus `context/6-progress-tracker.md`, along with S04's still-uncommitted files. No scratch scripts are left in the repo, and all test projects have been deleted.
- [ ] `context/6-progress-tracker.md`: S05 marked **Ready for review** with a slice note.
