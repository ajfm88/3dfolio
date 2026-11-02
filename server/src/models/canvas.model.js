import mongoose from "mongoose";

// Nodes and edges are Mixed because server/src/shared/canvasOps.js (S06) owns
// field-by-field whitelisting on every write and load. Mongoose validation of
// canvas content would create a second copy of those rules that could drift.
const canvasSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, unique: true },
    nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    version: { type: Number, default: 0, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default mongoose.model("Canvas", canvasSchema);
