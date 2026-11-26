import {
  computeRowEfficiency,
  evaluateRunPrerequisites,
  MAX_OBSERVATION_ROWS,
} from '../core/physics/report';
import type {
  ExperimentDef,
  TransformerLoadControls,
  TransformerLoadOutput,
} from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { EfficiencyChart } from './EfficiencyChart';

interface ObservationsPanelProps {
  experiment: ExperimentDef;
  output: TransformerLoadOutput;
  controls: TransformerLoadControls;
  primaryEnergised: boolean;
}

export function ObservationsPanel({
  experiment,
  output,
  controls,
  primaryEnergised,
}: ObservationsPanelProps) {
  const mode = useSessionStore((s) => s.mode);
  const observationRows = useSessionStore((s) => s.observationRows);
  const runRegulationInput = useSessionStore((s) => s.runRegulationInput);
  const runMaxEffLoadInput = useSessionStore((s) => s.runMaxEffLoadInput);
  const runCheckResult = useSessionStore((s) => s.runCheckResult);
  const attempts = useSessionStore((s) => s.attempts);
  const hintLevel = useSessionStore((s) => s.hintLevel);
  const usedSolutionInRun = useSessionStore((s) => s.usedSolutionInRun);

  const isObserveMode = mode === 'observe';
  const showNumericReadouts = useSessionStore((s) => s.showNumericReadouts);

  const addObservationRow = useSessionStore((s) => s.addObservationRow);
  const deleteObservationRow = useSessionStore((s) => s.deleteObservationRow);
  const clearObservationRows = useSessionStore((s) => s.clearObservationRows);
  const setRunRegulationInput = useSessionStore((s) => s.setRunRegulationInput);
  const setRunMaxEffLoadInput = useSessionStore((s) => s.setRunMaxEffLoadInput);
  const submitRunAnswers = useSessionStore((s) => s.submitRunAnswers);
  const clearRunCheckResult = useSessionStore((s) => s.clearRunCheckResult);

  const canAddRow =
    controls.supplyOn &&
    primaryEnergised &&
    observationRows.length < MAX_OBSERVATION_ROWS;

  const prereqs = evaluateRunPrerequisites(observationRows);
  const { vp, vs, am, wm } = output.meters;

  const v1Live = vp.damaged ? '0.0' : vp.shownValue.toFixed(1);
  const v2Live = vs.damaged ? '0.0' : vs.shownValue.toFixed(1);
  const i2Live = am.damaged ? '0.00' : am.shownValue.toFixed(2);
  const p1Live = wm.damaged ? '0.0' : (wm.dial * wm.mf).toFixed(1);

  return (
    <div className="space-y-3 text-xs">
      {/* Compact live reading strip */}
      <div
        className="grid grid-cols-4 gap-1 rounded-xl px-2 py-1.5 text-center font-mono text-[11px] tabular-nums"
        style={{
          backgroundColor: 'var(--vml-panel-hover)',
          border: '1px solid var(--vml-border)',
        }}
      >
        <div>
          <div className="text-[9px]" style={{ color: 'var(--vml-text-muted)' }}>
            V1
          </div>
          <div className="font-bold">
            {showNumericReadouts ? `${v1Live}V` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px]" style={{ color: 'var(--vml-text-muted)' }}>
            V2
          </div>
          <div className="font-bold">
            {showNumericReadouts ? `${v2Live}V` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px]" style={{ color: 'var(--vml-text-muted)' }}>
            I2
          </div>
          <div className="font-bold">
            {showNumericReadouts ? `${i2Live}A` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px]" style={{ color: 'var(--vml-text-muted)' }}>
            P1
          </div>
          <div className="font-bold" style={{ color: 'var(--vml-accent)' }}>
            {showNumericReadouts ? `${p1Live}W` : '—'}
          </div>
        </div>
      </div>

      {/* Add row & Clear actions */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canAddRow}
          onClick={() => addObservationRow(output, controls, primaryEnergised)}
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

      {!controls.supplyOn || !primaryEnergised ? (
        <p className="text-[11px]" style={{ color: 'var(--vml-text-muted)' }}>
          Energise the primary circuit (Supply ON) to capture observation rows.
        </p>
      ) : null}

      {/* Read-only observation table */}
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
              <th className="px-1.5 py-1.5 text-left font-sans">#</th>
              <th className="px-1 py-1.5">V1</th>
              <th className="px-1 py-1.5">I2</th>
              <th className="px-1 py-1.5">V2</th>
              <th className="px-1 py-1.5">Dial</th>
              <th className="px-1 py-1.5">MF</th>
              <th className="px-1 py-1.5">P1</th>
              <th className="px-1 py-1.5">η%</th>
              <th className="px-1 py-1.5" aria-label="Delete row" />
            </tr>
          </thead>
          <tbody>
            {observationRows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-2 py-3 text-center font-sans text-[11px]"
                  style={{ color: 'var(--vml-text-muted)' }}
                >
                  No observations yet. Hold V1 = 230 V and click Add row.
                </td>
              </tr>
            ) : (
              observationRows.map((row) => {
                const eff = computeRowEfficiency(row);
                return (
                  <tr
                    key={row.id}
                    className={row.v1OutOfRange ? 'bg-amber-500/20' : ''}
                    style={{ borderTop: '1px solid var(--vml-border)' }}
                    title={
                      row.v1OutOfRange
                        ? 'V1 was outside 230 ± 2 V when recorded'
                        : undefined
                    }
                  >
                    <td className="px-1.5 py-1 text-left font-bold">
                      {row.sno}
                    </td>
                    <td
                      className={`px-1 py-1 ${
                        row.v1OutOfRange ? 'font-bold text-amber-400' : ''
                      }`}
                    >
                      {row.v1.toFixed(1)}
                    </td>
                    <td className="px-1 py-1">{row.i2.toFixed(2)}</td>
                    <td className="px-1 py-1">{row.v2.toFixed(1)}</td>
                    <td className="px-1 py-1">{row.dial.toFixed(1)}</td>
                    <td className="px-1 py-1">{row.mf.toFixed(1)}</td>
                    <td className="px-1 py-1">{row.p1.toFixed(0)}</td>
                    <td className="px-1 py-1">
                      {row.i2 > 0 ? eff.toFixed(1) : '—'}
                    </td>
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

      {/* Prerequisites checklist */}
      <div
        className="space-y-1 rounded-xl p-2.5 text-[11px]"
        style={{ border: '1px solid var(--vml-border)' }}
      >
        <div className="font-semibold">Report prerequisites</div>
        <div className={prereqs.hasNoLoadRow ? 'text-emerald-400' : ''}>
          {prereqs.hasNoLoadRow ? '✓' : '○'} No-load row (I2 = 0 A)
        </div>
        <div className={prereqs.hasRatedRow ? 'text-emerald-400' : ''}>
          {prereqs.hasRatedRow ? '✓' : '○'} Near-rated row (I2 between 15 and 19 A)
        </div>
        <div className={prereqs.hasMinRows ? 'text-emerald-400' : ''}>
          {prereqs.hasMinRows ? '✓' : '○'} At least 6 rows ({prereqs.rowCount}/6)
        </div>
      </div>

      {/* SVG Efficiency vs Load VA chart */}
      <EfficiencyChart rows={observationRows} />

      {/* Student report answers */}
      <div
        className="space-y-2.5 rounded-xl p-2.5"
        style={{ border: '1px solid var(--vml-border)' }}
      >
        <div className="font-semibold">Your calculated report</div>

        <div className="space-y-1">
          <label
            htmlFor="ans-reg"
            className="block text-[11px]"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            Voltage regulation (%)
          </label>
          <input
            id="ans-reg"
            type="number"
            step="0.01"
            placeholder="e.g. 2.32"
            value={runRegulationInput}
            onChange={(e) => setRunRegulationInput(e.target.value)}
            className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="ans-maxeff"
            className="block text-[11px]"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            Load at max efficiency (% of rated 2 kVA)
          </label>
          <input
            id="ans-maxeff"
            type="number"
            step="0.1"
            placeholder="e.g. 66"
            value={runMaxEffLoadInput}
            onChange={(e) => setRunMaxEffLoadInput(e.target.value)}
            className="w-full rounded-lg px-2.5 py-1.5 font-mono text-xs"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
              color: 'var(--vml-text)',
            }}
          />
        </div>

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
