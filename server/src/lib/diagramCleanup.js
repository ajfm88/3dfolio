import Diagram from "../models/diagram.model.js";

export async function deleteDiagramAndContent(diagram) {
  // C3 and C4 also delete this diagram's versions and share here.
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
}
