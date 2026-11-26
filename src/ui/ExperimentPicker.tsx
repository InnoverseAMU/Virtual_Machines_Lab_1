import { EXPERIMENT_SUMMARIES } from '../core/experiments/registry';
import type { ExperimentSummary } from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { ThemeToggleButton } from './ThemeToggleButton';

export function ExperimentPicker() {
  const attempts = useSessionStore((s) => s.attempts);
  const completedExperiments = useSessionStore((s) => s.completedExperiments);
  const usedSolutionByExperiment = useSessionStore(
    (s) => s.usedSolutionByExperiment,
  );
  const learnCompleted = useSessionStore((s) => s.learnCompleted);
  const runCompleted = useSessionStore((s) => s.runCompleted);
  const runPractised = useSessionStore((s) => s.runPractised);
  const selectExperiment = useSessionStore((s) => s.selectExperiment);
  const goToScreen = useSessionStore((s) => s.goToScreen);

  const transformers = EXPERIMENT_SUMMARIES.filter(
    (e) => e.group === 'transformers',
  );
  const induction = EXPERIMENT_SUMMARIES.filter((e) => e.group === 'induction');

  const renderCard = (exp: ExperimentSummary) => {
    const isCompleted = completedExperiments.includes(exp.id);
    const isLearnDone = Boolean(learnCompleted[exp.id]);
    const isRunDone = Boolean(runCompleted[exp.id]);
    const isObserveDone = Boolean(runPractised[exp.id]);
    const attemptCount = attempts[exp.id] ?? 0;
    const usedSol = Boolean(usedSolutionByExperiment[exp.id]);

    return (
      <button
        key={exp.id}
        type="button"
        disabled={!exp.available}
        onClick={() => {
          if (!exp.available) return;
          selectExperiment(exp.id);
          goToScreen('mode');
        }}
        className={`flex w-full flex-col justify-between gap-3 rounded-2xl p-4 text-left transition ${
          exp.available
            ? 'cursor-pointer hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none'
            : 'cursor-not-allowed opacity-60'
        }`}
        style={{
          backgroundColor: 'var(--vml-panel)',
          border: exp.available
            ? '1px solid var(--vml-accent)'
            : '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
        }}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span
              className="rounded-md px-2 py-0.5 font-mono text-xs font-bold"
              style={{
                backgroundColor: exp.available
                  ? 'var(--vml-accent)'
                  : 'var(--vml-panel-hover)',
                color: exp.available
                  ? 'var(--vml-accent-text)'
                  : 'var(--vml-text-muted)',
              }}
            >
              Exp {exp.number}
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              {!exp.available ? (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    color: 'var(--vml-text-muted)',
                  }}
                >
                  Coming soon
                </span>
              ) : isCompleted ? (
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Completed
                </span>
              ) : (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    color: 'var(--vml-accent)',
                  }}
                >
                  Available
                </span>
              )}
            </div>
          </div>

          <h3 className="text-sm leading-snug font-semibold">{exp.title}</h3>
        </div>

        {exp.available && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            <div className="flex flex-wrap items-center gap-1">
              <span>Attempts: {attemptCount}</span>
              {isLearnDone && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  Learn completed
                </span>
              )}
              {isRunDone && (
                <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Run completed
                </span>
              )}
              {isObserveDone && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  Run practised (pre-wired)
                </span>
              )}
              {usedSol && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  Used solution
                </span>
              )}
            </div>
            <span style={{ color: 'var(--vml-accent)' }} className="font-semibold">
              Select →
            </span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 overflow-y-auto px-4 py-6 sm:px-6 md:py-10"
      style={{
        backgroundColor: 'var(--vml-page-bg)',
        color: 'var(--vml-text)',
      }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p
              className="font-mono text-xs font-semibold tracking-wider uppercase"
              style={{ color: 'var(--vml-accent)' }}
            >
              EEC2910 · Electrical Machines Lab 1
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Virtual Machines Lab
            </h1>
            <p className="text-sm" style={{ color: 'var(--vml-text-muted)' }}>
              Choose a laboratory experiment to wire and test on the 3D bench.
            </p>
          </div>
          <ThemeToggleButton />
        </header>

        <section aria-labelledby="group-transformers" className="space-y-3">
          <h2
            id="group-transformers"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            Transformers (3.1 to 3.6)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {transformers.map(renderCard)}
          </div>
        </section>

        <section aria-labelledby="group-induction" className="space-y-3">
          <h2
            id="group-induction"
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            Induction machines (4.1, 4.2, 4.5)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {induction.map(renderCard)}
          </div>
        </section>
      </div>
    </div>
  );
}
