import mongoose from "mongoose";

// One public share snapshot per cloud diagram. Refreshing it keeps shareId.
const diagramShareSchema = new mongoose.Schema(
  {
    shareId: { type: String, required: true, unique: true },
    diagram: { type: mongoose.Schema.Types.ObjectId, ref: "Diagram", required: true, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("DiagramShare", diagramShareSchema);
