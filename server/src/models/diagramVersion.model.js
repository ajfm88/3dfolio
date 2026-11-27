import mongoose from "mongoose";

// One recorded snapshot of a cloud diagram. The server keeps the newest 20.
const diagramVersionSchema = new mongoose.Schema(
  {
    versionId: { type: String, required: true, unique: true },
    diagram: { type: mongoose.Schema.Types.ObjectId, ref: "Diagram", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    contentHash: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

diagramVersionSchema.index({ diagram: 1, createdAt: -1, _id: -1 });

export default mongoose.model("DiagramVersion", diagramVersionSchema);
