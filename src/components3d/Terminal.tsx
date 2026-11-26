import { Html } from '@react-three/drei';
import { useState } from 'react';
import { findStageTerminalNetInfo, getStage } from '../core/circuit/stages';
import { getExperiment } from '../core/experiments/registry';
import type { TerminalDef, TerminalId } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';
import { useWiringStore } from '../stores/wiringStore';
import { TERMINAL_SELECTED_COLOR } from '../theme/tokens';
import { LabelPlate } from './LabelPlate';

interface TerminalProps {
  componentId: string;
  componentLabel: string;
  terminal: TerminalDef;
  displayLabel?: string;
}

const UNIFORM_TERMINAL_COLOR = '#334155';

export function Terminal({
  componentId,
  componentLabel,
  terminal,
  displayLabel,
}: TerminalProps) {
  const fullId: TerminalId = `${componentId}.${terminal.name}`;
  const [hovered, setHovered] = useState(false);

  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clickTerminal = useWiringStore((s) => s.clickTerminal);
  const setHoveredTerminal = useWiringStore((s) => s.setHoveredTerminal);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const experimentId = useSessionStore((s) => s.experimentId);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const mode = useSessionStore((s) => s.mode);
  const activeProbeLead = useSessionStore((s) => s.activeProbeLead);
  const placeProbeLead = useSessionStore((s) => s.placeProbeLead);
  const highlightedNetIndex = useSessionStore((s) => s.highlightedNetIndex);
  const highlightedNetPinned = useSessionStore((s) => s.highlightedNetPinned);
  const setHighlightedNetIndex = useSessionStore((s) => s.setHighlightedNetIndex);
  const clearHighlightedNet = useSessionStore((s) => s.clearHighlightedNet);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const supplyOn = useControlsStore((s) => s.supplyOn);
  const controlValues = useControlsStore((s) => s.values);

  const isLearnMode = mode === 'learn';
  const isObserveMode = mode === 'observe';
  const isSelected = !isLearnMode && !isObserveMode && selectedTerminal === fullId;
  const isProbeA = controlValues['probe.a'] === fullId;
  const isProbeB = controlValues['probe.b'] === fullId;
  const ringColor = UNIFORM_TERMINAL_COLOR;
  const highlightColor = resolvedTheme === 'dark' ? '#38bdf8' : '#0284c7';

  const currentStage = getStage(getExperiment(experimentId), currentStageIndex);
  const isProbeClickActive = Boolean(currentStage.probeEnabled && activeProbeLead && !isLearnMode);
  const shownLabel = displayLabel ?? terminal.name;
  const observeNetInfo = isObserveMode
    ? findStageTerminalNetInfo(currentStage, fullId)
    : null;

  let isNetHighlighted = false;
  let isNetDimmed = false;
  if (isObserveMode && highlightedNetIndex !== null) {
    const net = currentStage.acceptedNetlists[0]?.[highlightedNetIndex];
    if (net) {
      isNetHighlighted = net.includes(fullId);
      isNetDimmed = !isNetHighlighted;
    }
  }

  return (
    <group position={terminal.localPos}>
      {/* Invisible larger hit sphere for reliable clicks and hover */}
      <mesh
        position={[0, 0, 0.03]}
        onClick={(e) => {
          e.stopPropagation();
          if (isLearnMode) return;
          if (isProbeClickActive && activeProbeLead) {
            placeProbeLead(activeProbeLead, fullId);
            return;
          }
          clickTerminal(fullId, supplyOn);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          setHoveredTerminal(fullId);
          if (isObserveMode && observeNetInfo && !highlightedNetPinned) {
            setHighlightedNetIndex(observeNetInfo.netIndex, false);
          }
          document.body.style.cursor = isProbeClickActive
            ? 'crosshair'
            : isLearnMode || isObserveMode
              ? 'default'
              : 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          setHoveredTerminal(null);
          if (isObserveMode && !highlightedNetPinned) {
            clearHighlightedNet();
          }
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Insulated collar */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.015]} castShadow>
        <cylinderGeometry args={[0.046, 0.052, 0.04, 18]} />
        <meshStandardMaterial
          color={
            isProbeA
              ? '#ef4444'
              : isProbeB
                ? '#38bdf8'
                : isNetHighlighted
                  ? highlightColor
                  : isSelected
                    ? TERMINAL_SELECTED_COLOR
                    : hovered
                      ? '#f59e0b'
                      : ringColor
          }
          emissive={
            isProbeA
              ? '#ef4444'
              : isProbeB
                ? '#38bdf8'
                : isNetHighlighted
                  ? highlightColor
                  : isSelected
                    ? TERMINAL_SELECTED_COLOR
                    : hovered
                      ? '#b45309'
                      : '#000000'
          }
          emissiveIntensity={
            isProbeA || isProbeB
              ? 0.85
              : isNetHighlighted
                ? 0.8
                : isSelected
                  ? 0.7
                  : hovered
                    ? 0.45
                    : 0
          }
          transparent={isNetDimmed}
          opacity={isNetDimmed ? 0.28 : 1}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>

      {/* Brass binding stud */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.045]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.045, 16]} />
        <meshStandardMaterial
          color={
            isNetHighlighted
              ? highlightColor
              : isSelected
                ? '#38bdf8'
                : '#fbbf24'
          }
          transparent={isNetDimmed}
          opacity={isNetDimmed ? 0.3 : 1}
          metalness={0.75}
          roughness={0.25}
        />
      </mesh>

      {/* Optional printed terminal tag directly below post (key L) */}
      {(showTerminalLabels || Boolean(displayLabel && displayLabel !== terminal.name)) && (
        <LabelPlate
          text={shownLabel}
          width={displayLabel && displayLabel !== terminal.name ? 0.28 : 0.18}
          height={0.085}
          fontSize={displayLabel && displayLabel !== terminal.name ? 28 : 36}
          bg="#0f172a"
          fg={displayLabel && displayLabel !== terminal.name ? '#fde68a' : '#f8fafc'}
          border={isProbeA ? '#ef4444' : isProbeB ? '#38bdf8' : '#334155'}
          position={[0, -0.075, 0.012]}
        />
      )}

      {/* Hover / selected tooltip */}
      {(hovered || isSelected || isProbeA || isProbeB) && (
        <Html position={[0, 0.14, 0.06]} center distanceFactor={8}>
          <div
            className="pointer-events-none whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium shadow-lg"
            style={{
              backgroundColor: 'var(--vml-tooltip-bg)',
              color: 'var(--vml-tooltip-text)',
              border: '1px solid var(--vml-tooltip-border)',
            }}
          >
            <span style={{ color: 'var(--vml-accent)', fontWeight: 600 }}>
              {componentLabel}
            </span>
            <span className="mx-1 opacity-50">·</span>
            <span>{displayLabel ? `${terminal.label} (${displayLabel})` : terminal.label}</span>
            {isProbeA && (
              <div className="mt-0.5 text-[10px] font-bold text-rose-400">
                Red Probe (+) Lead A attached
              </div>
            )}
            {isProbeB && (
              <div className="mt-0.5 text-[10px] font-bold text-sky-400">
                Black Probe (-) Lead B attached
              </div>
            )}
            {isObserveMode && (
              <div
                className="mt-0.5 text-[10px] font-medium"
                style={{ color: 'var(--vml-text-muted)' }}
              >
                {observeNetInfo
                  ? observeNetInfo.label
                  : 'Open / unconnected in this stage'}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
