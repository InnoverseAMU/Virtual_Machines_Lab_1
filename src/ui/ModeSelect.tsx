import { getAllLearnSteps } from '../core/circuit/stages';
import { ASSET_MANIFEST, getExperimentAssets } from '../core/experiments/assets';
import { EXPERIMENT_SUMMARIES, getExperiment } from '../core/experiments/registry';
import { enterLabMode } from '../stores/modeActions';
import { useSessionStore } from '../stores/sessionStore';
import { LabFooter } from './LabFooter';
import { ExperimentPdfActions } from './PdfActions';
import { ThemeToggleButton } from './ThemeToggleButton';

export function ModeSelect() {
  const experimentId = useSessionStore((s) => s.experimentId);
  const learnCompleted = useSessionStore((s) => s.learnCompleted);
  const runCompleted = useSessionStore((s) => s.runCompleted);
  const runPractised = useSessionStore((s) => s.runPractised);
  const goToScreen = useSessionStore((s) => s.goToScreen);

  const experiment = getExperiment(experimentId);
  const summary = EXPERIMENT_SUMMARIES.find((e) => e.id === experimentId);
  const expAssets = getExperimentAssets(ASSET_MANIFEST, experimentId);
  const isLearnDone = Boolean(learnCompleted[experimentId]);
  const isRunDone = Boolean(runCompleted[experimentId]);
  const isObserveDone = Boolean(runPractised[experimentId]);
  const learnStepCount = getAllLearnSteps(experiment).length;

  const modes = [
    {
      id: 'learn' as const,
      title: 'Learn mode',
      badge: isLearnDone ? 'Completed' : 'Guided',
      badgeTone: isLearnDone
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
        : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-400',
      description: `Walk through the ${learnStepCount} steps with guided wiring, apparatus highlights, and interactive voltage checks.`,
      cta: 'Start guided walkthrough',
    },
    {
      id: 'observe' as const,
      title: 'Observe mode (pre-wired)',
      badge: isObserveDone ? 'Practised' : 'Pre-wired',
      badgeTone: isObserveDone
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
        : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/50 dark:bg-sky-950/80 dark:text-sky-400',
      description:
        'Connections are already made. Take readings and complete the observation table.',
      cta: 'Open pre-wired bench',
    },
    {
      id: 'self' as const,
      title: 'Self mode',
      badge: isRunDone ? 'Completed' : 'Practice',
      badgeTone: isRunDone
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400'
        : 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800/40 dark:bg-cyan-950/70 dark:text-cyan-300',
      description:
        'Wire the circuit yourself, switch on, and submit to have your connections checked.',
      cta: 'Enter bench',
    },
  ];

  return (
    <div className="mode-page blueprint-grid fixed inset-0 flex flex-col justify-between overflow-x-hidden overflow-y-auto selection:bg-cyan-500/20 selection:text-cyan-600 dark:selection:text-cyan-300">
      {/* Top utility bar */}
      <header className="mx-auto w-full max-w-6xl px-6 pt-7 pb-4">
        <div className="relative flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goToScreen('picker')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white/85 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition-all hover:border-sky-400 hover:text-slate-950 dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-cyan-500/50 dark:hover:text-white"
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            <span>Back to experiments</span>
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-slate-600 select-none md:flex dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
            <span className="text-sky-600 dark:text-cyan-400">EEC2912</span>
            <span className="text-slate-400 dark:text-slate-600">•</span>
            <span>Electrical Machines Lab I</span>
          </div>

          <ThemeToggleButton variant="vault" />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-6xl flex-grow flex-col justify-center px-6 py-4">
        {/* Experiment Overview Card */}
        <section className="mode-card-transition relative mb-6 overflow-hidden rounded-2xl border border-slate-200 p-7 backdrop-blur-sm md:p-8 dark:border-cyan-950/70">
          {/* Subtle top gradient accent line */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/40 to-transparent dark:via-cyan-500/40"
          />

          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div className="max-w-2xl space-y-4">
              <div>
                <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-sky-700 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-400">
                  Exp {summary?.number ?? experiment.id}
                </span>
              </div>

              <h1 className="font-space text-2xl font-bold tracking-tight text-slate-900 md:text-3xl dark:text-white">
                {experiment.title}
              </h1>

              <div className="space-y-2 pt-1">
                <h2 className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  OBJECT
                </h2>
                <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {experiment.object.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5 text-xs text-sky-600 dark:text-cyan-400">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start pt-1">
              <ExperimentPdfActions
                pdf={expAssets.pdf}
                variant="inline"
                tone="vault"
              />
            </div>
          </div>
        </section>

        {/* Mode Selection Cards */}
        <section
          aria-label="Experiment interaction modes"
          className="grid grid-cols-1 gap-5 md:grid-cols-3"
        >
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => enterLabMode(experimentId, m.id)}
              className="mode-card-transition group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 p-6 text-left hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none dark:border-cyan-900/40 dark:hover:border-cyan-400/60"
            >
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-space text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                    {m.title}
                  </h3>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${m.badgeTone}`}
                  >
                    {m.badge}
                  </span>
                </div>

                <p className="mb-8 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {m.description}
                </p>
              </div>

              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 transition-colors group-hover:text-sky-500 dark:text-cyan-400 dark:group-hover:text-cyan-300">
                  <span>{m.cta}</span>
                  <span className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </button>
          ))}
        </section>
      </main>

      <LabFooter variant="mode" />
    </div>
  );
}
