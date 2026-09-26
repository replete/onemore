<script lang="ts">
  import { untrack } from 'svelte';
  import type { CarcassView } from '@onemore/carcass-eon';
  import { anchorAt } from '@onemore/carcass-eon/art';
  import type { Session } from '../../lib/session.svelte';
  import Board, { type Hotspot } from './Board.svelte';
  import Stack from './Stack.svelte';
  import { MEEPLE, seatColour, tileUri } from './tiles';

  let { session }: { session: Session } = $props();

  let room = $derived(session.room!);
  let message = $derived(session.view);
  let view = $derived(message?.view as CarcassView | undefined);
  let you = $derived(room.you);
  let isScreen = $derived(you.role === 'screen' || !you.seat);
  let names = $derived(Object.fromEntries(room.participants.filter((p) => p.seat).map((p) => [p.seat!, p.name])));
  let seats = $derived(Object.keys(view?.scores ?? {}).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  let decisions = $derived(message?.decisions ?? []);
  let placeDecision = $derived(decisions.find((d) => d.prompt.kind === 'place'));
  const isDraw = (d: (typeof decisions)[number]) => d.prompt.kind === 'choose' && d.prompt.options[0]?.id === 'draw';
  let drawDecision = $derived(decisions.find(isDraw));
  let followDecision = $derived(decisions.find((d) => d.prompt.kind === 'choose' && !isDraw(d)));
  let hints = $derived(view?.hints ?? true);
  let board: Board | undefined = $state();

  function draw() {
    if (drawDecision) session.act(drawDecision.id, { option: 'draw' });
  }

  // --- Placing a tile ----------------------------------------------------------------
  let rotation = $state(0);
  let chosenCell = $state<{ x: number; y: number } | null>(null);

  let sitesByRotation = $derived.by(() => {
    const out = new Map<number, { x: number; y: number }[]>();
    if (placeDecision?.prompt.kind !== 'place') return out;
    for (const site of placeDecision.prompt.sites) {
      const [x, y, r] = site.split(',').map(Number) as [number, number, number];
      out.set(r, [...(out.get(r) ?? []), { x, y }]);
    }
    return out;
  });
  const validAt = (x: number, y: number) =>
    [0, 1, 2, 3].filter((r) => sitesByRotation.get(r)?.some((c) => c.x === x && c.y === y));

  // A new placement decision: start from the first rotation that fits somewhere.
  $effect(() => {
    const id = placeDecision?.id;
    untrack(() => {
      chosenCell = null;
      if (id) rotation = [0, 1, 2, 3].find((r) => sitesByRotation.has(r)) ?? 0;
    });
  });

  // Empty squares next to the map: where a tile could go, if it fits.
  let frontier = $derived.by(() => {
    if (!view) return [];
    const taken = new Set(view.board.map((t) => t.cell));
    const out = new Map<string, { x: number; y: number }>();
    for (const t of view.board) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const key = `${t.x + dx},${t.y + dy}`;
        if (!taken.has(key)) out.set(key, { x: t.x + dx, y: t.y + dy });
      }
    }
    return [...out.values()];
  });

  // With hints on, flashing squares show where the tile fits; with them off, every edge square is a target (D-040).
  let ghosts = $derived(placeDecision && hints ? (sitesByRotation.get(rotation) ?? []) : []);
  let targets = $derived(placeDecision && !hints ? frontier : []);
  let hover = $state<{ x: number; y: number } | null>(null);
  let shown = $derived(hover ?? chosenCell);
  let preview = $derived(shown && view?.current ? { ...shown, def: view.current, rotation } : null);
  let previewState = $derived(!hints || !shown ? null : validAt(shown.x, shown.y).includes(rotation) ? ('ok' as const) : ('bad' as const));
  let problem = $state('');
  let shake = $state(0);

  function rotate() {
    problem = '';
    if (!hints) {
      rotation = (rotation + 1) % 4;
      return;
    }
    for (let i = 1; i <= 4; i++) {
      const r = (rotation + i) % 4;
      const fitsAtChosen = chosenCell ? validAt(chosenCell.x, chosenCell.y).includes(r) : sitesByRotation.has(r);
      if (fitsAtChosen) {
        rotation = r;
        return;
      }
    }
  }

  /** Put the tile on a square (tap or drop). With hints on, turn it to a way round that fits. */
  function chooseCell(x: number, y: number) {
    problem = '';
    if (chosenCell && chosenCell.x === x && chosenCell.y === y) return rotate();
    if (hints) {
      const valid = validAt(x, y);
      if (valid.length === 0) return refuse('Doesn’t fit there');
      if (!valid.includes(rotation)) rotation = valid[0]!;
    } else if (!frontier.some((c) => c.x === x && c.y === y)) {
      return refuse('It has to touch the map');
    }
    chosenCell = { x, y };
  }

  function refuse(message: string) {
    problem = message;
    shake += 1;
  }

  function confirmPlace() {
    if (!placeDecision || !chosenCell) return;
    const site = `${chosenCell.x},${chosenCell.y},${rotation}`;
    if (placeDecision.prompt.kind === 'place' && !placeDecision.prompt.sites.includes(site)) {
      return refuse(validAt(chosenCell.x, chosenCell.y).length ? 'Doesn’t fit this way round' : 'Doesn’t fit there');
    }
    session.act(placeDecision.id, { site });
    chosenCell = null;
  }

  // --- Dragging the tile from your hand onto the map -----------------------------------
  let drag = $state<{ x: number; y: number } | null>(null);
  let pressStart: { x: number; y: number } | null = null;

  function handDown(e: PointerEvent) {
    pressStart = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function handMove(e: PointerEvent) {
    if (!pressStart) return;
    if (!drag && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) < 8) return;
    drag = { x: e.clientX, y: e.clientY };
    const cell = board?.cellAt(e.clientX, e.clientY) ?? null;
    hover = cell && frontier.some((c) => c.x === cell.x && c.y === cell.y) ? cell : null;
  }

  function handCancel() {
    pressStart = null;
    drag = null;
    hover = null;
  }

  function handUp(e: PointerEvent) {
    const wasDrag = drag !== null;
    pressStart = null;
    drag = null;
    hover = null;
    if (!wasDrag) return rotate();
    const cell = board?.cellAt(e.clientX, e.clientY);
    if (cell) chooseCell(cell.x, cell.y);
  }

  // --- Placing a follower ------------------------------------------------------------
  let chosenSpot = $state<string | null>(null);
  $effect(() => {
    void followDecision?.id;
    untrack(() => (chosenSpot = null));
  });

  let lastTile = $derived(view?.lastPlaced ? view.board.find((t) => t.cell === view!.lastPlaced) : undefined);
  let hotspots = $derived.by((): Hotspot[] => {
    if (followDecision?.prompt.kind !== 'choose' || !lastTile) return [];
    return followDecision.prompt.options
      .filter((o) => o.id.startsWith('f'))
      .map((o) => {
        const p = anchorAt(lastTile!.def, lastTile!.rotation, Number(o.id.slice(1)));
        return { id: o.id, label: o.label, x: lastTile!.x * 100 + p.x, y: lastTile!.y * 100 + p.y };
      });
  });
  let chosenLabel = $derived(hotspots.find((h) => h.id === chosenSpot)?.label);

  function follow(option: string) {
    if (!followDecision) return;
    session.act(followDecision.id, { option });
  }

  // --- Waiting on absent players (D-026) ---------------------------------------------
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });
  const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - (now + session.clockOffset)) / 1000));
  let waitingFor = $derived(new Map((message?.waiting ?? []).map((w) => [w.seat, w.until])));

  // Shared-screen layout, chosen by an admin (D-020).
  let layouts = $derived(room.games.find((g) => g.id === room.game)?.layouts ?? []);
  let screens = $derived(room.participants.filter((p) => p.role === 'screen'));
  let layout = $derived(you.layout ?? layouts[0]?.id ?? 'whole');
  let recentTile = $derived(view?.lastPlaced ? view.board.find((t) => t.cell === view!.lastPlaced) : undefined);

  let ranking = $derived([...seats].sort((a, b) => (view!.scores[b] ?? 0) - (view!.scores[a] ?? 0)));
  let turnName = $derived(view?.turn ? (names[view.turn] ?? '') : '');

  // --- Announcing what just happened ------------------------------------------------
  interface Scored {
    type: 'scored';
    kind: 'city' | 'road' | 'monastery' | 'field';
    seats: string[];
    points: number;
    cells: string[];
    final?: boolean;
  }
  const KIND = { city: 'city', road: 'road', monastery: 'monastery', field: 'farm' } as const;
  let toasts = $state<{ id: number; text: string; colour: string }[]>([]);
  let flash = $state<string[]>([]);
  let finalScoring = $state<Scored[]>([]);
  let toastId = 0;

  $effect(() => {
    const events = message?.events ?? [];
    untrack(() => {
      const scored = events.filter((e) => e.type === 'scored') as unknown as Scored[];
      if (scored.length === 0) return;
      const during = scored.filter((e) => !e.final);
      finalScoring = [...finalScoring, ...scored.filter((e) => e.final)];
      for (const e of during) {
        const id = ++toastId;
        const who = e.seats.map((s) => names[s] ?? s).join(' & ');
        toasts = [...toasts, { id, text: `${who} +${e.points} · ${KIND[e.kind]}`, colour: seatColour(e.seats[0]!) }];
        setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 4000);
      }
      flash = [...new Set(scored.flatMap((e) => e.cells))];
      setTimeout(() => (flash = []), 1600);
    });
  });
</script>

{#snippet scoreboard(compact: boolean)}
  <ul class="scores" class:compact>
    {#each seats as seat (seat)}
      <li class:turn={view!.turn === seat}>
        <svg viewBox="-10 -11 20 21" class="dot"><path d={MEEPLE} fill={seatColour(seat)} stroke="#111" stroke-width="1.2" /></svg>
        <span class="name">{names[seat] ?? seat}</span>
        <span class="points">{view!.scores[seat]}</span>
        {#if !compact}<span class="left">{view!.supply[seat]} left</span>{/if}
        {#if waitingFor.has(seat)}<span class="waiting">reconnecting… {secondsLeft(waitingFor.get(seat)!)}s</span>{/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet announcements()}
  <div class="toasts" aria-live="polite">
    {#each toasts as t (t.id)}
      <p class="toast" style="--who: {t.colour}">{t.text}</p>
    {/each}
  </div>
{/snippet}

{#snippet finalBreakdown()}
  {#if finalScoring.length}
    <details class="breakdown">
      <summary>How the last points were scored</summary>
      <ul>
        {#each finalScoring as e, i (i)}
          <li>{e.seats.map((s) => names[s] ?? s).join(' & ')} +{e.points} · unfinished {KIND[e.kind]}</li>
        {/each}
      </ul>
    </details>
  {/if}
{/snippet}

{#snippet layoutPicker()}
  {#if you.admin && layouts.length > 1 && (screens.length > 0 || isScreen)}
    <div class="layouts" role="group" aria-label="Shared screen layout">
      <span class="muted">Screen:</span>
      {#each layouts as l (l.id)}
        <button
          class="small"
          class:secondary={(screens[0]?.layout ?? layouts[0]!.id) !== l.id}
          onclick={() => session.admin({ type: 'screen-layout', layout: l.id })}>{l.label}</button
        >
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet adminTools()}
  {@render layoutPicker()}
  {#if you.admin}
    <div class="admin">
      {#each message?.waiting ?? [] as w (w.seat)}
        <button class="secondary small" onclick={() => session.admin({ type: 'skip', seat: w.seat })}>
          Play for {names[w.seat]} now
        </button>
      {/each}
      <button
        class="secondary small"
        onclick={() => confirm('End this game and go back to the lobby?') && session.admin({ type: 'new-game' })}
      >
        End game
      </button>
    </div>
  {/if}
{/snippet}

{#if !view}
  <p class="centered">Setting out the tiles…</p>
{:else if isScreen}
  <!-- Shared screen: the whole map, the scores, and the tile in play. -->
  <main class="screen">
    <div class="map">
      <Board
        tiles={view.board}
        followers={view.followers}
        highlight={view.lastPlaced}
        {flash}
        focus={layout === 'follow' && recentTile ? { x: recentTile.x, y: recentTile.y } : null}
        focusRadius={2}
      />
      {#if view.phase !== 'done'}<Stack count={view.bag} />{/if}
      {@render announcements()}
    </div>
    <aside>
      <h1>Carcass Eon</h1>
      {#if view.phase === 'done'}
        <h2>Final scores</h2>
        <ol class="final">
          {#each ranking as seat, i (seat)}
            <li class:winner={i === 0 || view.scores[seat] === view.scores[ranking[0]!]}>
              <span>{names[seat]}</span><strong>{view.scores[seat]}</strong>
            </li>
          {/each}
        </ol>
        {@render finalBreakdown()}
      {:else}
        {#if view.phase === 'draw'}
          <p class="status">{turnName} is drawing a tile…</p>
        {:else if view.current}
          <div class="current">
            {#key view.current + view.bag}<img class="fly-in" src={tileUri(view.current, 0)} alt="The tile being placed" />{/key}
            <p>{turnName} is placing</p>
          </div>
        {:else if view.turn}
          <p class="status">{turnName} is choosing a follower</p>
        {/if}
        {@render scoreboard(false)}
        <p class="muted">{view.bag} tiles left{view.farmers ? ' · Farmers on' : ''}</p>
        {@render layoutPicker()}
      {/if}
    </aside>
  </main>
{:else}
  <!-- A player's phone. -->
  <main class="phone">
    {@render scoreboard(true)}

    <div class="map">
      <Board
        tiles={view.board}
        followers={view.followers}
        highlight={view.lastPlaced}
        {flash}
        {ghosts}
        {targets}
        {preview}
        {previewState}
        {hotspots}
        selected={chosenSpot}
        focus={followDecision && lastTile ? { x: lastTile.x, y: lastTile.y } : null}
        onGhost={chooseCell}
        onHotspot={(id) => (chosenSpot = id)}
        bind:this={board}
      />
      {#if view.phase !== 'done'}<Stack count={view.bag} active={!!drawDecision} onDraw={draw} />{/if}
      {@render announcements()}
    </div>

    <section class="panel">
      {#if view.phase === 'done'}
        <h2>Final scores</h2>
        <ol class="final">
          {#each ranking as seat (seat)}
            <li><span>{names[seat]}</span><strong>{view.scores[seat]}</strong></li>
          {/each}
        </ol>
        {@render finalBreakdown()}
      {:else if drawDecision}
        <div class="draw-prompt">
          <p><strong>Your turn.</strong> Take a tile from the stack ↙</p>
          <button onclick={draw}>Draw</button>
        </div>
      {:else if placeDecision && view.current}
        <div class="place">
          {#key view.current + view.bag}
            <button
              class="tile-button fly-in"
              class:dragging={!!drag}
              aria-label="Your tile: tap to rotate, drag onto the map"
              onpointerdown={handDown}
              onpointermove={handMove}
              onpointerup={handUp}
              onpointercancel={handCancel}
            >
              {#key shake}<img class:shake={shake > 0} src={tileUri(view.current, rotation)} alt="Your tile" draggable="false" />{/key}
              <span>↻</span>
            </button>
          {/key}
          <div class="place-actions">
            {#if problem}
              <p class="hint problem">{problem}</p>
            {:else if hints && ghosts.length === 0}
              <p class="hint">No spot fits this way round. Tap the tile to rotate.</p>
            {:else if !chosenCell}
              <p class="hint">Drag your tile onto the map{hints ? ' (flashing squares fit)' : ''}. Tap it to rotate.</p>
            {:else}
              <p class="hint">Tap the tile or the square to rotate.</p>
            {/if}
            <button onclick={confirmPlace} disabled={!chosenCell}>Place tile</button>
          </div>
        </div>
      {:else if followDecision}
        <p class="hint">
          {#if hotspots.length === 0}No free spot here.{:else if chosenLabel}Put a follower on the <strong>{chosenLabel.toLowerCase()}</strong>?{:else}Tap a circle to place a follower ({view.supply[you.seat!]} left).{/if}
        </p>
        <div class="follow-actions">
          <button class="secondary" onclick={() => follow('none')}>No follower</button>
          <button onclick={() => chosenSpot && follow(chosenSpot)} disabled={!chosenSpot}>Place follower</button>
        </div>
      {:else}
        <div class="waiting-turn">
          {#if view.current}<img src={tileUri(view.current, 0)} alt="The tile being placed" />{/if}
          <p class="hint">
            {#if view.phase === 'draw'}{turnName} is drawing a tile…{:else if view.phase === 'place'}{turnName} is placing a tile…{:else}{turnName} is choosing a follower…{/if}
          </p>
        </div>
      {/if}
      {@render adminTools()}
    </section>
  </main>
  {#if drag && view.current}
    <img
      class="floating"
      src={tileUri(view.current, rotation)}
      alt=""
      style="left: {drag.x}px; top: {drag.y}px"
    />
  {/if}
{/if}

<style>
  .centered {
    text-align: center;
    padding-top: 30vh;
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
  .scores {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .scores li {
    display: grid;
    grid-template-columns: 1.6rem 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--panel);
    border-radius: 0.6rem;
    padding: 0.4rem 0.6rem;
    border: 0.15rem solid transparent;
  }
  .scores li.turn {
    border-color: var(--accent);
  }
  .dot {
    width: 1.4rem;
    height: 1.4rem;
  }
  .points {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .left {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .waiting {
    grid-column: 2 / -1;
    color: var(--accent);
    font-size: 0.85rem;
  }
  .scores.compact {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
  }
  .scores.compact li {
    grid-template-columns: 1.1rem auto auto;
    padding: 0.25rem 0.5rem;
    flex: none;
    font-size: 0.9rem;
  }
  .scores.compact .dot {
    width: 1.1rem;
    height: 1.1rem;
  }

  .map {
    position: relative;
  }
  .toasts {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    display: grid;
    gap: 0.4rem;
    pointer-events: none;
  }
  .toast {
    margin: 0;
    background: rgb(0 0 0 / 0.72);
    border-left: 0.35rem solid var(--who);
    border-radius: 0.5rem;
    padding: 0.45rem 0.75rem;
    font-weight: 700;
    animation: toast-in 0.25s ease-out;
  }
  .screen .toast {
    font-size: 1.4rem;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
  }
  .breakdown {
    color: var(--muted);
  }
  .breakdown ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
  }

  /* Shared screen */
  .screen {
    height: 100dvh;
    display: grid;
    grid-template-columns: 1fr minmax(16rem, 22rem);
  }
  .screen .map {
    min-height: 0;
  }
  aside {
    padding: 1.5rem;
    display: grid;
    align-content: start;
    gap: 1rem;
    background: rgb(0 0 0 / 0.2);
  }
  aside h1 {
    margin: 0;
    font-size: 1.6rem;
  }
  .current {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
  }
  .current img {
    width: 8rem;
    height: 8rem;
    border-radius: 0.3rem;
    box-shadow: 0 0.3rem 1rem rgb(0 0 0 / 0.4);
  }
  .current p {
    margin: 0;
    font-size: 1.2rem;
  }
  .final {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.4rem;
    font-size: 1.3rem;
  }
  .final li span {
    margin-right: 0.75rem;
  }
  .final li.winner {
    color: var(--accent);
  }

  /* Phone */
  .phone {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 0.5rem;
    padding: 0.5rem 0.5rem calc(0.75rem + env(safe-area-inset-bottom));
  }
  .phone .map {
    min-height: 0;
    border-radius: 0.75rem;
    overflow: hidden;
    background: rgb(0 0 0 / 0.2);
  }
  .panel {
    display: grid;
    gap: 0.6rem;
  }
  .panel h2 {
    margin: 0;
  }
  .place {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: center;
  }
  .tile-button {
    position: relative;
    padding: 0;
    background: none;
    border-radius: 0.4rem;
  }
  .tile-button img {
    width: 6.5rem;
    height: 6.5rem;
    display: block;
    border-radius: 0.3rem;
    box-shadow: 0 0.2rem 0.8rem rgb(0 0 0 / 0.4);
  }
  .tile-button span {
    position: absolute;
    right: -0.4rem;
    bottom: -0.4rem;
    background: var(--accent);
    color: #231a05;
    border-radius: 50%;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    font-size: 1.2rem;
  }
  .place-actions {
    display: grid;
    gap: 0.5rem;
  }
  .hint {
    margin: 0;
    color: var(--muted);
  }
  .follow-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .waiting-turn {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .waiting-turn img {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 0.2rem;
  }
  .layouts {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }
  .status {
    margin: 0;
    font-size: 1.2rem;
  }
  .draw-prompt {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }
  .draw-prompt p {
    margin: 0;
  }
  .fly-in {
    animation: fly-in 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.1);
  }
  @keyframes fly-in {
    from {
      opacity: 0;
      transform: translate(-30vw, -18vh) scale(0.4) rotate(-20deg);
    }
  }
  .shake {
    animation: shake 0.4s;
  }
  @keyframes shake {
    20%,
    60% {
      transform: translateX(-0.4rem);
    }
    40%,
    80% {
      transform: translateX(0.4rem);
    }
  }
  .problem {
    color: #ffb3a8;
  }
  .tile-button {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .tile-button img {
    -webkit-user-drag: none;
    pointer-events: none;
  }
  .tile-button.dragging {
    opacity: 0.35;
  }
  .floating {
    position: fixed;
    width: 5.5rem;
    height: 5.5rem;
    transform: translate(-50%, -50%) rotate(4deg);
    pointer-events: none;
    border-radius: 0.3rem;
    box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.55);
    z-index: 30;
  }
  .toasts {
    top: 0.75rem;
    bottom: auto;
  }
  .admin {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
