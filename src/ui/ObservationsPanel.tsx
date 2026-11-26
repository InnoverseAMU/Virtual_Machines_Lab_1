import { getStage } from '../core/circuit/stages';
import {
  evaluateColumnValue,
  evaluateRowRules,
  evaluateStagePrerequisites,
  getRowValue,
  MAX_OBSERVATION_ROWS,
} from '../core/physics/report';
import type {
  ColumnDef,
  ControlValues,
  ExperimentDef,
  ObservationCellValue,
  PhysicsSolveOutput,
} from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { ObservationChart } from './ObservationChart';

interface ObservationsPanelProps {
  experiment: ExperimentDef;
  output: PhysicsSolveOutput;
  controls: ControlValues;
  energised: boolean;
}

function formatCellValue(
  col: ColumnDef,
  val: ObservationCellValue,
): string {
  if (val === null || val === undefined) {
    return col.placeholder ?? '—';
  }
  if (typeof val === 'number') {
    const dec = col.displayDecimals ?? col.decimals;
    return dec !== undefined ? val.toFixed(dec) : String(val);
  }
  return String(val);
}

export function ObservationsPanel({
  experiment,
  output,
  controls,
  energised,
}: ObservationsPanelProps) {
  const mode = useSessionStore((s) => s.mode);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const observationRows = useSessionStore((s) => s.observationRows);
  const runAnswerInputs = useSessionStore((s) => s.runAnswerInputs);
  const runCheckResult = useSessionStore((s) => s.runCheckResult);
  const attempts = useSessionStore((s) => s.attempts);
  const hintLevel = useSessionStore((s) => s.hintLevel);
  const usedSolutionInRun = useSessionStore((s) => s.usedSolutionInRun);
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);

  const addObservationRow = useSessionStore((s) => s.addObservationRow);
  const deleteObservationRow = useSessionStore((s) => s.deleteObservationRow);
  const clearObservationRows = useSessionStore((s) => s.clearObservationRows);
  const setRunAnswerInput = useSessionStore((s) => s.setRunAnswerInput);
  const submitRunAnswers = useSessionStore((s) => s.submitRunAnswers);
  const clearRunCheckResult = useSessionStore((s) => s.clearRunCheckResult);

  const isObserveMode = mode === 'observe';
  const stage = getStage(experiment, currentStageIndex);
  const supplyOn = Boolean(controls['sup.switch']);
  const canAddRow =
    supplyOn && energised && observationRows.length < MAX_OBSERVATION_ROWS;

  const visibleColumns = stage.observationTable.filter((c) => !c.hidden);
  const prereqs = evaluateStagePrerequisites(stage, observationRows);
  const charts = stage.charts ?? experiment.charts ?? [];

  return (
    <div className="space-y-3 text-xs">
      {/* Compact generic live reading strip */}
      <div
        className="grid gap-1 rounded-xl px-2 py-1.5 text-center font-mono text-[11px] tabular-nums"
        style={{
          gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, output.meters.length))}, minmax(0, 1fr))`,
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
        }}
      >
        {output.meters.map((meter) => {
          const dec = meter.decimals ?? (meter.kind === 'ammeter' ? 2 : 1);
          const text = meter.damaged
            ? 'DMG'
            : `${meter.shownValue.toFixed(dec)}${meter.unit}`;
          return (
            <div key={meter.id}>
              <div
                className="truncate text-[9px]"
                style={{ color: 'var(--vml-text-muted)' }}
                title={meter.label}
              >
                {meter.id.toUpperCase()}
              </div>
              <div
                className="font-bold"
                style={
                  meter.kind === 'wattmeter'
                    ? { color: 'var(--vml-accent)' }
                    : undefined
                }
              >
                {showNumericReadouts ? text : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add row & Clear actions */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canAddRow}
          onClick={() => addObservationRow(output, controls, energised)}
          className="flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            backgroundColor: 'var(--vml-accent)',
            color: 'var(--vml-accent-text)',
          }}
        >
          + Add row ({observationRows.length}/{MAX_OBSERVATION_ROWS})
        </button>

        {observationRows.length > 0 && (
          <button
            type="button"
            onClick={clearObservationRows}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {!supplyOn || !energised ? (
        <p className="text-[11px]" style={{ color: 'var(--vml-text-muted)' }}>
          Energise the circuit (Supply ON) to capture observation rows.
        </p>
      ) : null}

      {/* Schema-driven read-only observation table */}
      <div
        className="overflow-x-auto rounded-xl"
        style={{ border: '1px solid var(--vml-border)' }}
      >
        <table className="w-full border-collapse text-right font-mono text-[10px] tabular-nums">
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                color: 'var(--vml-text-muted)',
              }}
            >
              {visibleColumns.map((col, idx) => (
                <th
                  key={col.id}
                  className={`px-1 py-1.5 ${
                    idx === 0 ? 'px-1.5 text-left font-sans' : ''
                  }`}
                  title={col.unit ? `${col.label} (${col.unit})` : col.label}
                >
                  {col.shortLabel ?? col.label}
                </th>
              ))}
              <th className="px-1 py-1.5" aria-label="Delete row" />
            </tr>
          </thead>
          <tbody>
            {observationRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="px-2 py-3 text-center font-sans text-[11px]"
                  style={{ color: 'var(--vml-text-muted)' }}
                >
                  No observations yet. Adjust controls and click Add row.
                </td>
              </tr>
            ) : (
              observationRows.map((row) => {
                const violations = evaluateRowRules(stage, row);
                const isAmber = violations.some((v) => v.amber);
                const highlightedCols = new Set(
                  violations.flatMap((v) => v.highlightColumnIds),
                );
                const rowTooltip = violations.map((v) => v.message).join(' ');

                return (
                  <tr
                    key={row.id}
                    className={isAmber ? 'bg-amber-500/20' : ''}
                    style={{ borderTop: '1px solid var(--vml-border)' }}
                    title={rowTooltip || undefined}
                  >
                    {visibleColumns.map((col, idx) => {
                      const val =
                        col.source.kind === 'derived'
                          ? evaluateColumnValue(
                              col,
                              row.values,
                              stage.physicsParams,
                            )
                          : getRowValue(row, col.id);
                      const isColAmber =
                        isAmber && highlightedCols.has(col.id);
                      return (
                        <td
                          key={col.id}
                          className={`px-1 py-1 ${
                            idx === 0 ? 'px-1.5 text-left font-bold' : ''
                          } ${isColAmber ? 'font-bold text-amber-400' : ''}`}
                        >
                          {formatCellValue(col, val)}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => deleteObservationRow(row.id)}
                        aria-label={`Delete row ${row.sno}`}
                        className="rounded px-1 text-red-400 hover:bg-red-500/20"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Declared prerequisites checklist */}
      {prereqs.length > 0 && (
        <div
          className="space-y-1 rounded-xl p-2.5 text-[11px]"
          style={{ border: '1px solid var(--vml-border)' }}
        >
          <div className="font-semibold">Report prerequisites</div>
          {prereqs.map((p) => (
            <div key={p.id} className={p.met ? 'text-emerald-400' : ''}>
              {p.met ? '✓' : '○'} {p.label}
            </div>
          ))}
        </div>
      )}

      {/* Generic SVG charts */}
      {charts.map((chart) => (
        <ObservationChart
          key={chart.id}
          spec={chart}
          columns={stage.observationTable}
          rows={observationRows}
          params={stage.physicsParams}
        />
      ))}

      {/* Schema-driven student report answers */}
      {experiment.answers.length > 0 && (
        <div
          className="space-y-2.5 rounded-xl p-2.5"
          style={{ border: '1px solid var(--vml-border)' }}
        >
          <div className="font-semibold">Your calculated report</div>

          {experiment.answers.map((ans) => (
            <div key={ans.id} className="space-y-1">
              <label
                htmlFor={`ans-${ans.id}`}
                className="block text-[11px]"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                {ans.label}
              </label>

              {ans.kind === 'choice' ? (
                <select
                  id={`ans-${ans.id}`}
                  value={runAnswerInputs[ans.id] ?? ''}
                  onChange={(e) => setRunAnswerInput(ans.id, e.target.value)}
                  className="w-full rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    border: '1px solid var(--vml-border)',
                    color: 'var(--vml-text)',
                  }}
                >
                  <option value="">Select…</option>
                  {(ans.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`ans-${ans.id}`}
                  type="number"
                  step={ans.step ?? '0.01'}
                  placeholder={ans.placeholder ?? ''}
                  value={runAnswerInputs[ans.id] ?? ''}
                  onChange={(e) => setRunAnswerInput(ans.id, e.target.value)}
                  className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--vml-panel-hover)',
                    border: '1px solid var(--vml-border)',
                    color: 'var(--vml-text)',
                  }}
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={submitRunAnswers}
            className="w-full rounded-lg px-3 py-2 text-xs font-bold"
            style={{
              backgroundColor: 'var(--vml-accent)',
              color: 'var(--vml-accent-text)',
            }}
          >
            Check answers
          </button>
        </div>
      )}

      {/* Run result feedback */}
      {runCheckResult && (
        <div
          className="space-y-2 rounded-xl p-3 text-xs"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: runCheckResult.passed
              ? '1px solid #16a34a'
              : '1px solid #f59e0b',
          }}
        >
          {runCheckResult.passed ? (
            isObserveMode ? (
              <>
                <div className="inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  Pre-wired run passed
                </div>
                <div className="font-bold">{experiment.title}</div>
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--vml-text-muted)' }}
                >
                  Mode: Observe (pre-wired) · Recorded under practised runs.
                </div>
              </>
            ) : (
              <>
                <div className="inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  Run Passed
                </div>
                <div className="font-bold">{experiment.title}</div>
                <dl className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                  <div>
                    <dt style={{ color: 'var(--vml-text-muted)' }}>
                      Wiring attempts
                    </dt>
                    <dd className="font-mono font-bold">
                      {attempts[experiment.id] ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--vml-text-muted)' }}>
                      Run result
                    </dt>
                    <dd className="font-mono font-bold text-emerald-400">
                      Passed
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--vml-text-muted)' }}>Hints used</dt>
                    <dd className="font-mono font-bold">
                      {hintLevel > 0 ? `Yes (${hintLevel})` : 'No'}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--vml-text-muted)' }}>
                      Solution used
                    </dt>
                    <dd className="font-mono font-bold">
                      {usedSolutionInRun ? 'Yes' : 'No'}
                    </dd>
                  </div>
                </dl>
              </>
            )
          ) : (
            <>
              <div className="font-bold text-amber-400">
                Report check needs attention
              </div>
              <ul className="list-disc space-y-1 pl-4 text-[11px]">
                {runCheckResult.failedCriteria.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
              {runCheckResult.hints.length > 0 && (
                <div
                  className="space-y-1 pt-1 text-[11px]"
                  style={{ color: 'var(--vml-text-muted)' }}
                >
                  {runCheckResult.hints.map((h, idx) => (
                    <p key={idx}>• {h}</p>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={clearRunCheckResult}
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--vml-panel)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={clearObservationRows}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-red-400"
                  style={{
                    backgroundColor: 'var(--vml-panel)',
                    border: '1px solid var(--vml-border)',
                  }}
                >
                  Clear rows
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
