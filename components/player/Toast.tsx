export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed right-4 top-4 z-40 max-w-md rounded-xl border border-red-700/40 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="mr-1">Error:</strong>
          {message}
        </div>
        <button onClick={onClose} className="rounded border border-red-400/40 px-2 py-0.5 text-xs">
          Close
        </button>
      </div>
    </div>
  );
}
