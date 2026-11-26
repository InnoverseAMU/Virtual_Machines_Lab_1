export const AUTHOR_NAME = 'Asad Mokarim';
export const AUTHOR_GITHUB_URL = 'https://github.com/asad-mokarim';
export const INNOVERSE_URL = 'https://innoverseamu.in';

interface LabFooterProps {
  variant?: 'landing' | 'mode';
}

export function LabFooter({ variant = 'landing' }: LabFooterProps) {
  const isLanding = variant === 'landing';

  return (
    <footer
      className={
        isLanding
          ? 'mt-16 border-t border-slate-200 bg-slate-100/80 px-4 py-9 text-center font-sans text-xs text-slate-500 dark:border-slate-900 dark:bg-[#03060a] dark:text-slate-400'
          : 'w-full px-4 py-8 text-center font-sans text-xs text-slate-500 dark:text-slate-400'
      }
    >
      <div className="mx-auto max-w-4xl space-y-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          It&apos;s a project of{' '}
          <a
            href={INNOVERSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sky-600 underline-offset-4 transition-colors hover:text-sky-500 hover:underline dark:text-cyan-400 dark:hover:text-cyan-300"
          >
            Innoverse
          </a>
          , built by{' '}
          <a
            href={AUTHOR_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-slate-900 underline-offset-4 transition-colors hover:text-sky-600 hover:underline dark:text-white dark:hover:text-cyan-300"
          >
            {AUTHOR_NAME}
          </a>
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-500">
          EEC2912 • Electrical Machines Lab I • Aligarh Muslim University (AMU)
        </p>
      </div>
    </footer>
  );
}
