import {
  resolvePublicAssetUrl,
  type AssetFile,
} from '../core/experiments/assets';
import { useSessionStore } from '../stores/sessionStore';

interface ExperimentPdfActionsProps {
  pdf?: AssetFile;
  variant?: 'card' | 'inline' | 'topbar';
  label?: string;
}

export function ExperimentPdfActions({
  pdf,
  variant = 'inline',
  label = 'View experiment PDF',
}: ExperimentPdfActionsProps) {
  const openPdfPreview = useSessionStore((s) => s.openPdfPreview);

  if (!pdf) {
    return (
      <button
        type="button"
        disabled
        aria-label="PDF not added yet"
        onClick={(e) => e.stopPropagation()}
        className={
          variant === 'topbar'
            ? 'inline-flex h-8 shrink-0 cursor-not-allowed items-center rounded-full px-2.5 text-xs font-medium opacity-55 shadow-lg backdrop-blur'
            : 'inline-flex cursor-not-allowed items-center rounded-lg px-2.5 py-1 text-xs font-medium opacity-55'
        }
        style={{
          backgroundColor: 'var(--vml-panel)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text-muted)',
        }}
      >
        PDF not added yet
      </button>
    );
  }

  const href = resolvePublicAssetUrl(pdf.src, import.meta.env.BASE_URL);
  const pillClass =
    variant === 'topbar'
      ? 'h-8 rounded-full px-2.5 text-xs font-medium shadow-lg backdrop-blur transition hover:opacity-90'
      : 'rounded-lg px-2.5 py-1 text-xs font-medium transition hover:opacity-90';

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${pdf.title} (opens in new tab)`}
        className={`inline-flex shrink-0 items-center ${pillClass}`}
        style={{
          backgroundColor: 'var(--vml-panel)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
        }}
      >
        {label}
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openPdfPreview(pdf);
        }}
        aria-label={`Preview ${pdf.title} in panel`}
        title="Preview in panel"
        className={`hidden shrink-0 items-center md:inline-flex ${
          variant === 'topbar'
            ? 'h-8 rounded-full px-2 text-[11px] font-medium shadow-lg backdrop-blur transition hover:opacity-90'
            : 'rounded-lg px-2 py-1 text-[11px] font-medium transition hover:opacity-90'
        }`}
        style={{
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text-muted)',
        }}
      >
        Preview
      </button>
    </div>
  );
}

interface CommonPdfLinkProps {
  pdf?: AssetFile;
}

export function CommonPdfLink({ pdf }: CommonPdfLinkProps) {
  const openPdfPreview = useSessionStore((s) => s.openPdfPreview);
  if (!pdf) return null;

  const href = resolvePublicAssetUrl(pdf.src, import.meta.env.BASE_URL);
  return (
    <div className="inline-flex items-center gap-1.5">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${pdf.title} (opens in new tab)`}
        className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold shadow-sm transition hover:opacity-90"
        style={{
          backgroundColor: 'var(--vml-panel)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
        }}
      >
        General instructions (PDF)
      </a>
      <button
        type="button"
        onClick={() => openPdfPreview(pdf)}
        aria-label={`Preview ${pdf.title} in panel`}
        className="hidden h-8 items-center rounded-full px-2.5 text-xs font-medium transition hover:opacity-90 md:inline-flex"
        style={{
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text-muted)',
        }}
      >
        Preview
      </button>
    </div>
  );
}
