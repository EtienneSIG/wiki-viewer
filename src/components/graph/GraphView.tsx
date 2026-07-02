import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { WikiGraph } from '../../lib/wiki';
import type { ThemeId } from '../../lib/types';

export interface GraphViewProps {
  graph: WikiGraph;
  activePath: string | null;
  onOpen: (path: string) => void;
  theme: ThemeId;
}

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  group: string;
  degree: number;
  clients: string[];
}
type GLink = SimulationLinkDatum<GNode>;

interface Transform {
  x: number;
  y: number;
  k: number;
}

const PALETTE = [
  '#5b5fc7', '#e8730c', '#2aa198', '#d13438', '#8764b8', '#498205',
  '#c239b3', '#0078d4', '#c19c00', '#e3008c', '#00b7c3', '#7a7574',
];

function paletteFor(groups: string[]): Map<string, string> {
  const uniq = [...new Set(groups)].sort((a, b) => a.localeCompare(b));
  const map = new Map<string, string>();
  uniq.forEach((g, i) => map.set(g, PALETTE[i % PALETTE.length]));
  return map;
}

function radiusOf(node: GNode): number {
  return Math.min(22, 4 + Math.sqrt(node.degree) * 2.2);
}

interface Palettes {
  fg: string;
  faint: string;
  link: string;
  linkStrong: string;
  bg: string;
}

function themeColors(theme: ThemeId): Palettes {
  const dark = theme === 'dark' || theme === 'high-contrast';
  return dark
    ? {
        fg: '#e8e8e8',
        faint: 'rgba(180,180,180,0.25)',
        link: 'rgba(160,160,170,0.22)',
        linkStrong: 'rgba(210,210,220,0.75)',
        bg: '#1b1b1b',
      }
    : {
        fg: '#333333',
        faint: 'rgba(90,90,90,0.2)',
        link: 'rgba(90,90,110,0.18)',
        linkStrong: 'rgba(70,70,90,0.65)',
        bg: '#ffffff',
      };
}

/**
 * Obsidian-style force-directed graph on a canvas.
 * Pan (drag background), zoom (wheel), drag nodes, hover to highlight neighbors,
 * click a node to open the page. Search dims non-matches; orphans can be hidden.
 */
export function GraphView({ graph, activePath, onOpen, theme }: GraphViewProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const dimsRef = useRef({ w: 800, h: 600 });
  const dprRef = useRef(1);
  const nodesRef = useRef<GNode[]>([]);
  const nodeByIdRef = useRef<Map<string, GNode>>(new Map());
  const adjRef = useRef<Map<string, Set<string>>>(new Map());
  const colorRef = useRef<Map<string, string>>(new Map());
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const drawRef = useRef<() => void>(() => {});

  const hoverRef = useRef<string | null>(null);
  const searchRef = useRef('');
  const activeRef = useRef<string | null>(activePath);
  const themeRef = useRef<ThemeId>(theme);
  const labelsRef = useRef(false);

  const [search, setSearch] = useState('');
  const [showOrphans, setShowOrphans] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [clientFilter, setClientFilter] = useState('');
  const [spacing, setSpacing] = useState(1.4);
  const spacingRef = useRef(1.4);
  const [legend, setLegend] = useState<{ group: string; color: string }[]>([]);

  // All client slugs present in the graph, for the "filtre par client" dropdown.
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of graph.nodes) for (const c of n.clients) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [graph]);

  // Keep style refs in sync and repaint when purely visual state changes.
  useEffect(() => {
    searchRef.current = search.trim().toLowerCase();
    drawRef.current();
  }, [search]);
  useEffect(() => {
    labelsRef.current = showLabels;
    drawRef.current();
  }, [showLabels]);
  useEffect(() => {
    themeRef.current = theme;
    drawRef.current();
  }, [theme]);
  // Live spacing control: retune forces in place and re-heat the layout.
  useEffect(() => {
    spacingRef.current = spacing;
    const sim = simRef.current;
    if (!sim) return;
    const link = sim.force('link') as { distance?: (v: number) => unknown } | undefined;
    link?.distance?.(90 * spacing);
    const charge = sim.force('charge') as { strength?: (v: number) => unknown } | undefined;
    charge?.strength?.(-260 * spacing);
    sim.force('collide', forceCollide<GNode>((d) => radiusOf(d) + 10 * spacing));
    sim.alpha(0.7).restart();
  }, [spacing]);
  useEffect(() => {
    activeRef.current = activePath;
    focusActive();
    drawRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  const focusActive = useCallback(() => {
    const id = activeRef.current;
    if (!id) return;
    const node = nodeByIdRef.current.get(id);
    if (!node || node.x == null || node.y == null) return;
    const { w, h } = dimsRef.current;
    const k = transformRef.current.k;
    transformRef.current = { k, x: w / 2 - node.x * k, y: h / 2 - node.y * k };
  }, []);

  // Build / rebuild the simulation when the graph or orphan filter changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes: GNode[] = graph.nodes
      .filter((n) => showOrphans || n.degree > 0)
      .map((n) => ({ id: n.id, label: n.label, group: n.group, degree: n.degree, clients: n.clients }));

    // "Filtre par client": keep the client's pages plus their direct neighbors
    // (so the surrounding context stays visible), then drop everything else.
    if (clientFilter) {
      const direct = new Set(nodes.filter((n) => n.clients.includes(clientFilter)).map((n) => n.id));
      const keep = new Set(direct);
      for (const l of graph.links) {
        if (direct.has(l.source)) keep.add(l.target);
        if (direct.has(l.target)) keep.add(l.source);
      }
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (!keep.has(nodes[i].id)) nodes.splice(i, 1);
      }
    }

    const present = new Set(nodes.map((n) => n.id));
    const links: GLink[] = graph.links
      .filter((l) => present.has(l.source) && present.has(l.target))
      .map((l) => ({ source: l.source, target: l.target }));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map<string, Set<string>>();
    for (const n of nodes) adj.set(n.id, new Set());
    for (const l of links) {
      adj.get(l.source as string)?.add(l.target as string);
      adj.get(l.target as string)?.add(l.source as string);
    }
    const colors = paletteFor(nodes.map((n) => n.group));

    nodesRef.current = nodes;
    nodeByIdRef.current = nodeById;
    adjRef.current = adj;
    colorRef.current = colors;
    setLegend([...colors].map(([group, color]) => ({ group, color })));

    const { w, h } = dimsRef.current;
    const s = spacingRef.current;
    const sim = forceSimulation<GNode>(nodes)
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance(90 * s)
          .strength(0.35),
      )
      .force('charge', forceManyBody<GNode>().strength(-260 * s).distanceMax(600))
      .force('center', forceCenter(w / 2, h / 2))
      .force('collide', forceCollide<GNode>((d) => radiusOf(d) + 10 * s))
      .on('tick', () => drawRef.current());
    simRef.current = sim;

    // A settle pass so the very first paint isn't a hairball, then focus.
    window.setTimeout(() => {
      focusActive();
      drawRef.current();
    }, 400);

    return () => {
      sim.stop();
    };
  }, [graph, showOrphans, clientFilter, focusActive]);

  // Canvas sizing (device-pixel-ratio aware) + resize handling.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      dprRef.current = dpr;
      dimsRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const center = simRef.current?.force('center') as
        | { x: (v: number) => unknown; y: (v: number) => unknown }
        | undefined;
      center?.x(w / 2);
      center?.y(h / 2);
      drawRef.current();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Draw routine — reads everything from refs so it never needs re-creating.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (!ctx) return;

    drawRef.current = (): void => {
      const dpr = dprRef.current;
      const { x: tx, y: ty, k } = transformRef.current;
      const nodes = nodesRef.current;
      const adj = adjRef.current;
      const colors = colorRef.current;
      const c = themeColors(themeRef.current);
      const hover = hoverRef.current;
      const active = activeRef.current;
      const query = searchRef.current;
      const focusId = hover ?? active;
      const focusSet = focusId ? adj.get(focusId) ?? new Set<string>() : null;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(tx, ty);
      ctx.scale(k, k);

      // Links.
      ctx.lineWidth = 1 / k;
      const sim = simRef.current;
      const links = (sim?.force('link') as { links?: () => GLink[] } | undefined)?.links?.() ?? [];
      for (const l of links) {
        const s = l.source as GNode;
        const t = l.target as GNode;
        if (s.x == null || t.x == null) continue;
        const touchesFocus =
          focusId != null && (s.id === focusId || t.id === focusId);
        ctx.strokeStyle = touchesFocus ? c.linkStrong : c.link;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(t.x, t.y!);
        ctx.stroke();
      }

      // Nodes.
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const r = radiusOf(n);
        const matched = query ? n.label.toLowerCase().includes(query) : true;
        const near = !focusId || n.id === focusId || (focusSet?.has(n.id) ?? false);
        const dim = (query && !matched) || (focusId != null && !near);

        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.get(n.group) ?? '#888';
        ctx.fill();

        if (n.id === active || n.id === hover) {
          ctx.lineWidth = 2 / k;
          ctx.strokeStyle = c.fg;
          ctx.stroke();
        }

        const showLabel =
          !dim && (labelsRef.current || n.id === focusId || (focusSet?.has(n.id) ?? false) || k > 1.5);
        if (showLabel) {
          ctx.globalAlpha = dim ? 0.18 : 1;
          ctx.fillStyle = c.fg;
          ctx.font = `${11 / k}px "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const label = n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label;
          ctx.fillText(label, n.x, n.y + r + 2 / k);
        }
        ctx.globalAlpha = 1;
      }
    };

    drawRef.current();
  }, []);

  // Pointer + wheel interaction.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const { x: tx, y: ty, k } = transformRef.current;
      return { x: (clientX - rect.left - tx) / k, y: (clientY - rect.top - ty) / k };
    };

    const pick = (clientX: number, clientY: number): GNode | null => {
      const p = toWorld(clientX, clientY);
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x == null || n.y == null) continue;
        const r = radiusOf(n) + 3;
        if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 <= r * r) return n;
      }
      return null;
    };

    let mode: 'none' | 'pan' | 'node' = 'none';
    let dragNode: GNode | null = null;
    let start = { x: 0, y: 0 };
    let origin = { x: 0, y: 0 };
    let moved = 0;

    const onPointerDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY };
      moved = 0;
      const hit = pick(e.clientX, e.clientY);
      if (hit) {
        mode = 'node';
        dragNode = hit;
        canvas.style.cursor = 'grabbing';
        simRef.current?.alphaTarget(0.3).restart();
      } else {
        mode = 'pan';
        canvas.style.cursor = 'grabbing';
        origin = { x: transformRef.current.x, y: transformRef.current.y };
      }
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (mode === 'none') {
        const hit = pick(e.clientX, e.clientY);
        const id = hit?.id ?? null;
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          canvas.style.cursor = id ? 'pointer' : 'grab';
          drawRef.current();
        }
        return;
      }
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (mode === 'pan') {
        transformRef.current = {
          ...transformRef.current,
          x: origin.x + (e.clientX - start.x),
          y: origin.y + (e.clientY - start.y),
        };
        drawRef.current();
      } else if (mode === 'node' && dragNode) {
        const p = toWorld(e.clientX, e.clientY);
        dragNode.fx = p.x;
        dragNode.fy = p.y;
        simRef.current?.alphaTarget(0.3).restart();
      }
    };

    const onPointerUp = (e: PointerEvent): void => {
      if (mode === 'node' && dragNode) {
        simRef.current?.alphaTarget(0);
        if (moved < 5) {
          onOpen(dragNode.id);
        }
        dragNode.fx = null;
        dragNode.fy = null;
      }
      mode = 'none';
      dragNode = null;
      canvas.style.cursor = hoverRef.current ? 'pointer' : 'grab';
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { x: tx, y: ty, k } = transformRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nk = Math.max(0.2, Math.min(6, k * factor));
      transformRef.current = {
        k: nk,
        x: cx - ((cx - tx) / k) * nk,
        y: cy - ((cy - ty) / k) * nk,
      };
      drawRef.current();
    };

    const onPointerLeave = (): void => {
      if (mode !== 'none') return;
      if (hoverRef.current !== null) {
        hoverRef.current = null;
        drawRef.current();
      }
      canvas.style.cursor = 'grab';
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [onOpen]);

  const resetView = useCallback(() => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    simRef.current?.alpha(0.6).restart();
    drawRef.current();
  }, []);

  // Re-scatter every node and re-run the layout hot, so a tangled graph
  // untangles into a fresh, readable arrangement.
  const reorganize = useCallback(() => {
    const sim = simRef.current;
    const nodes = nodesRef.current;
    if (!sim || nodes.length === 0) return;
    const { w, h } = dimsRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(120, Math.min(w, h) * 0.42) * spacingRef.current;
    nodes.forEach((n, i) => {
      // Golden-angle spiral gives an even, non-overlapping initial spread.
      const a = i * 2.399963229728653;
      const rr = radius * Math.sqrt((i + 1) / nodes.length);
      n.x = cx + rr * Math.cos(a);
      n.y = cy + rr * Math.sin(a);
      n.vx = 0;
      n.vy = 0;
      n.fx = null;
      n.fy = null;
    });
    transformRef.current = { x: 0, y: 0, k: 1 };
    sim.alpha(1).alphaTarget(0).restart();
    window.setTimeout(() => {
      focusActive();
      drawRef.current();
    }, 600);
    drawRef.current();
  }, [focusActive]);

  return (
    <div className="wv-graph" ref={wrapRef}>
      <canvas ref={canvasRef} className="wv-graph-canvas" />

      <div className="wv-graph-panel" role="group" aria-label="Filtres du graphe">
        <input
          type="search"
          className="wv-graph-search"
          placeholder="Rechercher une page…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="wv-graph-toggle">
          <input
            type="checkbox"
            checked={showOrphans}
            onChange={(e) => setShowOrphans(e.target.checked)}
          />
          Orphelins
        </label>
        <label className="wv-graph-toggle">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          Étiquettes
        </label>
        <label className="wv-graph-slider">
          <span>Espacement</span>
          <input
            type="range"
            min={0.8}
            max={3}
            step={0.1}
            value={spacing}
            onChange={(e) => setSpacing(Number(e.target.value))}
            aria-label="Espacement entre les nœuds"
          />
        </label>
        {clientOptions.length > 0 && (
          <select
            className="wv-graph-select"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            aria-label="Filtrer par client"
            title="Filtrer par client"
          >
            <option value="">Tous les clients</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        )}
        <div className="wv-graph-buttons">
          <button type="button" className="wv-graph-reset" onClick={reorganize}>
            Réorganiser
          </button>
          <button type="button" className="wv-graph-reset" onClick={resetView}>
            Réinitialiser la vue
          </button>
        </div>
        {legend.length > 0 && (
          <div className="wv-graph-legend">
            {legend.map((l) => (
              <span key={l.group} className="wv-graph-legend-item" title={l.group}>
                <span className="wv-graph-legend-dot" style={{ background: l.color }} />
                {l.group}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="wv-graph-hint" aria-hidden="true">
        Molette : zoom · Glisser : déplacer · Clic : ouvrir
      </div>
    </div>
  );
}
