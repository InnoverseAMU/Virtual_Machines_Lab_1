import { EXPERIMENT_SUMMARIES, getExperiment } from '../core/experiments/registry';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';
import { ThemeToggleButton } from './ThemeToggleButton';

export function ModeSelect() {
  const experimentId = useSessionStore((s) => s.experimentId);
  const goToScreen = useSessionStore((s) => s.goToScreen);
  const setMode = useSessionStore((s) => s.setMode);
  const resetLabSession = useSessionStore((s) => s.resetLabSession);
  const clearAllWires = useWiringStore((s) => s.clearAllWires);
  const initFromControls = useControlsStore((s) => s.initFromControls);

  const experiment = getExperiment(experimentId);
  const summary = EXPERIMENT_SUMMARIES.find((e) => e.id === experimentId);

  const startSelfMode = () => {
    clearAllWires(false);
    initFromControls(experiment.controls);
    resetLabSession();
    setMode('self');
    goToScreen('lab');
  };

  return (
    <div
      className="fixed inset-0 overflow-y-auto px-4 py-6 sm:px-6 md:py-10"
      style={{
        backgroundColor: 'var(--vml-page-bg)',
        color: 'var(--vml-text)',
      }}
    >
      <div className="mx-auto max-w-2xl space-y-6">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={startSelfMode}
            className="flex flex-col justify-between gap-4 rounded-2xl p-5 text-left transition hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-accent)',
              color: 'var(--vml-text)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold">Self mode</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-accent)',
                    color: 'var(--vml-accent-text)',
                  }}
                >
                  Active
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

          <button
            type="button"
            disabled
            className="flex cursor-not-allowed flex-col justify-between gap-4 rounded-2xl p-5 text-left opacity-60"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold">Learn mode</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    color: 'var(--vml-text-muted)',
                  }}
                >
                  Coming soon
                </span>
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                Guided step-by-step walkthrough of the circuit connections.
              </p>
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              Coming soon
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
