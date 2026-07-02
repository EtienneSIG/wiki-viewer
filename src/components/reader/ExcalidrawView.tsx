import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';

/**
 * Minimal Excalidraw element shape. We only read the fields the renderer needs;
 * unknown fields are ignored. Everything is optional/defensive because the JSON
 * comes from disk and may be partial.
 */
interface ExElement {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  opacity?: number;
  roundness?: { type?: number } | null;
  points?: Array<[number, number]>;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  isDeleted?: boolean;
  id?: string;
}

interface ExScene {
  elements?: ExElement[];
  appState?: { viewBackgroundColor?: string };
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExcalidrawViewProps {
  /** Raw `.excalidraw` JSON (the file body). */
  source: string;
}

const FONT_FAMILY: Record<number, string> = {
  1: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  2: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  3: '"Cascadia Code", "Consolas", ui-monospace, monospace',
};

function fontFor(f?: number): string {
  return FONT_FAMILY[f ?? 1] ?? FONT_FAMILY[1];
}

function fillFor(el: ExElement): string {
  const bg = el.backgroundColor;
  if (!bg || bg === 'transparent') return 'none';
  return bg;
}

function fillOpacityFor(el: ExElement): number {
  // Approximate Excalidraw's hachure/cross-hatch look with a lighter solid fill
  // so container overlaps stay legible. Solid fills render at full strength.
  if (fillFor(el) === 'none') return 0;
  return el.fillStyle === 'solid' ? 1 : 0.5;
}

/** Union bounding box over every visible element (points included). */
function computeBBox(elements: ExElement[]): ViewBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (el.isDeleted) continue;
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    minX = Math.min(minX, x, x + w);
    minY = Math.min(minY, y, y + h);
    maxX = Math.max(maxX, x, x + w);
    maxY = Math.max(maxY, y, y + h);
    if (Array.isArray(el.points)) {
      for (const [px, py] of el.points) {
        minX = Math.min(minX, x + px);
        minY = Math.min(minY, y + py);
        maxX = Math.max(maxX, x + px);
        maxY = Math.max(maxY, y + py);
      }
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 100, h: 100 };
  const pad = 40;
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

function rectRadius(el: ExElement): number {
  if (!el.roundness) return 0;
  const min = Math.min(el.width ?? 0, el.height ?? 0);
  return Math.min(32, min * 0.25);
}

function rotateAttr(el: ExElement): string | undefined {
  const a = el.angle ?? 0;
  if (!a) return undefined;
  const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
  const cy = (el.y ?? 0) + (el.height ?? 0) / 2;
  return `rotate(${(a * 180) / Math.PI} ${cx} ${cy})`;
}

function renderText(el: ExElement, key: string): JSX.Element {
  const x = el.x ?? 0;
  const y = el.y ?? 0;
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const size = el.fontSize ?? 16;
  const lineHeight = size * 1.25;
  const lines = (el.text ?? '').split('\n');
  const align = el.textAlign ?? 'left';
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  // Vertical: Excalidraw text y is the top of the block; approximate baseline.
  const blockHeight = lineHeight * lines.length;
  const top = el.verticalAlign === 'middle' ? y + (h - blockHeight) / 2 : y;
  return (
    <text
      key={key}
      x={tx}
      textAnchor={anchor}
      fill={el.strokeColor ?? '#1e1e1e'}
      fontFamily={fontFor(el.fontFamily)}
      fontSize={size}
      opacity={(el.opacity ?? 100) / 100}
      transform={rotateAttr(el)}
      style={{ whiteSpace: 'pre' }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={tx} y={top + lineHeight * (i + 0.8)}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function renderElement(el: ExElement, key: string): JSX.Element | null {
  if (el.isDeleted) return null;
  const stroke = el.strokeColor ?? '#1e1e1e';
  const strokeWidth = el.strokeWidth ?? 1;
  const opacity = (el.opacity ?? 100) / 100;
  const dash =
    el.strokeStyle === 'dashed'
      ? `${strokeWidth * 4} ${strokeWidth * 3}`
      : el.strokeStyle === 'dotted'
        ? `${strokeWidth} ${strokeWidth * 2}`
        : undefined;
  const x = el.x ?? 0;
  const y = el.y ?? 0;
  const w = el.width ?? 0;
  const h = el.height ?? 0;

  switch (el.type) {
    case 'rectangle':
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={rectRadius(el)}
          ry={rectRadius(el)}
          fill={fillFor(el)}
          fillOpacity={fillOpacityFor(el)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          opacity={opacity}
          transform={rotateAttr(el)}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          key={key}
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          fill={fillFor(el)}
          fillOpacity={fillOpacityFor(el)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          opacity={opacity}
          transform={rotateAttr(el)}
        />
      );
    case 'diamond': {
      const pts = [
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ]
        .map((p) => p.join(','))
        .join(' ');
      return (
        <polygon
          key={key}
          points={pts}
          fill={fillFor(el)}
          fillOpacity={fillOpacityFor(el)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          opacity={opacity}
          transform={rotateAttr(el)}
        />
      );
    }
    case 'line':
    case 'arrow': {
      const pts = Array.isArray(el.points) ? el.points : [];
      if (pts.length < 2) return null;
      const abs = pts.map(([px, py]) => [x + px, y + py] as [number, number]);
      const polyPts = abs.map((p) => p.join(',')).join(' ');
      const arrowHead =
        el.type === 'arrow' ? arrowHeadPath(abs[abs.length - 2], abs[abs.length - 1], strokeWidth) : null;
      return (
        <g key={key} opacity={opacity} transform={rotateAttr(el)}>
          <polyline
            points={polyPts}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {arrowHead && (
            <polyline points={arrowHead} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          )}
        </g>
      );
    }
    case 'text':
      return renderText(el, key);
    default:
      return null;
  }
}

/** Two short strokes forming an arrowhead at `to`, based on the incoming segment. */
function arrowHeadPath(from: [number, number], to: [number, number], strokeWidth: number): string {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const len = 12 + strokeWidth * 2;
  const spread = Math.PI / 7;
  const a1 = angle + Math.PI - spread;
  const a2 = angle + Math.PI + spread;
  const p1 = [to[0] + len * Math.cos(a1), to[1] + len * Math.sin(a1)];
  const p2 = [to[0] + len * Math.cos(a2), to[1] + len * Math.sin(a2)];
  return `${p1[0]},${p1[1]} ${to[0]},${to[1]} ${p2[0]},${p2[1]}`;
}

/**
 * Self-contained Excalidraw renderer: parses the scene JSON and draws it as an
 * SVG with pan (drag) and zoom (wheel + toolbar). No external Excalidraw
 * runtime, so nothing is fetched and it stays offline-first.
 */
export function ExcalidrawView({ source }: ExcalidrawViewProps): JSX.Element {
  const parsed = useMemo<{ scene: ExScene | null; error: string | null }>(() => {
    try {
      const scene = JSON.parse(source) as ExScene;
      if (!scene || !Array.isArray(scene.elements)) {
        return { scene: null, error: t('excalidraw.invalid') };
      }
      return { scene, error: null };
    } catch {
      return { scene: null, error: t('excalidraw.invalid') };
    }
  }, [source]);

  const elements = parsed.scene?.elements ?? [];
  const bg = parsed.scene?.appState?.viewBackgroundColor ?? '#ffffff';
  const initialBox = useMemo(() => computeBBox(elements), [elements]);

  const [box, setBox] = useState<ViewBox>(initialBox);
  useEffect(() => {
    setBox(initialBox);
  }, [initialBox]);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ startX: number; startY: number; box: ViewBox } | null>(null);

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setBox((prev) => {
      const nw = prev.w * factor;
      const nh = prev.h * factor;
      // Keep the point under the cursor stable when zooming with the wheel.
      const ax = cx ?? prev.x + prev.w / 2;
      const ay = cy ?? prev.y + prev.h / 2;
      const rx = (ax - prev.x) / prev.w;
      const ry = (ay - prev.y) / prev.h;
      return { x: ax - nw * rx, y: ay - nh * ry, w: nw, h: nh };
    });
  }, []);

  const clientToScene = useCallback((clientX: number, clientY: number, b: ViewBox): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [b.x + b.w / 2, b.y + b.h / 2];
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return [b.x + px * b.w, b.y + py * b.h];
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      const [cx, cy] = clientToScene(e.clientX, e.clientY, box);
      zoomBy(factor, cx, cy);
    },
    [box, clientToScene, zoomBy],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { startX: e.clientX, startY: e.clientY, box };
    },
    [box],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * d.box.w;
    const dy = ((e.clientY - d.startY) / rect.height) * d.box.h;
    setBox({ x: d.box.x - dx, y: d.box.y - dy, w: d.box.w, h: d.box.h });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  if (parsed.error) {
    return (
      <div className="wv-excalidraw wv-excalidraw-error" role="alert">
        <p>{parsed.error}</p>
      </div>
    );
  }

  return (
    <div className="wv-excalidraw">
      <div className="wv-excalidraw-toolbar">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} title={t('excalidraw.zoomIn')} aria-label={t('excalidraw.zoomIn')}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(1.2)} title={t('excalidraw.zoomOut')} aria-label={t('excalidraw.zoomOut')}>
          −
        </button>
        <button type="button" onClick={() => setBox(initialBox)} title={t('excalidraw.fit')} aria-label={t('excalidraw.fit')}>
          {t('excalidraw.fit')}
        </button>
      </div>
      <svg
        ref={svgRef}
        className="wv-excalidraw-canvas"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ background: bg, touchAction: 'none' }}
        role="img"
        aria-label={t('excalidraw.diagram')}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {elements.map((el, i) => renderElement(el, el.id ?? String(i)))}
      </svg>
    </div>
  );
}
