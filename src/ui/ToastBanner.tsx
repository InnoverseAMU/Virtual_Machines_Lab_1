import { useSessionStore } from '../stores/sessionStore';

export function ToastBanner() {
  const toasts = useSessionStore((s) => s.toasts);
  const dismissToast = useSessionStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-24 z-30 flex flex-col items-center gap-2 px-3 md:top-16"
    >
      {toasts.map((toast) => {
        const bg =
          toast.severity === 'danger'
            ? '#991b1b'
            : toast.severity === 'warning'
              ? '#92400e'
              : '#075985';
        const border =
          toast.severity === 'danger'
            ? '#ef4444'
            : toast.severity === 'warning'
              ? '#f59e0b'
              : '#38bdf8';

        return (
          <div
            key={toast.id}
            role="alert"
            className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl px-3.5 py-2 text-xs font-medium text-white shadow-xl"
            style={{ backgroundColor: bg, border: `1px solid ${border}` }}
          >
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded px-1.5 py-0.5 text-white/80 hover:bg-white/15 hover:text-white"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
