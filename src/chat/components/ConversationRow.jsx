import AvatarWithOnlineIndicator from "./AvatarWithOnlineIndicator";

const ConversationRow = ({ user, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={`flex w-full items-center gap-3 border-b border-[var(--chat-border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-elevated)] ${selected ? "bg-[var(--chat-elevated)]" : ""}`}
  >
    <AvatarWithOnlineIndicator isOnline={user.isOnline}>
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.name}
          className="h-11 w-11 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-sm font-medium text-white">
          {user.initials}
        </div>
      )}
    </AvatarWithOnlineIndicator>

    <div className="relative min-w-0 flex-1">
      <p className="truncate text-[15px] font-semibold text-[var(--chat-text)]">{user.name}</p>

      {/* Positioned out of flow on purpose: as a second line in the layout it
          would add height, so every row in the list would grow and shrink as
          people started and stopped typing. There is no last-message preview
          to swap this into, so it overlays the empty space under the name. */}
      {user.isTyping && (
        <p className="absolute inset-x-0 top-full mt-0.5 truncate text-xs font-medium leading-none text-[var(--chat-accent-2)]">
          typing…
        </p>
      )}
    </div>

    {/* Counts messages that arrived while a different thread was open; opening
        this one clears it. */}
    {user.unread > 0 && (
      <span className="ml-auto flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
        {user.unread > 9 ? "9+" : user.unread}
        <span className="sr-only"> unread messages</span>
      </span>
    )}
  </button>
);

export default ConversationRow;
