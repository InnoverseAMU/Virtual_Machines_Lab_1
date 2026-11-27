import { Html } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { findStageTerminalNetInfo, getStage } from '../core/circuit/stages';
import { getExperiment } from '../core/experiments/registry';
import type { TerminalDef, TerminalId } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useThemeStore } from '../stores/themeStore';
import { useWiringStore } from '../stores/wiringStore';
import { TERMINAL_SELECTED_COLOR } from '../theme/tokens';
import { LabelPlate } from './LabelPlate';
import { useHighlightedNetTerminals } from './NetHighlightContext';

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
  const lastPointerTypeRef = useRef<string>('mouse');

  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const hoveredTerminal = useWiringStore((s) => s.hoveredTerminal);
  const clickTerminal = useWiringStore((s) => s.clickTerminal);
  const setHoveredTerminal = useWiringStore((s) => s.setHoveredTerminal);
  const showTerminalLabels = useSessionStore((s) => s.showTerminalLabels);
  const experimentId = useSessionStore((s) => s.experimentId);
  const currentStageIndex = useSessionStore((s) => s.currentStageIndex);
  const mode = useSessionStore((s) => s.mode);
  const activeProbeLead = useSessionStore((s) => s.activeProbeLead);
  const placeProbeLead = useSessionStore((s) => s.placeProbeLead);
  const highlightedNetPinned = useSessionStore((s) => s.highlightedNetPinned);
  const setHighlightedNetIndex = useSessionStore((s) => s.setHighlightedNetIndex);
  const clearHighlightedNet = useSessionStore((s) => s.clearHighlightedNet);
  const highlightedNetTerminals = useHighlightedNetTerminals();
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const supplyOn = useControlsStore((s) => s.supplyOn);
  const controlValues = useControlsStore((s) => s.values);

  const isLearnMode = mode === 'learn';
  const isObserveMode = mode === 'observe';
  const isSelected = !isLearnMode && !isObserveMode && selectedTerminal === fullId;
  const isProbeA = controlValues['probe.a'] === fullId;
  const isProbeB = controlValues['probe.b'] === fullId;
  const isInspected = hovered || hoveredTerminal === fullId;
  const showTooltip = isInspected || isSelected || isProbeA || isProbeB;
  const [tooltipReady, setTooltipReady] = useState(false);

  // Wait until drei's <Html distanceFactor> applies its initial scale transform
  // before revealing the tooltip so it never flashes at unscaled 1:1 size.
  useEffect(() => {
    if (!showTooltip) {
      setTooltipReady(false);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setTooltipReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [showTooltip]);
  const ringColor = UNIFORM_TERMINAL_COLOR;
  const highlightColor = resolvedTheme === 'dark' ? '#38bdf8' : '#0284c7';

  const currentStage = getStage(getExperiment(experimentId), currentStageIndex);
  const isProbeClickActive = Boolean(currentStage.probeEnabled && activeProbeLead && !isLearnMode);
  const shownLabel = displayLabel ?? terminal.name;
  const observeNetInfo = isObserveMode
    ? findStageTerminalNetInfo(currentStage, fullId)
    : null;

  const isNetHighlighted =
    highlightedNetTerminals !== null && highlightedNetTerminals.has(fullId);
  const isNetDimmed =
    highlightedNetTerminals !== null && !isNetHighlighted;

  return (
    <group position={terminal.localPos}>
      {/* Invisible larger hit sphere for reliable clicks and hover */}
      <mesh
        position={[0, 0, 0.03]}
        onPointerDown={(e) => {
          lastPointerTypeRef.current = e.pointerType;
        }}
        onClick={(e) => {
          e.stopPropagation();
          const isTouch = lastPointerTypeRef.current !== 'mouse';
          if (isLearnMode) {
            if (isTouch) {
              setHoveredTerminal(hoveredTerminal === fullId ? null : fullId);
            }
            return;
          }
          if (isProbeClickActive && activeProbeLead) {
            placeProbeLead(activeProbeLead, fullId);
            if (isTouch) setHoveredTerminal(fullId);
            return;
          }
          if (isObserveMode && isTouch) {
            if (hoveredTerminal === fullId) {
              setHoveredTerminal(null);
              clearHighlightedNet();
            } else {
              setHoveredTerminal(fullId);
              if (observeNetInfo) {
                setHighlightedNetIndex(observeNetInfo.netIndex, true);
              } else {
                clearHighlightedNet();
              }
            }
            return;
          }
          if (isTouch) {
            setHoveredTerminal(fullId);
          }
          clickTerminal(fullId, supplyOn);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (e.pointerType !== 'mouse') return;
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
          if (e.pointerType !== 'mouse') return;
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
                    : isInspected
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
                    : isInspected
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
                  : isInspected
                    ? 0.45
                    : 0
          }
          transparent={isNetDimmed && !isSelected}
          opacity={isNetDimmed && !isSelected ? 0.28 : 1}
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
          transparent={isNetDimmed && !isSelected}
          opacity={isNetDimmed && !isSelected ? 0.3 : 1}
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
      {showTooltip && (
        <Html
          position={[0, 0.24, 0.08]}
          center
          distanceFactor={8}
          wrapperClass="pointer-events-none"
        >
          <div
            className="pointer-events-none mb-2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium shadow-lg"
            style={{
              visibility: tooltipReady ? 'visible' : 'hidden',
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
            {!isObserveMode && isNetHighlighted && highlightedNetTerminals && (
              <div
                className="mt-0.5 text-[10px] font-medium"
                style={{ color: 'var(--vml-accent)' }}
              >
                Common potential ({highlightedNetTerminals.size} terminals)
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
