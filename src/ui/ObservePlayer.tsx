import { useState } from 'react';
import { MAX_OBSERVATION_ROWS } from '../core/physics/report';
import type { ObserveReadyStatus, ObserveStep } from '../core/types';

interface ObservePlayerProps {
  stageTitle?: string;
  step: ObserveStep;
  stepIndex: number;
  totalSteps: number;
  readyStatus: ObserveReadyStatus;
  canAddRow: boolean;
  rowCount: number;
  diagramCount: number;
  diagramPanelOpen: boolean;
  onToggleDiagram: () => void;
  onAddRow: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function ObservePlayer({
  stageTitle,
  step,
  stepIndex,
  totalSteps,
  readyStatus,
  canAddRow,
  rowCount,
  diagramCount,
  diagramPanelOpen,
  onToggleDiagram,
  onAddRow,
  onNext,
  onBack,
}: ObservePlayerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  if (collapsed) {
    return (
      <div className="pointer-events-auto absolute bottom-14 left-2 z-20 md:bottom-3 md:left-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-xl backdrop-blur-md transition"
          style={{
            backgroundColor: 'var(--vml-panel)',
            border: '1px solid var(--vml-border)',
            color: 'var(--vml-text)',
          }}
        >
          <span
            className="font-mono text-[11px] font-bold"
            style={{ color: 'var(--vml-accent)' }}
          >
            Obs {stepIndex + 1}/{totalSteps}
          </span>
          <span className="max-w-[180px] truncate">{step.which}</span>
          {readyStatus.recorded && (
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              ✓
            </span>
          )}
          <span aria-hidden="true">▴</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Observation guide"
      className="pointer-events-auto absolute right-2 bottom-14 left-2 z-20 max-w-[calc(100%-1rem)] rounded-2xl p-3.5 shadow-2xl backdrop-blur-md md:right-auto md:bottom-3 md:left-3 md:w-[390px] md:max-w-[calc(100%-1.5rem)] md:p-4 dark:shadow-[0_0_28px_-8px_rgba(0,242,254,0.22)]"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      <div className="space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                color: 'var(--vml-accent)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Obs {stepIndex + 1} of {totalSteps}
            </span>
            {stageTitle && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: 'var(--vml-panel-hover)',
                  color: 'var(--vml-text-muted)',
                }}
              >
                {stageTitle}
              </span>
            )}
            {readyStatus.recorded && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                ✓ Recorded
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {diagramCount > 0 && (
              <button
                type="button"
                onClick={onToggleDiagram}
                aria-pressed={diagramPanelOpen}
                className="rounded-lg px-2 py-0.5 text-[11px] font-semibold transition"
                style={{
                  backgroundColor: diagramPanelOpen
                    ? 'var(--vml-accent)'
                    : 'var(--vml-panel-hover)',
                  color: diagramPanelOpen
                    ? 'var(--vml-accent-text)'
                    : 'var(--vml-text)',
                  border: '1px solid var(--vml-border)',
                }}
              >
                Diagram (D)
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Minimize observation guide"
              className="rounded-lg px-2 py-0.5 text-xs font-semibold opacity-80 hover:opacity-100"
            >
              ▾
            </button>
          </div>
        </div>

        {/* Which observation */}
        <h2 className="font-space text-sm font-bold leading-snug md:text-base">
          {step.which}
        </h2>

        {/* Why & When */}
        <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5 text-xs leading-relaxed">
          <div>
            <span className="font-semibold" style={{ color: 'var(--vml-accent)' }}>
              Why:{' '}
            </span>
            <span style={{ color: 'var(--vml-text-muted)' }}>{step.why}</span>
          </div>
          <div>
            <span className="font-semibold" style={{ color: 'var(--vml-accent)' }}>
              When:{' '}
            </span>
            <span style={{ color: 'var(--vml-text-muted)' }}>{step.when}</span>
          </div>
          <div className="pt-0.5">
            <div className="mb-1 text-[11px] font-semibold">
              Steps to take this observation now:
            </div>
            <ol
              className="list-decimal space-y-0.5 pl-4 text-[11px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              {step.steps.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ol>
          </div>
        </div>

        {/* Live readiness & direct Record button */}
        <div
          className="space-y-2 rounded-xl p-2.5 text-xs"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: readyStatus.ready
              ? '1px solid #16a34a'
              : '1px solid var(--vml-border)',
          }}
        >
          <div
            className={`text-[11px] leading-snug font-medium ${
              readyStatus.ready ? 'text-emerald-400' : ''
            }`}
          >
            {readyStatus.statusText}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={!canAddRow}
              onClick={onAddRow}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                readyStatus.ready && canAddRow ? 'bg-emerald-600 text-white hover:bg-emerald-500' : ''
              }`}
              style={
                readyStatus.ready && canAddRow
                  ? undefined
                  : {
                      backgroundColor: 'var(--vml-accent)',
                      color: 'var(--vml-accent-text)',
                    }
              }
            >
              + Record observation (Add row)
            </button>
            <span
              className="font-mono text-[11px] font-semibold tabular-nums"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              {rowCount}/{MAX_OBSERVATION_ROWS}
            </span>
          </div>
        </div>

        {/* Step Navigation */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
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

          <button
            type="button"
            disabled={isLast}
            onClick={onNext}
            className="rounded-lg px-3.5 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: 'var(--vml-accent)',
              color: 'var(--vml-accent-text)',
            }}
          >
            {isLast ? 'Last step' : 'Next →'}
          </button>
        </div>
      </div>
    </section>
  );
}
