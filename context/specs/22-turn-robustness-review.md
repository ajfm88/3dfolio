# S22 review

**Status** Approved · **Reviewer** Codex

## Socket.IO can carry an old commit into the next connection

`workspaceSync.js` checks `socket.connected` and then calls `emitWithAck`. The installed Socket.IO client separately checks whether the Engine.IO heartbeat expired. If it expired, the client can enqueue the `canvas:commit` packet in `sendBuffer` even while `socket.connected` is true. The workspace's disconnect handler clears the application's queue and invalidates callbacks. The Socket.IO packet remains in its own queue, which flushes before the client's `connect` listener can send `workspace:join`.

I reproduced this with the submitted store, the installed Socket.IO client, and a loopback Socket.IO server. I forced the heartbeat-expired check immediately before dispatch, disconnected, and retried within the commit timeout. The server received `join`, `commit before join`, `join`. The expected sequence is `join`, `join`. The real workspace server rejects the packet because the new socket has not joined, so this finding concerns stale traffic and the no-replay contract rather than duplicate persistence. The loopback server used no account or database.

In `workspaceSync.js`, give each commit emit a unique payload object and ensure the exact `canvas:commit` packet cannot remain in `sendBuffer` for the next connection. The existing pagehide release shows how to identify a buffered packet by its event and payload identity. Preserve the ordinary acknowledged send, timeout and error paths, and unrelated buffered packets. If the transport already sent a commit, continue treating its outcome as uncertain until the server acknowledgement or snapshot. Keep the correction inside the existing S22 scope.

Extend `test/turnRobustness.test.mjs` to exercise an emit that buffers despite `connected` being true. Verify the original commit is absent on reconnect, unrelated packets remain, and the store rejoins from the server snapshot. Rerun the loopback case or an equivalent real-client check and include its outcome in the tracker. Then rerun S22 verification and mark it Ready for review.

## Verification

All 364 submitted tests passed independently, including 26 robustness tests and 201 server tests. The production build passed with the existing chunk-size warning, and `git diff --check` passed with the existing line-ending notices. API boot and health are the implementer's reported checks. Browser and shared-project verification remain open as planned for S26/S28.

## Final code review

**Approved.** Each acknowledged commit has its own payload. The cleanup matches both the event and that exact payload in Socket.IO's send buffer. It preserves other packets and the existing acknowledgement and timeout handling. The fake-socket regression verifies that an unrelated packet and another commit stay queued. The real-client loopback regression reaches the second workspace snapshot with `join`, `join` on the server. Disabling the cleanup in a temporary copy made that regression fail because the stale commit remained buffered.

All 366 tests, including 28 robustness tests and 201 server tests, passed independently. The production build produced `WorkspacePage-D2QW4qBn.js` at 262.23 kB, with the existing chunk-size warning. `git diff --check` passed. The implementer reported the API health check. Browser and shared-project verification remain scheduled for S26/S28.
