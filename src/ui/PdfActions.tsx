import {
  resolvePublicAssetUrl,
  type AssetFile,
} from '../core/experiments/assets';
import { useSessionStore } from '../stores/sessionStore';

interface ExperimentPdfActionsProps {
  pdf?: AssetFile;
  variant?: 'card' | 'inline' | 'topbar';
  tone?: 'default' | 'vault';
  label?: string;
  showPreviewOnMobile?: boolean;
}

export function ExperimentPdfActions({
  pdf,
  variant = 'inline',
  tone = 'default',
  label = 'View experiment PDF',
}: ExperimentPdfActionsProps) {
  const openPdfPreview = useSessionStore((s) => s.openPdfPreview);

  if (!pdf) {
    if (tone === 'vault') {
      return (
        <button
          type="button"
          disabled
          aria-label="PDF not added yet"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex cursor-not-allowed items-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-400 opacity-70 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500"
        >
          PDF not added yet
        </button>
      );
    }

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

  if (tone === 'vault') {
    const isCard = variant === 'card';
    return (
      <div
        className="inline-flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${pdf.title} (opens in new tab)`}
          title={pdf.title}
          className={
            isCard
              ? 'inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
              : 'inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white'
          }
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
          className={
            isCard
              ? 'hidden shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800 md:inline-flex dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              : 'hidden shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 md:inline-flex dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
          }
        >
          Preview
        </button>
      </div>
    );
  }

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
  tone?: 'default' | 'vault';
}

export function CommonPdfLink({ pdf, tone = 'default' }: CommonPdfLinkProps) {
  const openPdfPreview = useSessionStore((s) => s.openPdfPreview);
  if (!pdf) return null;

  const href = resolvePublicAssetUrl(pdf.src, import.meta.env.BASE_URL);

  if (tone === 'vault') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${pdf.title} (opens in new tab)`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition duration-200 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 text-sky-600 dark:text-cyan-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>Lab Manual (PDF)</span>
        </a>
        <button
          type="button"
          onClick={() => openPdfPreview(pdf)}
          aria-label={`Preview ${pdf.title} in panel`}
          className="hidden items-center rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 md:inline-flex dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          Preview
        </button>
      </div>
    );
  }

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
        Lab Manual (PDF)
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
