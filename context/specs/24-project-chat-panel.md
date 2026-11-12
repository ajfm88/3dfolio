# Slice 24 — Project chat panel

**Lane** client · **Depends on** S23 (Approved) · **Unblocks** S28

**Implementer** Grok · **Reviewer** Codex, assigned by the user

## Baseline and scope

Read AGENTS.md, its six context files in order, this spec, and S23's spec/final review. Inspect the actual S23 endpoints, current workspace binding, and existing DM components before editing. At planning, HEAD is `43eb732` (commit 67). S23 is approved in the working tree, including the empty-cursor correction; preserve it. The user may commit it before implementation: record the actual baseline. No commit is required to satisfy S24's Approved dependency.

Build project chat in the workspace: history, Load earlier, realtime messages, text plus one image/video attachment, typing, a collapsed unread badge, and a persisted sound toggle. Use the approved S23 API unchanged. All three roles can chat without a turn, including during canvas-only recovery. Keep the canvas/turn sync system intact. No membership UI, undo, backend changes, background project subscriptions, read receipts, optimistic message placeholders, or automatic send retries.

Mark S24 In progress first; finish the named work and verification, mark Ready for review, and stop. Never commit, push, branch, or deploy. Codex reviews afterward.

## Allowed files

| File | Work |
| --- | --- |
| `src/collaborate/store/useProjectChatStore.js` | New project chat state, REST, subscriptions, send, unread, preferences |
| `src/collaborate/lib/projectChat.js` | New pure validation, normalization, ordering, and merge helpers |
| `src/collaborate/lib/projectTyping.js` | New binding-owned typing expiry and outgoing burst timers |
| `src/collaborate/lib/projectMessageSound.js` | New optional Web Audio notification helper, adapted from DM pattern |
| `src/collaborate/hooks/useProjectChatScroll.js` | New message-list scroll and prepend anchoring behavior |
| `src/collaborate/hooks/useVisualViewportHeight.js` | New adapted visual viewport hook, no chat import |
| `src/collaborate/components/chat/ProjectChatPanel.jsx` | New responsive panel shell, header, controls, typing |
| `src/collaborate/components/chat/ProjectMessageList.jsx` | New loading/error/empty/history states |
| `src/collaborate/components/chat/ProjectMessageBubble.jsx` | New adapted bubbles with sender, timestamp, text and media |
| `src/collaborate/components/chat/ProjectComposer.jsx` | New text/file composition and preview |
| `src/collaborate/components/workspace/WorkspaceNavbar.jsx` | Chat toggle and unread badge |
| `src/collaborate/routes/WorkspacePage.jsx` | Bind chat, responsive main row, visual viewport height |
| `src/collaborate/store/useWorkspaceStore.js` | Export `selectCanChat` and capture/check the joined binding's account identity; preserve canvas/turn semantics |
| `src/collaborate/collaborate.css` | Scoped chat layout/scroll/focus styles if utilities do not suffice |
| `test/projectChat.test.mjs` | New client store/helper/lifecycle/typing regressions |
| `test/projectChatUi.test.mjs` | New rendering and testable scroll/composer behavior coverage |
| `context/2-architecture.md`, `context/3-ui-context.md`, `context/6-progress-tracker.md` | Actual architecture, UI behavior, evidence and status |

No dependencies, assets, manifests, backend, auth/session-store, shared canvas, or other-route changes. Copy/adapt useful DM patterns into collaborate; never import from `src/chat/` or `src/blog/`. The existing Dialog stays unchanged; no image lightbox is needed. Do not copy known DM shortcomings (blindly replacing message arrays after requests, clearing attachments on failed sends, or removing all listeners for an event).

## 1. Binding, readiness, and state ownership

Keep message server state and all network operations in `useProjectChatStore`; components call actions and render selectors. It may read/subscribe to `useWorkspaceStore` and `useSessionStore`. The workspace store must not import the chat store, preventing a circular dependency. Do not add chat to the canvas sync controller or the workspace empty-state reset.

Export a pure/read-only `selectCanChat(state)` selector from the workspace store, following the existing binding checks: status ready, owner/editor/viewer role, live current non-disposed binding, connected socket with the joined connection id, project id matching the binding, and current session user/socket ownership. Pin the binding to the account that established it; a different nonempty account id is not sufficient ownership, and a null/replaced session socket invalidates it immediately. Capturing/checking that account identity is explicitly allowed as a narrow binding metadata change. It must not require a holder or a non-syncing canvas. This selector gates sending and typing; do not substitute `selectCanEdit` or `selectIsHolder`. Keep their existing code and semantics intact.

`bindProjectChat(socket, projectId)` owns one binding and returns a disposer. WorkspacePage's existing effect binds both stores and disposes chat before workspace leave. Register chat listeners before join completion can produce message traffic. Chat must never emit workspace:join/leave itself. Use subscriptions or a narrowly scoped readiness callback to start history only after the matching workspace is ready. An initial status notification must not send under a stale previous binding. Account ownership belongs to the authenticated socket connection epoch: a workspace retry or route rebind cannot relabel that unchanged connection for another account. A changed account requires a fresh authenticated connection before a new matching join can grant chat authority.

Each REST operation, timer, listener and callback captures chat binding identity, canonical project id, account id, request generation, and socket connection epoch. Check ownership again after awaits and before state changes, toast, sound, clearing drafts, or timer expiry. Route A → B, account change/sign-out, socket replacement, disconnect, and same-project workspace retry invalidate old work. Old cleanup must not clear the new binding. StrictMode's mount/cleanup/remount must leave one listener per event and one workspace subscription.

Listen once per binding for `project:message`, `project:typing`, and needed connection/visibility events. Remove each exact listener by reference. Never use bare `off(event)` or removeAllListeners. Subscribe to workspace failure/ready transitions so a same-socket retry invalidates chat work too. Canvas-only syncing, turn changes, previews, cursor updates, and participant rerenders must not refetch history or reset messages.

On disconnect/rejoin loading: disable send/typing, clear remote/outgoing typing timers and private displayed history while the existing loading shell hides the canvas. Preserve the same-route draft/file, panel choice, and sound preference. Once a matching workspace rejoins, fetch the newest page as a fresh history window; older history is reachable again through Load earlier. This avoids claiming that one newest-page fetch recovered an arbitrarily long offline gap. No offline sends, replay, or chime for recovered history. Unread counts are live observations, not a count of messages missed offline.

On error/notFound or route/account disposal, clear project content, draft/file, unread, ids, timers, and pending operations; keep only the sound preference. Do not show stale private content in error/loading views. A closed panel remains subscribed while this workspace is ready. An obsolete HTTP result must never restore it.

Suggested state: messages; initial/earlier loading and error states; hasMore/nextCursor; isOpen; unreadCount; composerText; attachment File; isSending; typing user ids; isSoundEnabled. File/timer/controller handles are never persisted. Keep binding plumbing outside serialized state where practical. Store shape is implementation detail; behaviors below are required.

## 2. History, realtime, and ordering

Fetch `GET /projects/:id/messages` through collaborate's axios instance, with limit 50. Use S23's `{ messages, hasMore, nextCursor }`. Load earlier sends both `before` and `beforeId` from nextCursor through axios params; never synthesize an empty cursor or query a message id separately. One initial request and one earlier request per epoch at most. Retry controls retry only their failed operation, and errors must not reset the canvas or revoke the editing turn.

Validate inbound envelopes before publishing. Match the active project in the event and every resource; require valid message ids, canonical timestamp strings, bounded string text, and a sender projection or null. Ignore malformed or foreign events and fail malformed REST envelopes as a history/send error without inserting partial resources. Media URLs are empty or http(s); never render arbitrary executable schemes. For GET pages validate hasMore/cursor consistency and require a usable paired cursor when hasMore is true. Do not import server-only Mongoose helpers into the client.

Use one canonical merge/upsert path for initial pages, earlier pages, POST results, and socket events, keyed by `_id`. Sort oldest first by createdAt then `_id`, exactly as S23. Merge into the latest state after awaits. An initial GET that resolves after a live message must preserve that message. A delayed earlier GET must preserve subsequent messages and not replace the latest cursor with the current newest row. Cursor state follows the history request's page, not socket traffic. Avoid a non-advancing cursor loop.

No optimistic message is inserted. The same send may arrive socket-first or REST-first; produce one bubble either way, without duplicate unread or sound. Own messages from any tab are identified by the session Mongo user id; they never increment unread or play an incoming-message chime. Other users' unique live events count once. Track observed live ids separately if needed so replaying an already observed id cannot notify again after refreshing the history window. Fetching history never generates unread or sound.

The default panel state is closed on a new route binding. A unique live message from another user increments unread only while closed or document.hidden. An open visible panel clears unread; opening while the document is hidden does not mark it read. Returning to a visible document with the panel open clears it. Collapsing preserves history and draft/file. Show numeric unread on the navbar toggle, display 99+ above 99, and provide a readable accessible label. This is per active project/tab, not cross-project unread storage or server read receipts.

An incoming unique live message from another user plays one short chime when enabled, whether the panel is open or closed. History and own messages stay silent. Missing/suspended/throwing AudioContext must never break message delivery. Adapt the safe turn/DM Web Audio pattern locally. Default enabled; persist only this boolean in localStorage key `ajfm88-collaborate`, using zustand persist partialize or equivalent guarded storage. No project ids, drafts, messages, files, account data, unread, or panel state are persisted. Malformed or unavailable storage falls back safely. The existing turn-granted chime is independent and unchanged.

Initial loading has a spinner/status; an empty successful history says `No messages yet. Say hello!`. Initial failure shows `Couldn't load messages` and Retry. Earlier failure retains current messages and offers retry. While first history is unavailable, disable sending but keep a draft editable; after a successful history retry sending resumes. Errors use the server's message when present, with a concise fallback. Toast once for the current failed operation; do not toast obsolete requests.

## 3. Composer and media

Adapt the DM composer into ProjectComposer with a labelled textarea, attachment chooser, preview/remove, and send button. Text maxLength 2000 with a small length indicator near the limit. Enter sends, Shift+Enter inserts a newline, and IME composition Enter never sends. Stop canvas keyboard events from the composer; Delete/Backspace/undo/typing must not act on the diagram. No keyboard click sounds are required.

Accept one image/* or video/* file up to 25 * 1024 * 1024 bytes. Reject wrong MIME and oversized files before storing/uploading, with a toast. Text, media-only, and caption+media sends are supported. Blank text without a file does nothing. Client validation mirrors S23; backend remains authoritative. Do not manually set multipart Content-Type; FormData supplies the boundary. JSON is used for text-only requests, multipart with `text` and `media` for attachments.

The send action returns an explicit success/failure result. At send start, capture the draft, file and binding/epoch, set a single synchronous isSending gate for both JSON and multipart, and stop outgoing typing. Disable draft/file mutation and sending while submitting. No rapid Enter/click duplicate requests. On current success merge the server resource and clear only that submitted draft/file; on failure preserve both for an explicit user retry. Surface server messages, including 503, and never automatically resend after network failure. An uncertain send may have saved on the server; manual retry can duplicate it because S23 has no idempotency key. Do not claim exactly-once sends or invent a reconciliation protocol.

Disconnect invalidates the UI operation and stops its spinner, preserving draft/file. A late success/error from the old epoch must not clear the new draft or append into a different project. Rejoin history retrieves persisted messages. Route exit is allowed while a send is pending; it invalidates callbacks and discards the old route's draft/file. A request already accepted by the server may still persist there.

Create preview object URLs only in the UI's file lifecycle; revoke the previous URL on replacement, removal, successful clear, panel unmount and route exit. Closing the panel may revoke its URL but must preserve the File in the store and recreate the preview on reopen. Never persist object URLs or call createObjectURL during server rendering. No automatic attachment upload before Send.

## 4. Typing

All roles can send typing under selectCanChat, independent of the turn and canvas recovery. Emit `socket.volatile.emit("project:typing", { projectId, isTyping })`. Never queue offline typing or reconnect just to send it. Check the binding/epoch again when a timer fires. No userId is sent.

First actual nonblank text edit sends true. Continued typing refreshes true at most once per 2 seconds, so the receiver's 5-second expiry stays alive during a long burst; copying DM's one-true-per-unbounded-burst behavior would expire too early. After 2 seconds without input send false. Clearing, blur, send, panel close and live route disposal stop the burst with best-effort false, cancel all timers, and send nothing if no current live authority remains. File selection alone is not typing. No interval may continue after closure/disconnect/disposal.

Receive only matching-project, boolean-flag packets with valid userId. Ignore self (including own other tabs), unknown/nonparticipant users, malformed packets, and obsolete socket epochs. Names come from the latest workspace participants, not the packet. On true, arm/refresh a per-user 5-second expiry; on false, clear immediately. A new message from that user or a presence departure also clears typing. Participant profile updates change the name without erasing valid typing. Superseded expiry callbacks cannot clear a newer flag. Disconnect, failure, retry, binding replacement, and disposal clear all flags and timers.

Display `Sam is typing…`, two names for two typists, or `Several people are typing…` for more. Use a stable small status area; avoid announcing a countdown or every timer tick. No typing flags are persisted or sent to REST.

## 5. Layout, bubbles, scrolling, accessibility

Match collaborate tokens/typography/radii; no global CSS or raw color literals in components. Navbar adds a labelled Chat button with aria-expanded/aria-controls and unread. Preserve participant stack and role badge. Share remains S28. Ensure long project titles and the added button can shrink without horizontal page overflow.

At lg and above, the open panel is a nonmodal w-80 right column with a left border; the remaining canvas container stays relative, min-w-0, flex-1. TurnBar remains over the canvas container, not over chat. Opening/closing must resize the canvas without fitView or resetting its viewport. Zoom, cursors, gestures and turn controls remain unchanged.

Below lg, show a bottom drawer within the workspace main area, max height about 70% of the available main height, with its own scrolling body. Use a nonmodal complementary region for both layouts: no scrim, focus trap, or aria-modal claim. Canvas and navbar remain available. A labelled Close chat button and Escape inside the drawer close it; return focus to the navbar toggle. Hidden panels have no tabbable controls. Breakpoint changes keep one logical panel/composer rather than mounting duplicate copies. This concrete nonmodal drawer avoids introducing another dialog abstraction; the existing Dialog is unchanged.

Adapt the visual viewport hook locally, applying its height to the workspace shell with 100dvh fallback so a phone keyboard leaves the composer reachable. Do not change global body layout or other routes. Keep reduced-motion behavior and avoid auto-focusing the textarea whenever a new message arrives.

Message bubbles show sender name/avatar or initials for others, `You` for own messages, and `Deleted user` for a missing sender. Text renders as plain React text, preserving newlines and wrapping long strings; no HTML injection. Show a time with an accessible full timestamp. Images are lazy, bounded, have alt text, and can open their http(s) URL through a labelled normal link in a new tab with rel=noopener noreferrer; no custom lightbox. Videos use controls, metadata preload and no autoplay. Render text captions alongside media. Media load errors should retain a usable labelled link.

The list is the sole vertical scroll region for messages; composer/header stay fixed within the panel. Use an accessible named region/list. Initial open/load scrolls to bottom. A live message scrolls to bottom only when the reader was already within roughly 64px of bottom (own successful sends may move to bottom). Load earlier preserves the first visible message/offset rather than jumping to the newest message. A pending prepend plus a concurrent live append must preserve the anchor. Account for late media sizing with bounded dimensions/anchor adjustment, without an infinite observer loop. Scrolling is UI behavior in the hook; network state stays in the store.

## 6. Verification

New tests use the existing node:test/Vite SSR/fake-socket patterns with no dependencies, DB or account writes. Test production store actions and helpers with deferred REST requests, injectable clock/timers as needed, fake storage and AudioContext. Restore patches, axios adapters, globals and listeners; close each Vite server. Run root suites one command at a time. Do not treat static markup as executing React effects: test extracted controller/scroll rules directly and document remaining real-DOM checks.

- Binding: one set of listeners under StrictMode-equivalent rebind; exact-reference cleanup preserves other features' listeners. Route/account/socket replacement and same-socket retry invalidate old REST, sends and timers. A captured old listener or disposer cannot affect the new project. No chat HTTP before the matching workspace is ready; no requests on turn/presence/canvas-only recovery updates. All roles/no turn can send; disconnected/not-ready paths cannot.
- History: GET envelope and cursor validation; exact paired params for Load earlier; defaults/empty/error/retry; overlapping pages and equal timestamps sort and deduplicate. Deferred initial GET and earlier GET retain intervening live messages. A reconnect refresh resets the pageable history window and never claims the offline gap is fully loaded.
- Send: actual JSON/FormData content, attachment-only and caption, length/MIME/size validation, one in-flight request across repeated actions. REST-first/socket-first echo produces one bubble. Failure/503 retains draft/file; success clears only current submitted input; disconnected/obsolete completion cannot mutate the new epoch. Own other-tab messages remain silent and do not increment unread.
- Notification: unique remote events count/chime once; history never counts/chimes; close/open and hidden/visible rules; sound-only persistence under the specified key; malformed/unavailable storage and throwing AudioContext cannot break delivery.
- Typing: long bursts refresh before expiry with rate bounds, idle/blur/clear/send/close cleanup, true/false handling, self/nonparticipant/cross-project/malformed/old-epoch rejection, per-user expiry replacement, departed participants and message-arrival clearing, no timer leak after disposal.
- UI: markup for loading/empty/errors, Load earlier availability, bubble sender/null/media/text escaping, role-independent composer, sound toggle and labels. Test keyboard decisions including IME, scroll/prepend rules, and preview URL creation/revocation through testable production helpers or browser evidence. Keep all existing client/server assertions.

Run: server `npm test`; root client suites workspaceSync, canvasPreview, participants, cursorPresence, turnState, turnRobustness, projectChat, projectChatUi, each in its own sequential `node --test test/<name>.test.mjs` command; root `npm run build`; `git diff --check`. Record counts and warnings. Boot the API with existing config and verify health if practical; stop only the process started for verification. No env or user writes.

Manual/browser checklist with available sessions: open/close chat and preserve canvas viewport; send text/multiline/IME/image/video/caption as viewer and holder; one bubble for echo; Load earlier preserves position; live arrivals while reading older history; typing through a >5-second burst; collapsed badge and sound toggle persistence; disconnect/rejoin and failed send retain draft; route change while requests pending; 320px width, phone keyboard and drawer; focus/Escape/Tab; media failure; no cursor packets over chat controls; `/blog` and `/chat` regressions. Shared-project two-account chat and typing are required for launch, but may remain deferred to S26/S28 if existing synced accounts/access/tools are unavailable. Never manufacture users/membership or edit environment files to make the checklist appear complete. Separate automated evidence from unverified browser effects.

## Completion and handoff

Update the tracker with baseline, changed files, verification for each contract, deviations, browser limitations, and S24 Ready for review. Document implemented client chat boundaries in architecture and final responsive behavior in UI context. No backend documentation change is required because S23's protocol stays unchanged. Stop for Codex review; leave S25 and membership work untouched.

Grok prompt: Read AGENTS.md and the six context files, then `context/specs/24-project-chat-panel.md`. Mark S24 In progress, implement only its named files and contracts, run verification, mark Ready for review with evidence, and stop. Codex reviews. Do not commit, push, branch, deploy, or implement another slice.
