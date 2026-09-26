<script lang="ts" module>
  export interface Hotspot {
    id: string;
    x: number;
    y: number;
    label: string;
  }
</script>

<script lang="ts">
  // The map: tiles, followers, and whatever the player can tap (ghost squares, follower
  // spots). Fits itself to the map as it grows; drag, pinch or scroll to look around.
  import { untrack } from 'svelte';
  import { anchorAt } from '@onemore/carcass-eon/art';
  import { MEEPLE, seatColour, tileUri } from './tiles';

  interface Tile {
    cell: string;
    def: string;
    rotation: number;
    x: number;
    y: number;
  }
  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  let {
    tiles,
    followers = [],
    ghosts = [],
    targets = [],
    preview = null,
    previewState = null,
    highlight = null,
    flash = [],
    hotspots = [],
    selected = null,
    focus = null,
    focusRadius = 1,
    onGhost,
    onHotspot,
  }: {
    tiles: Tile[];
    followers?: { seat: string; cell: string; feature: number; kind: string }[];
    ghosts?: { x: number; y: number }[];
    /** Tappable but invisible squares, for when placement hints are off. */
    targets?: { x: number; y: number }[];
    preview?: { x: number; y: number; def: string; rotation: number } | null;
    /** Outline for the preview: fits, doesn't fit, or unknown (hints off). */
    previewState?: 'ok' | 'bad' | null;
    highlight?: string | null;
    /** Cells to flash briefly, e.g. a feature that just scored. */
    flash?: string[];
    hotspots?: Hotspot[];
    selected?: string | null;
    focus?: { x: number; y: number } | null;
    /** How many cells around `focus` to show. */
    focusRadius?: number;
    onGhost?: (x: number, y: number) => void;
    onHotspot?: (id: string) => void;
  } = $props();

  let svgEl: SVGSVGElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);
  /** Set once the player pans or zooms; cleared by "Fit". */
  let manual = $state<Box | null>(null);
  let shown = $state<Box>({ x: -150, y: -150, w: 400, h: 400 });

  const byCell = $derived(new Map(tiles.map((t) => [t.cell, t])));

  const target = $derived.by((): Box => {
    const cells = focus
      ? [
          { x: focus.x - focusRadius, y: focus.y - focusRadius },
          { x: focus.x + focusRadius, y: focus.y + focusRadius },
        ]
      : [...tiles, ...ghosts, ...(preview ? [preview] : [])];
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const margin = focus ? 20 : 50;
    const box = {
      x: Math.min(...xs) * 100 - margin,
      y: Math.min(...ys) * 100 - margin,
      w: (Math.max(...xs) - Math.min(...xs) + 1) * 100 + 2 * margin,
      h: (Math.max(...ys) - Math.min(...ys) + 1) * 100 + 2 * margin,
    };
    return fitAspect(box, width && height ? width / height : 1);
  });

  function fitAspect(box: Box, aspect: number): Box {
    if (box.w / box.h < aspect) {
      const w = box.h * aspect;
      return { ...box, x: box.x - (w - box.w) / 2, w };
    }
    const h = box.w / aspect;
    return { ...box, y: box.y - (h - box.h) / 2, h };
  }

  // Glide towards the target box, so the map grows smoothly on the shared screen.
  $effect(() => {
    const goal = manual ?? target;
    const from = untrack(() => ({ ...shown }));
    if (manual) {
      shown = goal;
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const e = 1 - (1 - t) ** 3;
      shown = {
        x: from.x + (goal.x - from.x) * e,
        y: from.y + (goal.y - from.y) * e,
        w: from.w + (goal.w - from.w) * e,
        h: from.h + (goal.h - from.h) * e,
      };
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  // --- Pan and zoom ------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number } | null = null;
  let dragged = false;

  function toBoard(px: number, py: number, box: Box) {
    return { x: box.x + (px / width) * box.w, y: box.y + (py / height) * box.h };
  }

  function zoomAt(px: number, py: number, factor: number) {
    const box = manual ?? shown;
    const w = Math.min(4000, Math.max(120, box.w * factor));
    const h = (w / box.w) * box.h;
    const p = toBoard(px, py, box);
    manual = { x: p.x - (px / width) * w, y: p.y - (py / height) * h, w, h };
  }

  function local(e: PointerEvent | WheelEvent) {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: PointerEvent) {
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      dragStart = local(e);
      dragged = false;
    }
  }

  function move(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    if (pointers.size === 1) {
      if (!dragged && dragStart && Math.hypot(now.x - dragStart.x, now.y - dragStart.y) > 8) {
        dragged = true;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      }
      if (dragged) {
        const box = manual ?? shown;
        manual = { ...box, x: box.x - ((now.x - prev.x) / width) * box.w, y: box.y - ((now.y - prev.y) / height) * box.h };
      }
    } else if (pointers.size === 2) {
      dragged = true;
      const [a, b] = [...pointers.entries()].map(([id, p]) => (id === e.pointerId ? now : p)) as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const [pa, pb] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const before = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 0 && after > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, before / after);
    }
    pointers.set(e.pointerId, now);
  }

  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(e.deltaY * 0.0015));
  }

  /** The board square under a point on screen, e.g. where a dragged tile is dropped. */
  export function cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!svgEl) return null;
    const r = svgEl.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const p = toBoard(clientX - r.left, clientY - r.top, shown);
    return { x: Math.floor(p.x / 100), y: Math.floor(p.y / 100) };
  }

  function tap(fn: () => void) {
    return () => {
      if (!dragged) fn();
    };
  }

  // Leave manual mode when the thing to look at changes (a new turn, or the follow step).
  const lookAt = $derived(`${focus?.x},${focus?.y},${ghosts.length},${tiles.length}`);
  $effect(() => {
    void lookAt;
    untrack(() => (manual = null));
  });
</script>

<div class="board" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svgEl}
    viewBox="{shown.x} {shown.y} {shown.w} {shown.h}"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onwheel={wheel}
    role="img"
    aria-label="The map"
  >
    {#each tiles as t (t.cell)}
      <image
        class:landed={t.cell === highlight}
        href={tileUri(t.def, t.rotation)}
        x={t.x * 100}
        y={t.y * 100}
        width="100"
        height="100"
      />
    {/each}

    {#each flash as cell (cell)}
      {@const f = byCell.get(cell)}
      {#if f}<rect class="flash" x={f.x * 100} y={f.y * 100} width="100" height="100" />{/if}
    {/each}

    {#if highlight && byCell.get(highlight)}
      {@const h = byCell.get(highlight)!}
      <rect class="highlight" x={h.x * 100 + 2} y={h.y * 100 + 2} width="96" height="96" rx="4" />
    {/if}

    {#each ghosts as g (`${g.x},${g.y}`)}
      <rect
        class="ghost"
        class:chosen={preview && preview.x === g.x && preview.y === g.y}
        x={g.x * 100 + 4}
        y={g.y * 100 + 4}
        width="92"
        height="92"
        rx="8"
        role="button"
        tabindex="0"
        aria-label="Place here"
        onclick={tap(() => onGhost?.(g.x, g.y))}
        onkeydown={(e) => e.key === 'Enter' && onGhost?.(g.x, g.y)}
      />
    {/each}

    {#each targets as g (`t${g.x},${g.y}`)}
      <rect
        class="target"
        x={g.x * 100}
        y={g.y * 100}
        width="100"
        height="100"
        role="button"
        tabindex="-1"
        aria-label="Try here"
        onclick={tap(() => onGhost?.(g.x, g.y))}
        onkeydown={(e) => e.key === 'Enter' && onGhost?.(g.x, g.y)}
      />
    {/each}

    {#if preview}
      <image
        class="preview"
        href={tileUri(preview.def, preview.rotation)}
        x={preview.x * 100}
        y={preview.y * 100}
        width="100"
        height="100"
      />
      <rect
        class="preview-outline"
        class:ok={previewState === 'ok'}
        class:bad={previewState === 'bad'}
        x={preview.x * 100}
        y={preview.y * 100}
        width="100"
        height="100"
        rx="4"
      />
    {/if}

    {#each followers as f (`${f.cell}#${f.feature}`)}
      {@const t = byCell.get(f.cell)}
      {#if t}
        {@const p = anchorAt(t.def, t.rotation, f.feature)}
        <path
          class="meeple"
          d={MEEPLE}
          fill={seatColour(f.seat)}
          transform="translate({t.x * 100 + p.x} {t.y * 100 + p.y}) {f.kind === 'field' ? 'rotate(90)' : ''} scale(0.9)"
        />
      {/if}
    {/each}

    {#each hotspots as h (h.id)}
      <g
        class="hotspot"
        class:chosen={selected === h.id}
        role="button"
        tabindex="0"
        aria-label={h.label}
        onclick={tap(() => onHotspot?.(h.id))}
        onkeydown={(e) => e.key === 'Enter' && onHotspot?.(h.id)}
      >
        <circle cx={h.x} cy={h.y} r={selected === h.id ? 11 : 8} />
      </g>
    {/each}
  </svg>

  {#if manual}
    <button class="fit secondary small" onclick={() => (manual = null)}>Fit map</button>
  {/if}
</div>

<style>
  .board {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 12rem;
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
  }
  .highlight {
    fill: none;
    stroke: var(--accent);
    stroke-width: 4;
  }
  .landed {
    transform-box: fill-box;
    transform-origin: center;
    animation: land 0.45s cubic-bezier(0.2, 0.8, 0.3, 1.2);
  }
  .flash {
    fill: #fff3b0;
    pointer-events: none;
    animation: flash 1.5s ease-out forwards;
  }
  @keyframes land {
    from {
      opacity: 0;
      transform: scale(1.25);
    }
  }
  @keyframes flash {
    0% {
      opacity: 0.75;
    }
    100% {
      opacity: 0;
    }
  }
  .ghost {
    fill: rgb(255 255 255 / 0.12);
    stroke: rgb(255 255 255 / 0.75);
    stroke-width: 3;
    stroke-dasharray: 10 7;
    cursor: pointer;
    animation: pulse 1.6s ease-in-out infinite;
  }
  .ghost.chosen {
    /* Stays tappable under the preview: tapping the chosen square again rotates. */
    fill: transparent;
    stroke: none;
    animation: none;
  }
  .preview {
    opacity: 0.92;
    pointer-events: none;
  }
  .preview-outline {
    fill: none;
    stroke: var(--accent);
    stroke-width: 5;
    pointer-events: none;
  }
  .preview-outline.ok {
    stroke: var(--ok);
  }
  .preview-outline.bad {
    stroke: var(--danger);
  }
  .target {
    fill: transparent;
    cursor: pointer;
  }
  .meeple {
    stroke: #1d1d1d;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .hotspot circle {
    fill: rgb(255 255 255 / 0.85);
    stroke: var(--accent);
    stroke-width: 3;
    cursor: pointer;
  }
  .hotspot.chosen circle {
    fill: var(--accent);
    stroke: #fff;
  }
  .fit {
    position: absolute;
    right: 0.6rem;
    top: 0.6rem;
  }
  @keyframes pulse {
    50% {
      fill: rgb(255 255 255 / 0.25);
    }
  }
</style>
