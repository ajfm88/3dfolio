import express from "express";
import {
  createDiagram,
  deleteDiagram,
  getDiagram,
  listDiagrams,
  updateDiagram,
} from "../controllers/diagram.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protectRoute);
router.get("/", listDiagrams);
router.post("/", createDiagram);
router.get("/:diagramId", getDiagram);
router.put("/:diagramId", updateDiagram);
router.delete("/:diagramId", deleteDiagram);

export default router;
