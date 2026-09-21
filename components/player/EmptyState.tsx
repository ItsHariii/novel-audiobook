import { BookIcon, PlusIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="flex flex-col items-center rounded-3xl border border-dashed border-[var(--color-border-strong)] px-6 py-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
        <BookIcon size={28} />
      </div>
      <h3 className="mt-5 font-serif text-[22px] font-medium">Your shelf is empty</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--color-muted)]">
        Paste a link to any web novel chapter and Tome will find the rest, then read it aloud.
      </p>
      <Button className="mt-6" onClick={onAdd}><PlusIcon size={18} />Add your first novel</Button>
    </section>
  );
}
