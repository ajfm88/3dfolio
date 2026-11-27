import express from "express";
import { getShare } from "../controllers/diagramShare.controller.js";

const router = express.Router();

router.get("/:shareId", getShare);

export default router;
