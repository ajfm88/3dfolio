// 3dfolio-owned: pure cloud storage rules (revisions, queue, conflicts, toasts), no imports so Node can test it.
export const MESSAGES = {
  conflict:
    "This diagram was changed somewhere else. Reload the page to get the latest version. Changes made here since then are not saved to the cloud.",
  notLoaded: "This diagram was not loaded from the cloud. Reload the page and try again.",
  saveFailed: (message) => `Cloud save failed: ${message}`,
  loadFailed: (message) => `Could not load the diagram from the cloud: ${message}`,
};

export const DIAGRAM_FIELDS = [
  "diagramId", "name", "database", "tables", "references", "notes",
  "areas", "views", "enums", "types", "sqlHeader", "pan", "zoom",
];

export function toRequestBody(payload) {
  const body = {};
  for (const key of DIAGRAM_FIELDS) {
    if (payload[key] !== undefined) body[key] = payload[key];
  }
  return body;
}

export function fromServerDiagram(data) {
  return {
    ...data,
    lastModified: new Date(data.lastModified),
    gistId: "",
    loadedFromGistId: "",
  };
}

export function statusOf(error) {
  return error?.response?.status ?? null;
}

export function authTransition(initialUserId, currentUserId) {
  if (initialUserId === undefined || currentUserId === undefined) return "none";
  if (initialUserId === currentUserId) return "none";
  if (currentUserId === null) return "signed-out";
  return "reload";
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createCloudCore({ api, local, notify, onUserId }) {
  const revisions = new Map();
  const conflicted = new Set();
  const lastSaveError = new Map();
  const notLoadedNotified = new Set();
  const queues = new Map();

  // Tasks for one id run in call order; a failed task does not block the next.
  function enqueue(id, task) {
    const previous = queues.get(id) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tail = run.catch(() => {});
    queues.set(id, tail);
    tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id);
    });
    return run;
  }

  async function list() {
    const data = await api.list();
    onUserId(data.userId);
    return data.diagrams;
  }

  function load(id) {
    return enqueue(id, async () => {
      let data;
      try {
        data = await api.get(id);
      } catch (error) {
        if (statusOf(error) === 404) return null;
        notify(MESSAGES.loadFailed(error.message), { sticky: false });
        return null;
      }
      revisions.set(id, data.revision);
      conflicted.delete(id);
      lastSaveError.delete(id);
      notLoadedNotified.delete(id);
      return fromServerDiagram(data);
    });
  }

  function save(payload, { isNew } = {}) {
    const id = payload.diagramId;
    return enqueue(id, async () => {
      if (conflicted.has(id)) throw codedError(MESSAGES.conflict, "cloud-conflict");
      if (!isNew && (await local.has(id))) {
        await local.save(payload);
        return;
      }
      const body = toRequestBody(payload);
      let request;
      if (revisions.has(id)) {
        request = () => api.update(id, { ...body, baseRevision: revisions.get(id) });
      } else if (isNew) {
        request = () => api.create(body);
      } else {
        if (!notLoadedNotified.has(id)) {
          notLoadedNotified.add(id);
          notify(MESSAGES.notLoaded, { sticky: false });
        }
        throw codedError(MESSAGES.notLoaded, "cloud-not-loaded");
      }
      let response;
      try {
        response = await request();
      } catch (error) {
        const status = statusOf(error);
        if (status === 409) {
          conflicted.add(id);
          notify(MESSAGES.conflict, { sticky: true });
        } else if ([400, 403, 404, 413].includes(status)) {
          const text = MESSAGES.saveFailed(error.message);
          if (lastSaveError.get(id) !== text) {
            notify(text, { sticky: false });
            lastSaveError.set(id, text);
          }
        }
        throw error;
      }
      revisions.set(id, response.revision);
      lastSaveError.delete(id);
    });
  }

  function remove(id) {
    return enqueue(id, async () => {
      if (await local.has(id)) {
        await local.remove(id);
        return;
      }
      try {
        await api.remove(id);
      } catch (error) {
        if (statusOf(error) !== 404) throw error;
      }
      revisions.delete(id);
      conflicted.delete(id);
      lastSaveError.delete(id);
      notLoadedNotified.delete(id);
    });
  }

  return { list, load, save, remove };
}
