"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Escape and the scrim
 * close it; focus moves in on open and back to the opener on close.
 */
export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  useEffect(() => {
    if (!props.open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus], input, button, select, [tabindex]:not([tabindex='-1'])");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])")];
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) { e.preventDefault(); lastItem.focus(); }
        else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); firstItem.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.({ preventScroll: true });
    };
  }, [props.open]);

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-scrim)] sm:items-center sm:p-6" onClick={props.onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        onClick={(e) => e.stopPropagation()}
        className={`animate-tome-rise pb-safe relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[0_-20px_60px_-20px_var(--color-shadow)] sm:rounded-[28px] ${
          props.wide ? "sm:max-w-xl" : "sm:max-w-md"
        }`}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--color-border-strong)] sm:hidden" />
        <div className="px-5 pb-6 pt-4 sm:px-7 sm:pt-6">{props.children}</div>
      </div>
    </div>
  );
}
