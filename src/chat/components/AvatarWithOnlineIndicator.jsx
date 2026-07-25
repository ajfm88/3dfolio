const AvatarWithOnlineIndicator = ({ isOnline, children }) => (
  <div className="relative inline-flex shrink-0">
    {children}
    <span
      className={`pointer-events-none absolute bottom-0 right-0 z-10 h-[11px] w-[11px] rounded-full border-[2.5px] border-[var(--chat-panel-2)] shadow-sm ${isOnline ? "bg-emerald-500" : "bg-[#636366]"}`}
      aria-hidden
    />
    <span className="sr-only">{isOnline ? "Online" : "Offline"}</span>
  </div>
);

export default AvatarWithOnlineIndicator;
