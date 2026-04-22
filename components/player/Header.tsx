export function Header(props: {
  showLibraryToggle: boolean;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  playerBarVisible: boolean;
  onTogglePlayerBar: () => void;
  hasChapter: boolean;
}) {
  return (
    <header className="z-20 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" aria-hidden className="h-7 w-7" />
          <span className="text-sm font-semibold tracking-tight">Tome</span>
        </div>
        <div className="flex items-center gap-1">
          {props.hasChapter && (
            <IconButton
              label={props.playerBarVisible ? "Hide player" : "Show player"}
              onClick={props.onTogglePlayerBar}
              active={props.playerBarVisible}
            >
              <PlayerIcon />
            </IconButton>
          )}
          {props.showLibraryToggle && (
            <IconButton label="Library" onClick={props.onOpenLibrary}>
              <LibraryIcon />
            </IconButton>
          )}
          <IconButton label="Settings" onClick={props.onOpenSettings}>
            <SettingsIcon />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
      className={`grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/5 hover:text-[var(--color-text)] ${
        props.active
          ? "text-[var(--color-accent)]"
          : "text-[var(--color-text)]/80"
      }`}
    >
      {props.children}
    </button>
  );
}

function PlayerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12a8 8 0 0 1 16 0" />
      <rect x="3" y="12" width="5" height="7" rx="1.5" />
      <rect x="16" y="12" width="5" height="7" rx="1.5" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4h4v16H4zM10 4h4v16h-4z" />
      <path d="M17 5l3.2 .8-3.5 14.4-3.2-.8z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
