import { EXPERIMENT_SUMMARIES, getExperiment } from '../core/experiments/registry';
import { enterLabMode } from '../stores/modeActions';
import { useSessionStore } from '../stores/sessionStore';
import { ThemeToggleButton } from './ThemeToggleButton';

export function ModeSelect() {
  const experimentId = useSessionStore((s) => s.experimentId);
  const learnCompleted = useSessionStore((s) => s.learnCompleted);
  const runPractised = useSessionStore((s) => s.runPractised);
  const goToScreen = useSessionStore((s) => s.goToScreen);

  const experiment = getExperiment(experimentId);
  const summary = EXPERIMENT_SUMMARIES.find((e) => e.id === experimentId);
  const isLearnDone = Boolean(learnCompleted[experimentId]);
  const isObserveDone = Boolean(runPractised[experimentId]);

  return (
    <div
      className="fixed inset-0 overflow-y-auto px-4 py-6 sm:px-6 md:py-10"
      style={{
        backgroundColor: 'var(--vml-page-bg)',
        color: 'var(--vml-text)',
      }}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goToScreen('picker')}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            ← Back to experiments
          </button>
          <ThemeToggleButton />
        </div>

        <div
          className="space-y-3 rounded-2xl p-5"
          style={{
            backgroundColor: 'var(--vml-panel)',
            border: '1px solid var(--vml-border)',
          }}
        >
          <span
            className="inline-block rounded-md px-2 py-0.5 font-mono text-xs font-bold"
            style={{
              backgroundColor: 'var(--vml-accent)',
              color: 'var(--vml-accent-text)',
            }}
          >
            Exp {summary?.number ?? experiment.id}
          </span>
          <h1 className="text-xl font-bold sm:text-2xl">{experiment.title}</h1>
          <div className="space-y-1">
            <div
              className="text-xs font-semibold uppercase"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              Object
            </div>
            <ul
              className="list-disc space-y-1 pl-5 text-sm"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              {experiment.object.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => enterLabMode(experimentId, 'learn')}
            className="flex flex-col justify-between gap-4 rounded-2xl p-5 text-left transition hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-accent)',
              color: 'var(--vml-text)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold">Learn mode</span>
                {isLearnDone ? (
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    Completed
                  </span>
                ) : (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: 'var(--vml-accent)',
                      color: 'var(--vml-accent-text)',
                    }}
                  >
                    Guided
                  </span>
                )}
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                Walk through the 17 steps with guided wiring, apparatus
                highlights, and interactive voltage checks.
              </p>
            </div>
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--vml-accent)' }}
            >
              Start guided walkthrough →
            </span>
          </button>

          <button
            type="button"
            onClick={() => enterLabMode(experimentId, 'observe')}
            className="flex flex-col justify-between gap-4 rounded-2xl p-5 text-left transition hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-accent)',
              color: 'var(--vml-text)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold">
                  Observe mode (pre-wired)
                </span>
                {isObserveDone ? (
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    Practised
                  </span>
                ) : (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: 'var(--vml-panel-hover)',
                      color: 'var(--vml-accent)',
                    }}
                  >
                    Pre-wired
                  </span>
                )}
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                Connections are already made. Take readings and complete the
                observation table.
              </p>
            </div>
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--vml-accent)' }}
            >
              Open pre-wired bench →
            </span>
          </button>

          <button
            type="button"
            onClick={() => enterLabMode(experimentId, 'self')}
            className="flex flex-col justify-between gap-4 rounded-2xl p-5 text-left transition hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-accent)',
              color: 'var(--vml-text)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold">Self mode</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    color: 'var(--vml-accent)',
                  }}
                >
                  Practice
                </span>
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                Wire the circuit yourself, switch on, and submit to have your
                connections checked.
              </p>
            </div>
            <span
              className="text-xs font-semibold"
              style={{ color: 'var(--vml-accent)' }}
            >
              Enter bench →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
