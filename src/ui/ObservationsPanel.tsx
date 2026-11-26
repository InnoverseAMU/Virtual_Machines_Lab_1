import { useState } from 'react';
import { getStage } from '../core/circuit/stages';
import { isSupplySwitchOn } from '../core/physics/evaluate';
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
  const [subView, setSubView] = useState<'table' | 'report'>('table');

  const mode = useSessionStore((s) => s.mode);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const observationRows = useSessionStore((s) => s.observationRows);
  const observationRowsByStage = useSessionStore(
    (s) => s.observationRowsByStage,
  );
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
  const isLearnMode = mode === 'learn';
  const hasMultipleStages = experiment.stages.length > 1;
  const stage = getStage(experiment, currentStageIndex);
  const supplyOn = isSupplySwitchOn(controls);
  const canAddRow =
    supplyOn && energised && observationRows.length < MAX_OBSERVATION_ROWS;

  const visibleColumns = stage.observationTable.filter((c) => !c.hidden);
  const prereqs = evaluateStagePrerequisites(stage, observationRows);
  const stageCharts = stage.charts ?? [];
  const reportCharts = experiment.charts ?? [];

  const allStagePrereqs = experiment.stages.map((st) => ({
    stage: st,
    items: evaluateStagePrerequisites(st, observationRowsByStage[st.id] ?? []),
  }));
  const allPrereqsMet = allStagePrereqs.every((s) =>
    s.items.every((p) => p.met),
  );

  const showTableSection = !hasMultipleStages || subView === 'table';
  const showReportSection = !hasMultipleStages || subView === 'report';

  return (
    <div className="space-y-3 text-xs">
      {hasMultipleStages && (
        <div
          className="grid grid-cols-2 gap-1 rounded-xl p-1"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: '1px solid var(--vml-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setSubView('table')}
            className="rounded-lg py-1 text-[11px] font-semibold transition"
            style={{
              backgroundColor:
                subView === 'table' ? 'var(--vml-accent)' : 'transparent',
              color:
                subView === 'table'
                  ? 'var(--vml-accent-text)'
                  : 'var(--vml-text)',
            }}
          >
            Stage {currentStageIndex + 1} Rows ({observationRows.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('report')}
            className="rounded-lg py-1 text-[11px] font-semibold transition"
            style={{
              backgroundColor:
                subView === 'report' ? 'var(--vml-accent)' : 'transparent',
              color:
                subView === 'report'
                  ? 'var(--vml-accent-text)'
                  : 'var(--vml-text)',
            }}
          >
            Report {allPrereqsMet ? '✓' : ''}
          </button>
        </div>
      )}

      {showTableSection && (
        <>
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

          {/* Stage prerequisites checklist */}
          {prereqs.length > 0 && (
            <div
              className="space-y-1 rounded-xl p-2.5 text-[11px]"
              style={{ border: '1px solid var(--vml-border)' }}
            >
              <div className="font-semibold">
                {hasMultipleStages
                  ? `${stage.title} prerequisites`
                  : 'Report prerequisites'}
              </div>
              {prereqs.map((p) => (
                <div key={p.id} className={p.met ? 'text-emerald-400' : ''}>
                  {p.met ? '✓' : '○'} {p.label}
                </div>
              ))}
            </div>
          )}

          {/* Stage-level charts */}
          {stageCharts.map((chart) => (
            <ObservationChart
              key={chart.id}
              spec={chart}
              columns={stage.observationTable}
              rows={observationRows}
              params={stage.physicsParams}
            />
          ))}
        </>
      )}

      {showReportSection && (
        <>
          {hasMultipleStages && (
            <div
              className="space-y-1.5 rounded-xl p-2.5 text-[11px]"
              style={{ border: '1px solid var(--vml-border)' }}
            >
              <div className="font-semibold">Report prerequisites</div>
              {allStagePrereqs.map(({ stage: st, items }) => (
                <div key={st.id} className="space-y-0.5">
                  <div
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: 'var(--vml-text-muted)' }}
                  >
                    {st.title}
                  </div>
                  {items.map((p) => (
                    <div key={p.id} className={p.met ? 'text-emerald-400' : ''}>
                      {p.met ? '✓' : '○'} {p.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Experiment-level report charts */}
          {reportCharts.map((chart) => (
            <ObservationChart
              key={chart.id}
              spec={chart}
              columns={stage.observationTable}
              rows={observationRows}
              params={stage.physicsParams}
            />
          ))}

          {experiment.phasorReport && (
            <div
              className="space-y-2 rounded-xl p-2.5"
              style={{ border: '1px solid var(--vml-border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Phasor Vector Diagrams</span>
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--vml-text-muted)' }}
                >
                  Reference (not graded)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                {experiment.phasorReport === 'transformations' ? (
                  <>
                    <div
                      className="rounded-lg p-1.5"
                      style={{ backgroundColor: 'var(--vml-panel-hover)' }}
                    >
                      <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20">
                        <line x1="25" y1="75" x2="60" y2="75" stroke="#ef4444" strokeWidth="2" />
                        <line x1="60" y1="75" x2="43" y2="45" stroke="#eab308" strokeWidth="2" />
                        <line x1="43" y1="45" x2="78" y2="45" stroke="#3b82f6" strokeWidth="2" />
                        <line x1="25" y1="75" x2="78" y2="45" stroke="#38bdf8" strokeDasharray="3 2" strokeWidth="1.8" />
                      </svg>
                      <div className="font-semibold">3φ → 1φ</div>
                      <div style={{ color: 'var(--vml-text-muted)' }}>Va1c1 = 2·Vp</div>
                    </div>
                    <div
                      className="rounded-lg p-1.5"
                      style={{ backgroundColor: 'var(--vml-panel-hover)' }}
                    >
                      <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20">
                        <line x1="50" y1="50" x2="84" y2="50" stroke="#ef4444" strokeWidth="1.8" />
                        <line x1="50" y1="50" x2="67" y2="21" stroke="#eab308" strokeWidth="1.8" />
                        <line x1="50" y1="50" x2="33" y2="21" stroke="#3b82f6" strokeWidth="1.8" />
                        <line x1="50" y1="50" x2="16" y2="50" stroke="#f97316" strokeWidth="1.8" />
                        <line x1="50" y1="50" x2="33" y2="79" stroke="#22c55e" strokeWidth="1.8" />
                        <line x1="50" y1="50" x2="67" y2="79" stroke="#a855f7" strokeWidth="1.8" />
                        <polygon points="84,50 67,21 33,21 16,50 33,79 67,79" fill="none" stroke="#94a3b8" strokeDasharray="3 2" strokeWidth="1" />
                      </svg>
                      <div className="font-semibold">3φ → 6φ</div>
                      <div style={{ color: 'var(--vml-text-muted)' }}>60° Double-Star</div>
                    </div>
                    <div
                      className="rounded-lg p-1.5"
                      style={{ backgroundColor: 'var(--vml-panel-hover)' }}
                    >
                      <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20">
                        <line x1="25" y1="78" x2="75" y2="78" stroke="#ef4444" strokeWidth="2.2" />
                        <line x1="50" y1="78" x2="50" y2="28" stroke="#3b82f6" strokeWidth="2.2" />
                        <line x1="25" y1="78" x2="50" y2="28" stroke="#94a3b8" strokeDasharray="3 2" strokeWidth="1.4" />
                        <rect x="50" y="70" width="8" height="8" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                      </svg>
                      <div className="font-semibold">Scott (2φ)</div>
                      <div style={{ color: 'var(--vml-text-muted)' }}>90° · √2·V2</div>
                    </div>
                  </>
                ) : (
                  <>
                <div
                  className="rounded-lg p-1.5"
                  style={{ backgroundColor: 'var(--vml-panel-hover)' }}
                >
                  <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20">
                    <line x1="50" y1="50" x2="88" y2="50" stroke="#ef4444" strokeWidth="2.2" />
                    <line x1="50" y1="50" x2="31" y2="83" stroke="#eab308" strokeWidth="2.2" />
                    <line x1="50" y1="50" x2="31" y2="17" stroke="#3b82f6" strokeWidth="2.2" />
                    <polygon points="88,50 31,83 31,17" fill="none" stroke="#94a3b8" strokeDasharray="3 2" strokeWidth="1" />
                    <text x="50" y="45" fill="#94a3b8" fontSize="8" textAnchor="middle">N</text>
                  </svg>
                  <div className="font-semibold">Star (Y)</div>
                  <div style={{ color: 'var(--vml-text-muted)' }}>VL = √3·Vp</div>
                </div>
                <div
                  className="rounded-lg p-1.5"
                  style={{ backgroundColor: 'var(--vml-panel-hover)' }}
                >
                  <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20">
                    <line x1="20" y1="78" x2="80" y2="78" stroke="#ef4444" strokeWidth="2.2" />
                    <line x1="80" y1="78" x2="50" y2="26" stroke="#eab308" strokeWidth="2.2" />
                    <line x1="50" y1="26" x2="20" y2="78" stroke="#3b82f6" strokeWidth="2.2" />
                  </svg>
                  <div className="font-semibold">Delta (Δ)</div>
                  <div style={{ color: 'var(--vml-text-muted)' }}>VL = Vp</div>
                </div>
                <div
                  className="rounded-lg p-1.5"
                  style={{ backgroundColor: 'var(--vml-panel-hover)' }}
                >
                  <svg viewBox="0 0 100 100" className="mx-auto h-20 w-20">
                    <polyline points="50,50 70,50 82,30" fill="none" stroke="#ef4444" strokeWidth="2" />
                    <polyline points="50,50 40,67 57,82" fill="none" stroke="#eab308" strokeWidth="2" />
                    <polyline points="50,50 40,33 20,40" fill="none" stroke="#3b82f6" strokeWidth="2" />
                    <line x1="50" y1="50" x2="82" y2="30" stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1" />
                    <line x1="50" y1="50" x2="57" y2="82" stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1" />
                    <line x1="50" y1="50" x2="20" y2="40" stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1" />
                  </svg>
                  <div className="font-semibold">Zig-Zag</div>
                  <div style={{ color: 'var(--vml-text-muted)' }}>VL = 1.5·Vp</div>
                </div>
                  </>
                )}
              </div>
            </div>
          )}

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
                ) : isLearnMode ? (
                  <>
                    <div className="inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      Learn practice passed
                    </div>
                    <div className="font-bold">{experiment.title}</div>
                    <div
                      className="text-[11px]"
                      style={{ color: 'var(--vml-text-muted)' }}
                    >
                      Mode: Learn (guided) · Complete Self mode to earn a Run
                      Passed badge.
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
                        <dt style={{ color: 'var(--vml-text-muted)' }}>
                          Hints used
                        </dt>
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
        </>
      )}
    </div>
  );
}
