import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["editor", "viewer"], required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const inviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ["editor", "viewer"], required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

// The owner is never stored in members, so ownership has one source of truth;
// roleOf still gives ownership priority if a stray member entry exists. Members
// are addressed by user id, while invites keep their own id for revocation.
const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: { type: [memberSchema], default: [] },
    invites: { type: [inviteSchema], default: [] },
  },
  { timestamps: true },
);

projectSchema.index({ "members.user": 1 });
projectSchema.index({ "invites.email": 1 });

export default mongoose.model("Project", projectSchema);
