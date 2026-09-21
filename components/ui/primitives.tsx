import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]",
  secondary: "border border-[var(--color-border-strong)] bg-[var(--color-panel-2)] text-[var(--color-text)] hover:border-[var(--color-dim)]",
  quiet: "bg-transparent text-[var(--color-accent-text)] hover:bg-[var(--color-accent-soft)]",
  danger: "bg-[var(--color-failed-soft)] text-[var(--color-failed)] hover:brightness-110",
};

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-[14px] px-5 text-[15px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-[var(--color-hover)] disabled:opacity-35 ${
        active ? "text-[var(--color-accent-text)]" : "text-[var(--color-text)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export type Status = "ready" | "working" | "failed" | "queued";

const STATUS: Record<Status, { box: string; dot: string }> = {
  ready: { box: "bg-[var(--color-ready-soft)] text-[var(--color-ready)]", dot: "bg-[var(--color-ready)]" },
  working: { box: "bg-[var(--color-working-soft)] text-[var(--color-working)]", dot: "bg-[var(--color-working)] animate-tome-pulse" },
  failed: { box: "bg-[var(--color-failed-soft)] text-[var(--color-failed)]", dot: "bg-[var(--color-failed)]" },
  queued: { box: "bg-[var(--color-panel-2)] text-[var(--color-muted)]", dot: "hidden" },
};

export function StatusPill({ status, children }: { status: Status; children: ReactNode }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] text-[11.5px] font-semibold ${s.box}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}

/** Inline status text with a leading dot, for dense rows. */
export function StatusLine({ status, children }: { status: Status; children: ReactNode }) {
  const color = status === "ready" ? "text-[var(--color-ready)]" : status === "working" ? "text-[var(--color-working)]"
    : status === "failed" ? "text-[var(--color-failed)]" : "text-[var(--color-dim)]";
  return (
    <span className={`inline-flex items-center gap-[5px] text-[11.5px] font-semibold ${color}`}>
      {status !== "queued" && <span aria-hidden className={`h-[5px] w-[5px] rounded-full ${STATUS[status].dot}`} />}
      {children}
    </span>
  );
}

export function Chip({ active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`h-[34px] shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-semibold transition ${
        active
          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
          : "border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, tone = "accent", className = "h-1" }: { value: number; tone?: "accent" | "working"; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-full bg-[var(--color-border)] ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone === "working" ? "bg-[var(--color-working)]" : "bg-[var(--color-accent)]"}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[14px] bg-[var(--color-panel-2)] p-1">
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => props.onChange(o.value)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[13px] font-semibold transition ${
              active ? "bg-[var(--color-panel)] text-[var(--color-text)] shadow-[0_1px_3px_var(--color-shadow)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h3 className="text-[15px] font-semibold text-[var(--color-text)]">{children}</h3>
      {action}
    </div>
  );
}
