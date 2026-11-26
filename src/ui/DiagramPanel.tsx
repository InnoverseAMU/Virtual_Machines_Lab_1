import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolvePublicAssetUrl,
  type DiagramAsset,
} from '../core/experiments/assets';

interface DiagramPanelProps {
  open: boolean;
  experimentId: string;
  experimentTitle: string;
  diagrams: DiagramAsset[];
  onClose: () => void;
}

interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Remembered position and size for the browser session
let sessionDesktopRect: FloatingRect = {
  x: 24,
  y: 72,
  width: 460,
  height: 430,
};

function clampDesktopRect(rect: FloatingRect): FloatingRect {
  if (typeof window === 'undefined') return rect;
  const maxW = Math.max(320, window.innerWidth - 32);
  const maxH = Math.max(260, window.innerHeight - 32);
  const width = Math.max(320, Math.min(maxW, rect.width));
  const height = Math.max(260, Math.min(maxH, rect.height));
  const x = Math.max(12, Math.min(window.innerWidth - width - 12, rect.x));
  const y = Math.max(12, Math.min(window.innerHeight - height - 12, rect.y));
  return { x, y, width, height };
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

function clampScale(next: number): number {
  return Math.max(1, Math.min(5, next));
}

export function DiagramPanel({
  open,
  experimentId,
  experimentTitle,
  diagrams,
  onClose,
}: DiagramPanelProps) {
  const isDesktop = useIsDesktop();
  const [activeIndex, setActiveIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [failedSrcs, setFailedSrcs] = useState<Record<string, boolean>>({});
  const [mobileCollapsed, setMobileCollapsed] = useState(false);
  const [desktopRect, setDesktopRect] = useState<FloatingRect>(() =>
    clampDesktopRect(sessionDesktopRect),
  );

  // Reset slide & failure map when experiment changes
  useEffect(() => {
    setActiveIndex(0);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setFailedSrcs({});
  }, [experimentId]);

  // Reset zoom/pan cleanly when navigating between figures
  const resetZoomPan = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetZoomPan();
  }, [activeIndex, resetZoomPan]);

  // Close with Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Keep desktop floating rect clamped on viewport resize
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onResize = () => {
      setDesktopRect((prev) => {
        const clamped = clampDesktopRect(prev);
        sessionDesktopRect = clamped;
        return clamped;
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, isDesktop]);

  // Dragging & resizing state (desktop floating window)
  const updateRect = useCallback((next: FloatingRect) => {
    const clamped = clampDesktopRect(next);
    sessionDesktopRect = clamped;
    setDesktopRect(clamped);
  }, []);

  const startDesktopDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = desktopRect;

    const onMove = (ev: PointerEvent) => {
      updateRect({
        ...orig,
        x: orig.x + (ev.clientX - startX),
        y: orig.y + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startDesktopResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = desktopRect;

    const onMove = (ev: PointerEvent) => {
      updateRect({
        ...orig,
        width: orig.width + (ev.clientX - startX),
        height: orig.height + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Pointer-based zoom & pan inside the diagram viewport (no external libs)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const mobileSheetDragY = useRef<number | null>(null);

  const toggleFitOr2x = useCallback(() => {
    if (scaleRef.current > 1.05) {
      resetZoomPan();
    } else {
      setScale(2);
      setPan({ x: 0, y: 0 });
    }
  }, [resetZoomPan]);

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (e.pointerType === 'touch' && pointersRef.current.size === 1) {
      const now = Date.now();
      const prevTap = lastTapRef.current;
      if (
        prevTap &&
        now - prevTap.time < 320 &&
        Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 28
      ) {
        lastTapRef.current = null;
        toggleFitOr2x();
      } else {
        lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
      }
    }
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    if (!prev) return;

    if (pointers.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setPan((p) => {
        const limit = scaleRef.current * 280 + 80;
        return {
          x: Math.max(-limit, Math.min(limit, p.x + dx)),
          y: Math.max(-limit, Math.min(limit, p.y + dy)),
        };
      });
      return;
    }

    if (pointers.size === 2) {
      const entries = [...pointers.entries()];
      const otherEntry = entries.find(([id]) => id !== e.pointerId);
      if (!otherEntry) return;
      const other = otherEntry[1];

      const oldDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const oldMidX = (prev.x + other.x) * 0.5;
      const oldMidY = (prev.y + other.y) * 0.5;

      const nextPoint = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, nextPoint);

      const newDist = Math.hypot(nextPoint.x - other.x, nextPoint.y - other.y);
      const newMidX = (nextPoint.x + other.x) * 0.5;
      const newMidY = (nextPoint.y + other.y) * 0.5;

      if (oldDist > 4) {
        const factor = newDist / oldDist;
        const nextScale = clampScale(scaleRef.current * factor);
        setScale(nextScale);
        if (nextScale <= 1.02) {
          setPan({ x: 0, y: 0 });
        } else {
          setPan((p) => ({
            x: p.x + (newMidX - oldMidX),
            y: p.y + (newMidY - oldMidY),
          }));
        }
      }
    }
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextScale = clampScale(scale * factor);
    setScale(nextScale);
    if (nextScale <= 1.02) {
      setPan({ x: 0, y: 0 });
    }
  };

  if (!open || diagrams.length === 0) return null;

  const safeIndex = Math.min(activeIndex, diagrams.length - 1);
  const current = diagrams[safeIndex];
  const imgUrl = resolvePublicAssetUrl(current.src, import.meta.env.BASE_URL);
  const hasFailed = Boolean(failedSrcs[current.src]);

  const zoomOut = () => {
    const next = clampScale(scale / 1.25);
    setScale(next);
    if (next <= 1.02) setPan({ x: 0, y: 0 });
  };
  const zoomIn = () => setScale(clampScale(scale * 1.25));

  const toolbarContent = (
    <div
      className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 text-xs"
      style={{ borderBottom: '1px solid var(--vml-border)' }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
          disabled={scale <= 1.01}
          className="h-7 w-7 rounded-md font-bold disabled:opacity-40"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: '1px solid var(--vml-border)',
          }}
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoomPan}
          aria-label="Reset zoom to fit"
          className="h-7 rounded-md px-2 font-mono text-[11px] font-semibold"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: '1px solid var(--vml-border)',
          }}
        >
          Fit ({Math.round(scale * 100)}%)
        </button>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
          disabled={scale >= 4.99}
          className="h-7 w-7 rounded-md font-bold disabled:opacity-40"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: '1px solid var(--vml-border)',
          }}
        >
          +
        </button>
      </div>

      {diagrams.length > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setActiveIndex((i) => (i - 1 + diagrams.length) % diagrams.length)
            }
            aria-label="Previous diagram"
            className="h-7 rounded-md px-2 font-semibold"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
            }}
          >
            ‹ Prev
          </button>
          <span
            className="px-1.5 font-mono text-[11px] font-semibold tabular-nums"
            style={{ color: 'var(--vml-text-muted)' }}
          >
            {safeIndex + 1} of {diagrams.length}
          </span>
          <button
            type="button"
            onClick={() => setActiveIndex((i) => (i + 1) % diagrams.length)}
            aria-label="Next diagram"
            className="h-7 rounded-md px-2 font-semibold"
            style={{
              backgroundColor: 'var(--vml-panel-hover)',
              border: '1px solid var(--vml-border)',
            }}
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );

  const viewerContent = (
    <>
      {toolbarContent}
      <div
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onWheel={handleWheel}
        onDoubleClick={toggleFitOr2x}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2.5"
        style={{ touchAction: 'none' }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-white p-2 shadow-inner">
          {hasFailed ? (
            <div className="px-4 text-center text-xs font-medium text-slate-700">
              Diagram could not be loaded
            </div>
          ) : (
            <img
              key={current.src}
              src={imgUrl}
              alt={current.alt}
              loading="lazy"
              draggable={false}
              onError={() =>
                setFailedSrcs((prev) => ({ ...prev, [current.src]: true }))
              }
              className="max-h-full max-w-full object-contain select-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transformOrigin: 'center center',
              }}
            />
          )}
        </div>
      </div>
      <div
        className="shrink-0 px-3.5 py-2 text-xs leading-snug"
        style={{
          borderTop: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
        }}
      >
        {current.caption}
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <section
        aria-label={`Circuit diagram: ${experimentTitle}`}
        className="pointer-events-auto fixed z-30 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{
          left: desktopRect.x,
          top: desktopRect.y,
          width: desktopRect.width,
          height: desktopRect.height,
          backgroundColor: 'var(--vml-panel)',
          border: '1px solid var(--vml-border)',
          color: 'var(--vml-text)',
        }}
      >
        <div
          onPointerDown={startDesktopDrag}
          className="flex shrink-0 cursor-move items-center justify-between gap-2 px-3.5 py-2 select-none"
          style={{
            borderBottom: '1px solid var(--vml-border)',
            backgroundColor: 'var(--vml-panel-hover)',
          }}
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-bold">Circuit diagram</div>
            <div
              className="truncate text-[10px]"
              style={{ color: 'var(--vml-text-muted)' }}
            >
              Drag bar to move · Wheel/double-click to zoom
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close circuit diagram"
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--vml-panel)',
              border: '1px solid var(--vml-border)',
            }}
          >
            Close
          </button>
        </div>

        {viewerContent}

        <div
          onPointerDown={startDesktopResize}
          role="presentation"
          title="Drag to resize"
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 50%, var(--vml-text-muted) 50%)',
            opacity: 0.55,
          }}
        />
      </section>
    );
  }

  // Phone (<768 px): collapsible bottom sheet with drag/tap handle
  return (
    <section
      aria-label={`Circuit diagram: ${experimentTitle}`}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl shadow-2xl backdrop-blur"
      style={{
        backgroundColor: 'var(--vml-panel)',
        borderTop: '1px solid var(--vml-border)',
        color: 'var(--vml-text)',
      }}
    >
      <div
        className="cursor-grab px-3 pt-2 pb-2 active:cursor-grabbing"
        style={{
          touchAction: 'none',
          borderBottom: mobileCollapsed
            ? 'none'
            : '1px solid var(--vml-border)',
        }}
        onPointerDown={(e) => {
          mobileSheetDragY.current = e.clientY;
        }}
        onPointerUp={(e) => {
          if (mobileSheetDragY.current === null) return;
          const dy = mobileSheetDragY.current - e.clientY;
          mobileSheetDragY.current = null;
          if (Math.abs(dy) < 8) {
            setMobileCollapsed((c) => !c);
          } else if (dy > 20) {
            setMobileCollapsed(false);
          } else if (dy < -20) {
            setMobileCollapsed(true);
          }
        }}
      >
        <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-slate-400/60" />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate font-bold">
            Diagram{diagrams.length > 1 ? ` (${safeIndex + 1}/${diagrams.length})` : ''}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => setMobileCollapsed((c) => !c)}
              aria-expanded={!mobileCollapsed}
              className="rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              {mobileCollapsed ? 'Expand' : 'Collapse'}
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={onClose}
              aria-label="Close circuit diagram"
              className="rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: 'var(--vml-panel-hover)',
                border: '1px solid var(--vml-border)',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {!mobileCollapsed && (
        <div className="flex h-[52vh] flex-col overflow-hidden">
          {viewerContent}
        </div>
      )}
    </section>
  );
}
