// 3dfolio-owned: the IndexedDB side of cloud saves, for diagrams that live only in this browser.
import { db } from "../data/db";

export const localStore = {
  has: async (id) =>
    (await db.diagrams.where("diagramId").equals(id).count()) > 0,
  save: (payload) => {
    const { diagramId, ...fields } = payload;
    return db.diagrams.where("diagramId").equals(diagramId).modify(fields);
  },
  remove: (id) => db.diagrams.where("diagramId").equals(id).delete(),
};
