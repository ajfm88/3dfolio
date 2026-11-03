# Slice 04: `/collaborate` Route Shell and Session

**Lane:** client · **Depends on:** — · **Unblocks:** S05

## Goal

`/collaborate` exists as its own lazy route chunk. A signed-out visitor sees a sign-in gate. A signed-in visitor gets their synced Mongo user from `/auth/check`, an authenticated Socket.io connection, and placeholder pages for the dashboard (`/collaborate`) and the workspace (`/collaborate/:projectId`). S05 replaces the dashboard placeholder, and S07 replaces the workspace placeholder.

There's no server change and no new dependency. The existing handshake middleware already authenticates the socket, and the existing `connection` handler accepts it.

## Design

New and changed files:

```text
src/
├── App.jsx                                  ← edit: lazy /collaborate/* route
├── pages/
│   └── Collaborate.jsx                      ← new: lazy route root
└── collaborate/
    ├── collaborate.css                      ← new: scoped theme under .collab-root
    ├── lib/
    │   └── axios.js                         ← new: own instance + Bearer interceptor
    ├── store/
    │   └── useSessionStore.js               ← new: authUser, socket, isConnected
    └── routes/
        ├── CollaborateAuthGate.jsx          ← new: signed-out card
        ├── ProjectsPage.jsx                 ← new: placeholder (S05 replaces)
        └── WorkspacePage.jsx                ← new: placeholder (S07 replaces)
```

Nothing outside `src/pages/Collaborate.jsx` imports from `src/collaborate/` (invariant 8). Nothing in `src/collaborate/` imports from `src/chat/` or `src/blog/` (invariant 9). Chat's patterns are **copied and adapted**. `src/constants/brand.js` may be imported.

### Render states

`Collaborate.jsx` picks exactly one of these, for every path under `/collaborate`:

| Clerk | Session store | Renders |
| --- | --- | --- |
| `!isLoaded` | — | Loader |
| loaded, signed out | — | `CollaborateAuthGate` (on every sub-path, so a deep link shows the gate and keeps its URL) |
| signed in | `isCheckingAuth` | Loader |
| signed in | done, `authUser === null` | Session error card with **Try again** |
| signed in | done, `authUser` set | Nested routes (below) |

Nested routes:

| Path | Element |
| --- | --- |
| index | `ProjectsPage` |
| `:projectId` | `WorkspacePage` |
| `*` | `<Navigate to="/collaborate" replace />` |

The socket's lifetime is tied to the `/collaborate` route. It opens after `/auth/check` succeeds. It closes on sign-out and when the user navigates away from `/collaborate` (the route root unmounts). An idle socket left behind while the user browses the portfolio would keep a connection open for nothing, and it would keep the user online in `/chat`'s presence (see the note under Implementation → `useSessionStore.js`).

## Implementation

### `src/App.jsx` (edit)

- Add `const Collaborate = lazy(() => import("./pages/Collaborate"));` next to the other lazy pages.
- Add a route after `/chat/*`:

  ```jsx
  <Route
    path="/collaborate/*"
    element={
      <LazyRoute feature="Collaborate">
        <Collaborate />
      </LazyRoute>
    }
  />
  ```

- No other change to this file.

### `src/pages/Collaborate.jsx` (new)

Model it on `src/pages/Chat.jsx`, including its top-of-file comment voice: explain that everything imported here stays in the lazy chunk.

- Imports: `ClerkProvider` and `useAuth` from `@clerk/clerk-react`; `Navigate`, `Route`, and `Routes` from `react-router-dom`; `ToastContainer` from `react-toastify` and `"react-toastify/dist/ReactToastify.css"`; `"../collaborate/collaborate.css"`; the three route components; and `useSessionStore`.
- Read `VITE_CLERK_PUBLISHABLE_KEY` and throw `new Error("Missing VITE_CLERK_PUBLISHABLE_KEY")` if it's missing, exactly like Chat. `LazyRoute`'s boundary turns that into the feature error screen.
- `CollaborateLoader`: same markup as `ChatLoader`, using `--collab-border-strong` and `--collab-accent-2`.
- `SessionErrorCard` (local component in this file): the auth gate's card layout (centered `rounded-3xl` glass card, `max-w-md`). Eyebrow `Collaborate`, title `We couldn't verify your session`, body `Check your connection and try again.`, and one primary button, **Try again**, that calls `checkAuth()`.
- `CollaborateApp` (under `ClerkProvider`):
  - Effect on `[isLoaded, isSignedIn, checkAuth, clearAuth]`: if `!isLoaded`, return. If signed in, call `checkAuth()`. Otherwise call `clearAuth()`. This is the same as Chat.
  - A **separate** unmount effect, `useEffect(() => () => useSessionStore.getState().resetSession(), [])`, closes the socket and resets the session when the user leaves `/collaborate`. Add a short comment explaining why.
  - Wrapper: `<div className="collab-root min-h-[100dvh]">`, then the render-state table above.
- `Collaborate` default export: `<ClerkProvider publishableKey={…}><CollaborateApp /><ToastContainer position="bottom-right" /></ClerkProvider>`.

### `src/collaborate/collaborate.css` (new)

- A top comment in the voice of `chat.css`. It explains that the file is imported from `Collaborate.jsx`, ships in the lazy chunk, and is scoped under `.collab-root` so nothing leaks to `/`, `/blog`, `/chat`, `/gft`, or the admin panel.
- `.collab-root` defines **every** token in `3-ui-context.md` → Colors, with exactly those names and values (`--collab-bg` through `--collab-warning`, 17 variables).
- Also on `.collab-root`, copied from `.chat-root`: `color-scheme: dark`, `color: var(--collab-text)`, the background (`radial-gradient(ellipse at 50% 0%, rgba(112, 66, 248, 0.12), transparent 60%), var(--collab-bg)`), `overscroll-behavior: none`, and `-webkit-tap-highlight-color: transparent`, each with a short why-comment like chat's.
- `@keyframes collab-float-y`, the same as `chat-float-y`, for the gate's logo tile.
- Nothing else. No global selectors.

### `src/collaborate/lib/axios.js` (new)

- Copy `src/chat/lib/axios.js`: export `axiosInstance` with `baseURL: import.meta.env.VITE_API_URL` and the async request interceptor that adds `Authorization: Bearer <token>` from `window.Clerk?.session?.getToken()`.
- Rewrite the comments for collaborate. Every `/api/projects` route sits behind `protectRoute`, so the header is required.

### `src/collaborate/store/useSessionStore.js` (new)

A zustand store adapted from `src/chat/store/useAuthStore.js`, keeping its comment voice. Chat's `onlineUsers` presence isn't carried over: workspace presence comes from `presence:update` in S17.

```js
state: { authUser: null, isCheckingAuth: true, socket: null, isConnected: false }
actions: checkAuth(), clearAuth(), connectSocket(user), disconnectSocket(), resetSession()
```

- `SOCKET_URL`: same derivation as chat (`VITE_API_URL` with a trailing `/api` stripped).
- **`checkAuth()`**:
  - Set `isCheckingAuth: true`.
  - `GET /auth/check` through `axiosInstance`.
  - On success: set `authUser` to the response data, then call `connectSocket(res.data)`.
  - On failure: toast `error.response?.data?.message || "Failed to verify your session"`, and set `authUser: null`.
  - Finally: set `isCheckingAuth: false`.
  - **Stale-result guard.** Keep a module-level counter (`let authRequest = 0`). `checkAuth` captures `const request = ++authRequest` before the request. After the await, if `request !== authRequest`, it returns without touching state or connecting. `clearAuth` also increments the counter. Without the guard, a check that resolves after sign-out would reconnect a socket for a signed-out user. Comment why.
- **`clearAuth()`**: increment `authRequest`. Set `authUser: null, isCheckingAuth: false`. Call `disconnectSocket()`.
- **`connectSocket(user)`**:
  - Return if `!user` or **`get().socket` already exists**. Guard on existence, not on `.connected` as chat does. A socket that's still connecting isn't `connected` yet, and under React StrictMode's double-invoked effects two overlapping `checkAuth` calls would otherwise open two sockets. Comment why.
  - `io(SOCKET_URL, { auth: async (cb) => cb({ token: await window.Clerk?.session?.getToken() }) })`. Keep chat's comment explaining why `auth` is a function (a fresh token on every reconnect).
  - `set({ socket })`.
  - `connect` sets `isConnected: true`. `disconnect` sets `isConnected: false`.
  - `connect_error`: `console.error("Collaborate socket connection failed:", error.message)`, no toast, with the same reasoning as chat.
  - Register no other listeners. Later slices add theirs per socket in their own stores (`4-code-standards.md` → React).
- **`disconnectSocket()`**:
  - If a socket exists, call `socket.removeAllListeners()` and `socket.disconnect()`, **even if it isn't connected yet**. A socket that's still connecting otherwise keeps retrying in the background.
  - Set `socket: null, isConnected: false`.
- **`resetSession()`** (added in review): increment `authRequest`, close the socket as `disconnectSocket` does, and set `authUser: null, isCheckingAuth: true`. Only the route's unmount effect calls it. Without it, coming back to `/collaborate` renders the pages for a frame with the previous visit's session before `checkAuth` starts, which mounts them twice.
- **Presence note** (a comment above `connectSocket`). The server's `connection` handler registers chat's presence for **every** authenticated socket, so while this socket is open the user shows as online in `/chat`. That's accepted for now and recorded as Q4 in the progress tracker. Don't change the server in this slice.

### `src/collaborate/routes/CollaborateAuthGate.jsx` (new)

- Copy the structure of `ChatAuthGate.jsx`, including its comment voice.
- Use `--collab-*` tokens everywhere. Don't use raw hex: the primary button is `bg-gradient-to-b from-[var(--collab-accent-2)] to-[var(--collab-accent)]` with `shadow-[0_10px_30px_-8px_var(--collab-accent-glow)]`. The logo tile uses `animate-[collab-float-y_4.5s_ease-in-out_infinite] motion-reduce:animate-none`.
- Copy:
  - Eyebrow: `Secure entry`.
  - Title: `ajfm88 Collaborate`.
  - Body: `Design software architectures together on a shared canvas, one editor at a time. Sign in to see your projects.`
  - Button: `Continue`.
  - Footer: `Protected session · TLS encryption`.
- `<SignInButton mode="modal">`, with **no** `fallbackRedirectUrl` or `forceRedirectUrl`. The modal returns to the current URL, so a deep link to `/collaborate/:projectId` survives sign-in.

### `src/collaborate/routes/ProjectsPage.jsx` (new, placeholder)

Temporary, replaced in S05. Keep it minimal, using the tokens and typography from `3-ui-context.md`:

- Centered column, `mx-auto max-w-6xl p-4 sm:p-6`.
- Eyebrow `Collaborate`, then title `Projects` (`text-2xl font-bold`).
- `text-sm text-[var(--collab-muted)]`: `Signed in as {authUser.fullName}`.
- A connection line (`text-xs`): a `h-2 w-2 rounded-full` dot, `bg-[var(--collab-success)]` when `isConnected` and `bg-[var(--collab-warning)]` otherwise, followed by `Live connection: connected` / `Live connection: connecting…`.
- Read `authUser` and `isConnected` with store selectors. No axios or socket calls.
- A one-line comment: placeholder until S05.

### `src/collaborate/routes/WorkspacePage.jsx` (new, placeholder)

Temporary, replaced in S07:

- `useParams()` for `projectId`.
- Same column as above: a `Link` back to `/collaborate` (lucide `ArrowLeft` `h-4 w-4` plus `Projects`), title `Workspace`, and `text-xs text-[var(--collab-faint)] font-mono` showing the `projectId`.
- No fetch. A one-line comment: placeholder until S07.

### Out of scope

- No server, `server/readme.md`, `vite.config.js`, `package.json`, Navbar, `vercel.json`, or `.env*` changes. `vercel.json` already rewrites every path to `index.html`.
- No projects store, dashboard UI, React Flow, or workspace socket events.
- No changes to `src/chat/**` or `src/blog/**`, even though chat's `connectSocket` has the StrictMode issue fixed here. That issue is recorded in the tracker's Session Notes.

## Dependencies

- None. Everything used is already installed: `@clerk/clerk-react`, `react-router-dom`, `react-toastify`, `zustand`, `socket.io-client`, `axios`, `lucide-react`.

## Verify when done

Run the frontend with `npm run dev` and `.env` setting `VITE_API_URL=http://localhost:3000/api`, against the local server (`cd server && npm run dev`).

- [ ] **Baseline first:** before changing anything, run `npm run build` and record the entry chunk's file name and size (the `index-*.js` that `dist/index.html` loads). Record it again after the slice. The size is unchanged except for the few bytes of the new lazy import and route.
- [ ] The build output contains a separate `Collaborate-*.js` chunk (and its CSS). `grep` the entry chunk for `collab-root` and `useSessionStore`'s socket URL code: neither is present.
- [ ] Signed out, `/collaborate` and `/collaborate/<any id>` both show the gate, the URL is unchanged, and no WebSocket is opened (DevTools → Network → WS is empty).
- [ ] Signing in through the modal from `/collaborate/<id>` lands on the workspace placeholder for that same id, without a redirect.
- [ ] Signed in, `/collaborate` shows `Signed in as <name>` and `Live connection: connected`. DevTools → Network → WS shows **exactly one** socket.io connection with a `101` status (StrictMode is on in dev, so this proves the existence guard).
- [ ] Stopping the local server flips the line to `connecting…`. Restarting it reconnects to `connected` on its own, using a fresh token.
- [ ] `/collaborate/does/not/exist` redirects to `/collaborate`.
- [ ] Navigating from `/collaborate` to `/` (browser back, or editing the URL in-app) closes the WebSocket, as shown in DevTools. Coming back goes straight from the loader to the page, without flashing the page first.
- [ ] Signing out (via the Clerk user menu on `/blog` or `/chat`, then returning, or `await window.Clerk.signOut()` in the console) shows the gate and closes the socket.
- [ ] With the server stopped, a fresh load of `/collaborate` while signed in shows a toast and the session error card. Restart the server, click **Try again**, and the placeholder appears with a connected socket.
- [ ] `grep -rn "from \"../chat\|from \"../../chat\|src/chat\|/blog/" src/collaborate src/pages/Collaborate.jsx` finds nothing. No raw hex in `src/collaborate/**/*.jsx`.
- [ ] `/blog` loads posts, and `/chat` signs in, connects, and sends a DM, as before.
- [ ] `npm run build` at the repo root passes with no new warnings from collaborate code. `cd server && npm test` passes (unchanged).
- [ ] `git status` shows only the files listed in Design, plus `context/6-progress-tracker.md`.
- [ ] `context/6-progress-tracker.md`: S04 marked **Ready for review** with a slice note that includes the before and after entry chunk sizes.
