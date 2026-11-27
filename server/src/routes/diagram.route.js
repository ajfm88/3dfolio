import express from "express";
import {
  createDiagram,
  deleteDiagram,
  getDiagram,
  listDiagrams,
  updateDiagram,
} from "../controllers/diagram.controller.js";
import { deleteShare, saveShare } from "../controllers/diagramShare.controller.js";
import {
  compareVersions,
  getVersion,
  listVersions,
  recordVersion,
} from "../controllers/diagramVersion.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protectRoute);
router.get("/", listDiagrams);
router.post("/", createDiagram);
router.get("/:diagramId", getDiagram);
router.put("/:diagramId", updateDiagram);
router.delete("/:diagramId", deleteDiagram);
router.get("/:diagramId/versions", listVersions);
router.post("/:diagramId/versions", recordVersion);
router.get("/:diagramId/versions/:versionId", getVersion);
router.get("/:diagramId/versions/:versionA/compare/:versionB", compareVersions);
router.put("/:diagramId/share", saveShare);
router.delete("/:diagramId/share", deleteShare);

export default router;
