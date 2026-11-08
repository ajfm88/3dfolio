// In-memory rooms for one server process. Persistence, sockets, and timers stay
// outside this module so a join can be cancelled without leaving a registry
// entry behind, and so tests can run without a database.

export function createSerialQueue() {
  let tail = Promise.resolve();

  return function enqueue(job) {
    // A rejection must not become the next job's rejection, or one failed join
    // would stall every later join on that socket.
    const run = tail.then(job, job);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

function hasUser(room, userId) {
  for (const connection of room.connections.values()) {
    if (connection.userId === userId) return true;
  }
  return false;
}

export function createWorkspaceRegistry() {
  const rooms = new Map();

  function evictIfIdle(projectId, entry) {
    // A newer room may already occupy this id. Deleting by id alone would drop it.
    if (rooms.get(projectId) !== entry) return;
    if (entry.pending > 0) return;
    if (entry.room && entry.room.connections.size > 0) return;
    rooms.delete(projectId);
  }

  function ensureInit(entry, projectId, loadCanvas) {
    entry.init = Promise.resolve()
      .then(() => loadCanvas(projectId))
      .then((canvas) => {
        if (rooms.get(projectId) !== entry) {
          throw new Error("Workspace room superseded");
        }
        entry.room = {
          canvas,
          members: new Map(),
          connections: new Map(),
          writeQueue: createSerialQueue(),
        };
        return entry.room;
      })
      .catch((error) => {
        if (rooms.get(projectId) === entry) {
          entry.room = null;
          entry.init = null;
          rooms.delete(projectId);
        }
        throw error;
      });
    return entry.init;
  }

  function acquire(projectId, loadCanvas) {
    let entry = rooms.get(projectId);
    if (!entry) {
      entry = { room: null, pending: 0, init: null };
      rooms.set(projectId, entry);
    }

    // Held until the caller attaches a socket or gives up, so the last member
    // leaving cannot delete a room another join is still waiting on.
    entry.pending += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.pending -= 1;
      evictIfIdle(projectId, entry);
    };

    if (!entry.init) ensureInit(entry, projectId, loadCanvas);

    return entry.init.then(
      (room) => {
        if (rooms.get(projectId) !== entry || entry.room !== room) {
          release();
          throw new Error("Workspace room unavailable");
        }
        return { room, release };
      },
      (error) => {
        release();
        throw error;
      },
    );
  }

  function getRoom(projectId) {
    return rooms.get(projectId)?.room ?? null;
  }

  function addConnection(projectId, socketId, info) {
    const room = getRoom(projectId);
    if (!room || typeof socketId !== "string" || socketId.length === 0) return false;

    const previous = room.connections.get(socketId);
    room.connections.set(socketId, { userId: info.userId, tabId: info.tabId });
    if (previous && previous.userId !== info.userId && !hasUser(room, previous.userId)) {
      room.members.delete(previous.userId);
    }
    room.members.set(info.userId, {
      role: info.role,
      fullName: info.fullName,
      img: info.img,
    });
    return true;
  }

  function removeConnection(projectId, socketId) {
    const entry = rooms.get(projectId);
    const room = entry?.room;
    if (!room) return false;
    const existing = room.connections.get(socketId);
    if (!existing) return false;
    room.connections.delete(socketId);
    if (!hasUser(room, existing.userId)) room.members.delete(existing.userId);
    evictIfIdle(projectId, entry);
    return true;
  }

  return { acquire, getRoom, addConnection, removeConnection };
}

export const workspaceRegistry = createWorkspaceRegistry();
