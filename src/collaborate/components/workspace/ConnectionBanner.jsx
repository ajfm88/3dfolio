import { useWorkspaceStore } from "../../store/useWorkspaceStore";

const ConnectionBanner = () => {
  const notice = useWorkspaceStore((state) => state.connectionNotice);
  if (!notice) return null;

  return (
    <p
      role="status"
      className="flex w-full shrink-0 items-center justify-center border-b border-[var(--collab-warning)] bg-[color-mix(in_srgb,var(--collab-warning)_14%,transparent)] px-4 py-2 text-center text-sm font-semibold text-[var(--collab-warning)]"
    >
      {notice}
    </p>
  );
};

export default ConnectionBanner;
