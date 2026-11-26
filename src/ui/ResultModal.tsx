import { useMemo, useState } from 'react';
import { buildFeedback } from '../core/circuit/feedback';
import type { ExperimentDef } from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { HintPanel } from './HintPanel';
import { Modal } from './Modal';

interface ResultModalProps {
  experiment: ExperimentDef;
  onRequestReset: () => void;
}

export function ResultModal({ experiment, onRequestReset }: ResultModalProps) {
  const [confirmingSolution, setConfirmingSolution] = useState(false);

  const validationResult = useSessionStore((s) => s.validationResult);
  const resultModalOpen = useSessionStore((s) => s.resultModalOpen);
  const hintLevel = useSessionStore((s) => s.hintLevel);
  const attempts = useSessionStore((s) => s.attempts);
  const usedSolutionInRun = useSessionStore((s) => s.usedSolutionInRun);
  const retry = useSessionStore((s) => s.retry);
  const closeResultModal = useSessionStore((s) => s.closeResultModal);
  const nextHint = useSessionStore((s) => s.nextHint);
  const activateSolutionView = useSessionStore((s) => s.activateSolutionView);

  const feedback = useMemo(() => {
    if (!validationResult) return null;
    return buildFeedback(experiment, validationResult, hintLevel);
  }, [experiment, validationResult, hintLevel]);

  const handleClose = () => {
    setConfirmingSolution(false);
    closeResultModal();
  };

  if (!validationResult || !feedback) return null;

  const attemptCount = attempts[experiment.id] ?? 0;

  return (
    <Modal
      open={resultModalOpen}
      onClose={handleClose}
      titleId="result-modal-title"
    >
      {feedback.correct ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                Connections Correct
              </span>
              <h2 id="result-modal-title" className="mt-2 text-lg font-bold">
                {experiment.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close result dialog"
              className="rounded-lg px-2 py-1 text-sm font-bold opacity-75 hover:opacity-100"
            >
              ×
            </button>
          </div>

          <p className="text-sm" style={{ color: 'var(--vml-text-muted)' }}>
            {feedback.summary}
          </p>

          <dl
            className="grid grid-cols-3 gap-2 rounded-xl p-3 text-xs"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
            }}
          >
            <div>
              <dt style={{ color: 'var(--vml-text-muted)' }}>Attempts</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold">
                {attemptCount}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--vml-text-muted)' }}>Hints used</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold">
                {hintLevel > 0 ? `Yes (${hintLevel})` : 'No'}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--vml-text-muted)' }}>Solution used</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold">
                {usedSolutionInRun ? 'Yes' : 'No'}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                handleClose();
                onRequestReset();
              }}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Reset bench
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-accent)',
                color: 'var(--vml-accent-text)',
              }}
            >
              Continue on bench
            </button>
          </div>
        </div>
      ) : confirmingSolution ? (
        <div className="space-y-4">
          <h2 id="result-modal-title" className="text-base font-bold">
            Show wiring solution?
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--vml-text-muted)' }}>
            This shows the solution wires on the bench and records that you used
            the solution for this run. Your current wires stay intact unless you
            choose Apply to bench.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingSolution(false)}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingSolution(false);
                activateSolutionView();
              }}
              className="rounded-lg px-4 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-accent)',
                color: 'var(--vml-accent-text)',
              }}
            >
              Show solution
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                Check Wiring
              </span>
              <h2 id="result-modal-title" className="mt-2 text-lg font-bold">
                {feedback.summary}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close result dialog"
              className="rounded-lg px-2 py-1 text-sm font-bold opacity-75 hover:opacity-100"
            >
              ×
            </button>
          </div>

          {feedback.categoryMessages.length > 0 && (
            <div className="space-y-1.5">
              <div
                className="text-[11px] font-bold uppercase"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                Incomplete or shorted areas
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs">
                {feedback.categoryMessages.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {feedback.faultMessages.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-red-400 uppercase">
                Detected faults
              </div>
              <ul className="space-y-1.5 text-xs">
                {feedback.faultMessages.map((msg, idx) => (
                  <li
                    key={idx}
                    className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-red-100"
                  >
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <HintPanel feedback={feedback} hintLevel={hintLevel} />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={nextHint}
                disabled={feedback.remainingHints === 0}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--vml-panel-hover)',
                  border: '1px solid var(--vml-border)',
                }}
              >
                {feedback.remainingHints > 0
                  ? `Hint (${feedback.remainingHints} left)`
                  : 'All hints shown'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSolution(true)}
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--vml-panel-hover)',
                  border: '1px solid var(--vml-border)',
                }}
              >
                Show solution
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setConfirmingSolution(false);
                retry();
              }}
              className="rounded-lg px-4 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--vml-accent)',
                color: 'var(--vml-accent-text)',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
