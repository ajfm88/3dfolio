import { can, findProjectForMember, roleOf } from "../lib/projectAccess.js";
import { CHAT_FORBIDDEN_MESSAGE, PROJECT_NOT_FOUND_MESSAGE } from "../lib/projectMessages.js";
import { upload } from "./upload.middleware.js";

const readMedia = upload.single("media");

// Membership is decided before query details and before multer reads a file.
// A non-member therefore cannot use a bad cursor or a huge body to probe.
export async function authorizeProjectChat(req, res, next) {
  const userId = req.user?._id;
  const project = await findProjectForMember(req.params.id, userId);
  if (!project) return res.status(404).json({ message: PROJECT_NOT_FOUND_MESSAGE });

  const role = roleOf(project, userId);
  if (!can(role, "chat")) return res.status(403).json({ message: CHAT_FORBIDDEN_MESSAGE });

  req.projectChat = { project, role };
  return next();
}

// Chat's route still mounts upload.single directly, so its error status stays
// whatever the central handler already does. Only this wrapper answers 400.
export function projectMediaUpload(req, res, next) {
  readMedia(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = typeof error.message === "string" && error.message
      ? error.message
      : "Invalid upload";
    res.status(400).json({ message });
  });
}
