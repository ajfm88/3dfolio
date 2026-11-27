import Diagram from "../models/diagram.model.js";
import DiagramShare from "../models/diagramShare.model.js";
import DiagramVersion from "../models/diagramVersion.model.js";

export async function deleteDiagramAndContent(diagram) {
  // Versions and the share go first, then the diagram.
  await DiagramVersion.deleteMany({ diagram: diagram._id });
  await DiagramShare.deleteMany({ diagram: diagram._id });
  await Diagram.deleteOne({ _id: diagram._id, owner: diagram.owner });
}

export async function deleteUserDiagramData(user) {
  const owned = await Diagram.find({ owner: user._id }).select("_id owner").lean();
  for (const diagram of owned) {
    await deleteDiagramAndContent(diagram);
  }
  await Diagram.updateMany(
    { "members.user": user._id },
    { $pull: { members: { user: user._id } } },
  );
  await DiagramVersion.deleteMany({ owner: user._id });
  await DiagramShare.deleteMany({ owner: user._id });
}
