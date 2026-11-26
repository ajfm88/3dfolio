import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["editor", "viewer"], required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// content is the diagram as a JSON string. The server never queries inside it,
// so a string keeps Mongo key rules out of the way and makes sizeBytes exact.
// The owner is never stored in members.
const diagramSchema = new mongoose.Schema(
  {
    diagramId: { type: String, required: true, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, maxlength: 200 },
    database: { type: String, required: true, maxlength: 32 },
    content: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    revision: { type: Number, required: true, min: 1, default: 1 },
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true },
);

diagramSchema.index({ "members.user": 1 });

export default mongoose.model("Diagram", diagramSchema);
