import type { LearnConditionStatus } from '../core/circuit/learn';
import type { LearnStep } from '../core/types';

interface LearnPlayerProps {
  step: LearnStep;
  stepIndex: number;
  totalSteps: number;
  conditionStatus: LearnConditionStatus;
  showNumericReadouts: boolean;
  onToggleNumericReadouts: () => void;
  learnFinished: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onGotIt: () => void;
  onDoItForMe: () => void;
  onFinish: () => void;
  onReplay: () => void;
  onTryYourself: () => void;
  onExit: () => void;
}

export function LearnPlayer({
  step,
  stepIndex,
  totalSteps,
  conditionStatus,
  showNumericReadouts,
  onToggleNumericReadouts,
  learnFinished,
  onNext,
  onBack,
  onSkip,
  onGotIt,
  onDoItForMe,
  onFinish,
  onReplay,
  onTryYourself,
  onExit,
}: LearnPlayerProps) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const showHiddenNumbersNote =
    !showNumericReadouts && (stepIndex === 12 || stepIndex === 14);
  const nextDisabled = conditionStatus.hasCondition && !conditionStatus.met;

  return (
    <section
      aria-label="Guided walkthrough"
      className="pointer-events-auto absolute right-2 bottom-14 left-2 z-20 max-w-[calc(100%-1rem)] rounded-2xl p-3.5 shadow-2xl backdrop-blur md:right-auto md:bottom-3 md:left-3 md:w-[360px] md:max-w-[calc(100%-1.5rem)] md:p-4"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      {learnFinished ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
              Walkthrough Complete
            </span>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg px-2 py-1 text-xs font-semibold opacity-80 hover:opacity-100"
            >
              Exit
            </button>
          </div>
          <h2 className="text-sm font-bold md:text-base">
            Exp 3.1 Guided Walkthrough Complete
          </h2>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            You have wired the single-phase transformer load test, measured
            no-load and loaded readings while holding 230 V, and reviewed the
            regulation and efficiency formulas.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onReplay}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Replay
            </button>
            <button
              type="button"
              onClick={onTryYourself}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-accent)',
                color: 'var(--vml-accent-text)',
              }}
            >
              Try it yourself
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Header: progress + exit */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                color: 'var(--vml-accent)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Step {stepIndex + 1} of {totalSteps}
            </span>
            <button
              type="button"
              onClick={onExit}
              className="rounded-lg px-2 py-0.5 text-xs font-semibold opacity-80 hover:opacity-100"
            >
              Exit (Esc)
            </button>
          </div>

          <h2 className="text-sm font-bold leading-snug md:text-base">
            {step.title}
          </h2>

          <p
            className="max-h-24 overflow-y-auto text-xs leading-relaxed md:max-h-32"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            {step.why}
          </p>

          {showHiddenNumbersNote && (
            <div
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px]"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              <span>Numeric readouts are currently hidden.</span>
              <button
                type="button"
                onClick={onToggleNumericReadouts}
                className="shrink-0 font-semibold underline"
                style={{ color: 'var(--vml-accent)' }}
              >
                Show numbers
              </button>
            </div>
          )}

          {conditionStatus.hasCondition && (
            <div
              className="space-y-2 rounded-xl p-2.5 text-xs"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: conditionStatus.met
                  ? '1px solid #16a34a'
                  : '1px solid var(--vml-border)',
              }}
            >
              <div
                className={`text-[11px] leading-snug font-medium ${
                  conditionStatus.met ? 'text-emerald-400' : ''
                }`}
              >
                {conditionStatus.hint}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {step.completionCondition?.kind === 'no-load-ack' && (
                  <button
                    type="button"
                    disabled={!conditionStatus.canAcknowledge}
                    onClick={onGotIt}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Got it
                  </button>
                )}
                {!conditionStatus.met && (
                  <button
                    type="button"
                    onClick={onDoItForMe}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: 'var(--vml-panel)',
                      border: '1px solid var(--vml-border)',
                    }}
                  >
                    Do it for me
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Footer controls */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isFirst}
                onClick={onBack}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--vml-panel-hover)',
                  border: '1px solid var(--vml-border)',
                }}
              >
                ← Back
              </button>

              {!isLast && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  Skip step
                </button>
              )}
            </div>

            {isLast ? (
              <button
                type="button"
                onClick={onFinish}
                className="rounded-lg px-3.5 py-1.5 text-xs font-bold"
                style={{
                  backgroundColor: 'var(--vml-accent)',
                  color: 'var(--vml-accent-text)',
                }}
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                disabled={nextDisabled}
                onClick={onNext}
                className="rounded-lg px-3.5 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  backgroundColor: 'var(--vml-accent)',
                  color: 'var(--vml-accent-text)',
                }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
