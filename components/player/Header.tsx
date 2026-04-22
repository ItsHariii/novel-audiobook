"use client";

import { useEffect, useRef, useState } from "react";

export function Header(props: {
  showLibraryToggle: boolean;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  playerBarVisible: boolean;
  onTogglePlayerBar: () => void;
  hasChapter: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="safe-top safe-left safe-right z-20 shrink-0 bg-[var(--color-bg)]/70 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Tome"
            className="h-8 w-8 select-none"
            draggable={false}
          />
        </div>

        <div className="relative flex items-center" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Menu"
            title="Menu"
            className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-text)]/85 transition hover:bg-white/5 hover:text-[var(--color-text)]"
          >
            <MenuIcon />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-xl"
            >
              {props.showLibraryToggle && (
                <MenuRow
                  onClick={() => {
                    props.onOpenLibrary();
                    setMenuOpen(false);
                  }}
                  icon={<LibraryIcon />}
                  label="Library"
                />
              )}
              {props.hasChapter && (
                <MenuRow
                  onClick={() => {
                    props.onTogglePlayerBar();
                    setMenuOpen(false);
                  }}
                  icon={<PlayerIcon />}
                  label={props.playerBarVisible ? "Hide player bar" : "Show player bar"}
                  active={props.playerBarVisible}
                />
              )}
              <MenuRow
                onClick={() => {
                  props.onOpenSettings();
                  setMenuOpen(false);
                }}
                icon={<SettingsIcon />}
                label="Settings"
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuRow(props: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={props.onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition hover:bg-white/5 ${
        props.active ? "text-[var(--color-accent)]" : "text-[var(--color-text)]/90"
      }`}
    >
      <span className="inline-grid h-5 w-5 place-items-center">{props.icon}</span>
      <span className="flex-1">{props.label}</span>
      {props.active && <span aria-hidden>●</span>}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function PlayerIcon() {
  return (
    <svg
      width="16"
      height="16"
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
      width="16"
      height="16"
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
      width="16"
      height="16"
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
