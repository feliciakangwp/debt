export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-red-300 bg-red-50 px-5 py-2.5 text-sm text-red-700">
      <span>{message}</span>
      <button onClick={onDismiss} className="shrink-0 font-semibold text-red-700 hover:text-red-900">
        Dismiss
      </button>
    </div>
  );
}
