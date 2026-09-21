import { CloseIcon } from "@/components/ui/icons";

export type ToastKind = "error" | "success" | "info";

const DOT: Record<ToastKind, string> = {
  error: "bg-[var(--color-failed)]",
  success: "bg-[var(--color-ready)]",
  info: "bg-[var(--color-accent)]",
};

export function Toast({ message, kind = "error", action, onClose }: {
  message: string;
  kind?: ToastKind;
  action?: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className="animate-tome-rise fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-glass)] py-2 pl-4 pr-2 text-sm shadow-[0_14px_34px_-12px_var(--color-shadow)] backdrop-blur-xl lg:left-auto lg:right-6"
    >
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[kind]}`} />
      <span className="min-w-0 flex-1 py-1.5 leading-snug">{message}</span>
      {action && (
        <button type="button" onClick={action.onClick} className="h-10 shrink-0 rounded-xl px-3 text-[13px] font-semibold text-[var(--color-accent-text)] hover:bg-[var(--color-accent-soft)]">
          {action.label}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--color-muted)] hover:bg-[var(--color-hover)]">
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
