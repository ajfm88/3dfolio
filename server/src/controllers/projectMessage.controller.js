import ProjectMessage from "../models/projectMessage.model.js";
import { hasImageKitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { can, findProjectForMember, roleOf } from "../lib/projectAccess.js";
import { io } from "../lib/socket.js";
import {
  canonicalObjectId,
  COLLABORATE_MEDIA_FOLDER,
  historyFilter,
  CHAT_FORBIDDEN_MESSAGE,
  MEDIA_NOT_CONFIGURED_MESSAGE,
  messageHasContent,
  pageHistory,
  parseHistoryQuery,
  parseMessageText,
  PROJECT_NOT_FOUND_MESSAGE,
  TEXT_OR_MEDIA_MESSAGE,
  toMessageResource,
} from "../lib/projectMessages.js";

function roomChannel(projectId) {
  return `project:${projectId}`;
}

// Tests replace these two calls. The handlers below stay the ones mounted on
// the router, so a stub cannot drift from the send path.
const deps = {
  hasImageKitConfig,
  uploadChatMedia,
};

export function setProjectMessageDeps(overrides) {
  const previous = {
    hasImageKitConfig: deps.hasImageKitConfig,
    uploadChatMedia: deps.uploadChatMedia,
  };
  Object.assign(deps, overrides);
  return () => Object.assign(deps, previous);
}

export async function listProjectMessages(req, res) {
  const parsed = parseHistoryQuery(req.query);
  if (!parsed.ok) return res.status(400).json({ message: parsed.message });

  const projectId = canonicalObjectId(req.projectChat.project._id);
  const rows = await ProjectMessage.find(historyFilter(projectId, parsed))
    .sort({ createdAt: -1, _id: -1 })
    .limit(parsed.limit + 1)
    .populate("sender", "_id fullName img")
    .lean();

  res.status(200).json(pageHistory(rows, parsed.limit));
}

export async function sendProjectMessage(req, res) {
  const parsed = parseMessageText(req.body);
  if (!parsed.ok) return res.status(400).json({ message: parsed.message });

  const file = req.file ?? null;
  if (!messageHasContent(parsed.text, file)) {
    return res.status(400).json({ message: TEXT_OR_MEDIA_MESSAGE });
  }

  let image = "";
  let video = "";
  if (file) {
    if (!deps.hasImageKitConfig()) {
      return res.status(503).json({ message: MEDIA_NOT_CONFIGURED_MESSAGE });
    }
    const url = await deps.uploadChatMedia(file, COLLABORATE_MEDIA_FOLDER);
    if (typeof file.mimetype === "string" && file.mimetype.startsWith("video/")) video = url;
    else image = url;
  }

  // The upload can outlive the membership that authorized it. This check does
  // not cover a delete that commits after the insert starts; S27 owns that race.
  const userId = req.user._id;
  const projectId = canonicalObjectId(req.projectChat.project._id);
  const still = await findProjectForMember(projectId, userId);
  if (!still) return res.status(404).json({ message: PROJECT_NOT_FOUND_MESSAGE });
  if (!can(roleOf(still, userId), "chat")) {
    return res.status(403).json({ message: CHAT_FORBIDDEN_MESSAGE });
  }

  const created = await ProjectMessage.create({
    project: still._id,
    sender: userId,
    text: parsed.text,
    image,
    video,
  });

  const saved = await ProjectMessage.findById(created._id)
    .populate("sender", "_id fullName img")
    .lean();
  if (!saved) throw new Error("Saved project message could not be read");
  const message = toMessageResource(saved);
  io.to(roomChannel(canonicalObjectId(saved?.project ?? still._id))).emit("project:message", {
    projectId: canonicalObjectId(saved?.project ?? still._id),
    message,
  });

  res.status(201).json({ message });
}
