import { useEffect } from 'react';
import { resolvePublicAssetUrl } from '../core/experiments/assets';
import { useSessionStore } from '../stores/sessionStore';

export function PdfPanel() {
  const asset = useSessionStore((s) => s.pdfPreviewAsset);
  const closePdfPreview = useSessionStore((s) => s.closePdfPreview);

  useEffect(() => {
    if (!asset) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePdfPreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asset, closePdfPreview]);

  if (!asset) return null;

  const href = resolvePublicAssetUrl(asset.src, import.meta.env.BASE_URL);

  return (
    <aside
      aria-label={asset.title}
      className="fixed right-5 bottom-5 z-40 hidden h-[min(78vh,700px)] w-[min(640px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl shadow-2xl md:flex"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5"
        style={{ borderBottom: '1px solid var(--vml-border)' }}
      >
        <h2 className="truncate text-xs font-bold">{asset.title}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            Open in new tab ↗
          </a>
          <button
            type="button"
            onClick={closePdfPreview}
            aria-label="Close PDF preview panel"
            className="rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <iframe
        src={href}
        title={asset.title}
        className="w-full flex-1 bg-white"
      />

      <div
        className="flex shrink-0 items-center justify-between px-3.5 py-1.5 text-[11px]"
        style={{
          borderTop: '1px solid var(--vml-border)',
          color: 'var(--vml-text-muted)',
        }}
      >
        <span>Using browser PDF viewer.</span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline"
          style={{ color: 'var(--vml-accent)' }}
        >
          Fallback: open PDF directly
        </a>
      </div>
    </aside>
  );
}
