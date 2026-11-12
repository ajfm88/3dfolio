import mongoose from "mongoose";

const TEXT_MAX = 2000;

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// String paths normally cast numbers and objects into text. A message body is
// rejected at the controller, and this caster stops any other writer from
// turning a forged number into stored content.
function keepString(field) {
  return function castField(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") {
      throw new mongoose.Error.CastError("string", value, field);
    }
    return value;
  };
}

const projectMessageSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "", maxlength: TEXT_MAX },
    image: { type: String, default: "" },
    video: { type: String, default: "" },
  },
  { timestamps: true, collection: "projectmessages" },
);

for (const field of ["text", "image", "video"]) {
  projectMessageSchema.path(field).castFunction(keepString(field));
}

// Newest-first paging needs the tie-break in the index. Two messages saved in
// the same millisecond would skip or repeat if the cursor were a timestamp alone.
projectMessageSchema.index({ project: 1, createdAt: -1, _id: -1 });

projectMessageSchema.pre("validate", function requireOneContent() {
  const hasText = present(this.text);
  const hasImage = present(this.image);
  const hasVideo = present(this.video);
  if (!hasText && !hasImage && !hasVideo) {
    this.invalidate("text", "A message needs text or one attachment");
  }
  if (hasImage && hasVideo) {
    this.invalidate("image", "A message cannot include both an image and a video");
  }
});

export default mongoose.model("ProjectMessage", projectMessageSchema);
