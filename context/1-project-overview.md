# 3dfolio /collaborate

## Overview

`/collaborate` is a real-time collaborative system-design workspace inside the 3dfolio portfolio. Signed-in users create projects, invite collaborators by email, and design software architectures together on a shared diagram canvas: shapes, connections, labels, and colors. Editing is **turn-based**. One browser tab holds the turn and edits while everyone else watches the changes live, sees each other's cursors, chats in a project-scoped thread, and queues for their turn. It's a simplified take on Ghost AI, built on the stack 3dfolio already runs: React/Vite on Vercel, plus Express, Socket.io, MongoDB and Clerk on Render. There are no third-party realtime or background-job services.

## Goals

1. A signed-in user can create, rename, and delete projects, and see the projects shared with them.
2. Members of a project see the same canvas, and every committed edit appears for all of them within about one second.
3. Exactly one tab can edit a project's canvas at any moment. The server enforces this, never the client.
4. Members can chat inside a project, with history that survives reloads.
5. Owners control access: invite by email, assign editor or viewer, change roles, remove members. Every change takes effect live.
6. `/blog`, `/chat`, and the portfolio keep working, unchanged, through the whole build.

## Core User Flow

1. User opens `/collaborate` and signs in with Clerk (modal).
2. User sees the dashboard: **My projects**, **Shared with me**, and **Invitations**.
3. User creates a project and is taken to `/collaborate/:projectId`.
4. User requests the turn. Nobody holds it, so it's granted immediately.
5. User drags shapes onto the canvas, connects them, and labels and colors them. Each change is saved as it's made.
6. User opens Share and invites a teammate by email as an editor.
7. Teammate signs in, accepts the invitation from their dashboard, and opens the project.
8. Teammate sees the canvas, the owner's cursor, and live drags, and chats in the project panel.
9. Teammate requests the turn and is queued. The owner releases, and the turn passes to the teammate with a toast.
10. Teammate edits. The owner watches live. If the teammate goes idle while the owner waits, the turn passes back automatically.
11. Anyone reloads, and the canvas and chat history are exactly as left.

## Features

### Projects and Access

- Project dashboard with owned projects, shared projects, and pending invitations.
- Create, rename, describe, and delete projects (owner only).
- Roles: owner, editor, viewer. Invite by exact email, accept or decline, change roles, remove members, leave a project.
- Membership changes apply live: a removed user is kicked from the workspace, and a changed role re-gates the UI instantly.

### Collaborative Canvas

- React Flow canvas with pan, zoom, and fit view.
- Six shapes (rectangle, diamond, circle, pill, cylinder, hexagon), dragged from a shape panel and dropped centered under the cursor.
- Move (including multi-select), resize, delete, inline label editing, and an 8-color palette per node.
- Smooth-step edges with arrows between any of four handles, with inline edge labels.
- Undo and redo for the turn holder's own edits.
- Server-authoritative persistence: every edit is validated and saved before anyone else sees it.

### Turn-Based Editing

- Request, release, cancel, and queue the turn. The owner can always take control.
- 20-second reconnect grace for the holder.
- 2-minute idle hand-off, but only while someone is waiting.
- Turns belong to a tab: your second tab is read-only.
- Turn bar shows who is editing, the queue, your position, and an idle countdown.

### Presence

- Participant avatars with roles.
- Live cursors with name badges.
- Live drag and resize previews from the turn holder.
- Connection banner for reconnecting and waking the server.

### Project Chat

- A chat thread per project, with paged history, realtime delivery, image and video attachments, a typing indicator, an unread badge, and a sound toggle.

## Scope

### In Scope

- Everything listed under Features.
- New MongoDB collections: `projects`, `canvases`, `projectmessages`.
- New Socket.io workspace events on the existing server.
- Cleanup when a Clerk user is deleted.
- Documentation of every new endpoint, event, and collection in `server/readme.md`.
- A navbar link to `/collaborate` at launch (S30).

### Out of Scope

- Liveblocks, Trigger.dev, Yjs, BullMQ/Redis, or any other realtime, CRDT, or background-job service.
- Simultaneous (non-turn-based) editing.
- AI diagram generation and AI spec writing.
- Starter templates, PNG/SVG export, version history, comments on nodes.
- Email delivery of invitations (invitees see them on their dashboard).
- User search or a user directory. Invites are by exact email only.
- Ownership transfer.
- Running more than one server instance (room and turn state are in memory).
- Migrating from MongoDB to PostgreSQL.
- Any change to `/blog`, the portfolio, the admin panel, or `/gft`. `/chat` will be retired in post-launch slices (Q1 in `6-progress-tracker.md`), and `/blog` may follow (Q5). Both keep working, unchanged, until then.

## Success Criteria

1. A signed-in user can create a project, open it, and see it in **My projects**.
2. Two signed-in accounts in different browsers see the same canvas, and a committed edit from one appears in the other within about one second.
3. A commit sent by anyone other than the turn holder's tab is rejected by the server, even if the client is tampered with.
4. Turn hand-off works via release, owner take-control, holder tab close after 20 seconds, and 2 minutes of idle while someone waits.
5. Briefly dropping the network keeps the holder's turn, and no edit is lost or duplicated across the reconnect.
6. Reloading shows the exact canvas and full chat history.
7. Invite, accept, promote, demote, and remove all work from the UI and apply live, and a removed user can no longer read the project (`404`).
8. Deleting a project removes its canvas and messages and kicks every connected member.
9. `/blog` and `/chat` behave exactly as before.
10. The final QA script in `specs/00-build-plan.md` passes on the deployed site.
