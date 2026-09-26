<script lang="ts">
  import type { TwentyOneView } from '@onemore/twenty-one';
  import Card from '../lib/Card.svelte';
  import { joinUrl } from '../lib/codes';
  import type { Session } from '../lib/session.svelte';

  let { session }: { session: Session } = $props();

  let room = $derived(session.room!);
  let message = $derived(session.view);
  let view = $derived(message?.view as TwentyOneView | undefined);
  let you = $derived(room.you);
  let isScreen = $derived(you.role === 'screen' || !you.seat);
  let names = $derived(Object.fromEntries(room.participants.filter((p) => p.seat).map((p) => [p.seat!, p.name])));
  let away = $derived(new Set(room.participants.filter((p) => p.seat && !p.connected).map((p) => p.seat!)));
  let mine = $derived(view?.seats.find((s) => s.seat === you.seat));
  let decisions = $derived(message?.decisions ?? []);

  // Countdowns for absent players, in server time (D-026).
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });
  const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - (now + session.clockOffset)) / 1000));

  const STATUS: Record<string, string> = {
    playing: '',
    stood: 'Stands',
    bust: 'Bust',
    'twenty-one': '21!',
    natural: '21 — natural!',
  };
  const RESULT: Record<string, string> = { win: 'Wins', lose: 'Loses', push: 'Push' };

  function choose(decision: string, option: string) {
    session.act(decision, { option });
  }
</script>

{#if !view}
  <p class="centered">Dealing…</p>
{:else if isScreen}
  <!-- Shared screen: the whole table, public view only. -->
  <main class="table">
    <section class="dealer">
      <h2>Dealer <span class="total">{view.dealer.total}</span></h2>
      <div class="cards">
        {#each view.dealer.cards as card (card.ref)}<Card {card} size="lg" />{/each}
      </div>
      {#if view.dealer.bust}<p class="flag bust">Dealer busts</p>{/if}
    </section>

    <section class="seats">
      {#each view.seats as seat (seat.seat)}
        <article class="seat" class:turn={view.turn === seat.seat} class:away={away.has(seat.seat)}>
          <h3>{names[seat.seat] ?? seat.seat}</h3>
          <div class="cards">
            {#each seat.cards as card (card.ref)}<Card {card} />{/each}
          </div>
          <p class="total">{seat.total}</p>
          {#if seat.result}
            <p class="flag {seat.result}">{RESULT[seat.result]}</p>
          {:else if STATUS[seat.status]}
            <p class="flag">{STATUS[seat.status]}</p>
          {/if}
          {#each message!.waiting.filter((w) => w.seat === seat.seat) as w}
            <p class="flag waiting">Reconnecting… {secondsLeft(w.until)}s</p>
          {/each}
        </article>
      {/each}
    </section>

    <footer>
      {#if view.phase === 'done'}
        Round over. Deal again from any phone.
      {:else if view.turn}
        {names[view.turn]}'s turn
      {/if}
      <span class="code join">{joinUrl(room.code).replace(/^https?:\/\//, '')}</span>
    </footer>
  </main>
{:else}
  <!-- A player's phone: your hand and your choices. -->
  <main class="phone">
    <section class="mini-dealer">
      <span>Dealer</span>
      <div class="cards">
        {#each view.dealer.cards as card (card.ref)}<Card {card} size="sm" />{/each}
      </div>
      <span class="total">{view.dealer.total}</span>
    </section>

    {#if mine}
      <section class="hand">
        <div class="cards fan">
          {#each mine.cards as card (card.ref)}<Card {card} size="lg" />{/each}
        </div>
        <p class="big-total">{mine.total}</p>
        {#if mine.result}
          <p class="flag {mine.result}">{RESULT[mine.result]}</p>
        {:else if STATUS[mine.status]}
          <p class="flag">{STATUS[mine.status]}</p>
        {/if}
      </section>
    {/if}

    <section class="actions">
      {#each decisions as d (d.id)}
        {#if d.prompt.kind === 'choose'}
          <div class="buttons">
            {#each d.prompt.options as option (option.id)}
              <button onclick={() => choose(d.id, option.id)}>{option.label}</button>
            {/each}
          </div>
        {/if}
      {:else}
        {#if view.phase === 'playing' && view.turn}
          <p class="muted">Waiting for {names[view.turn]}…</p>
        {/if}
      {/each}

      {#if you.admin}
        {#each message!.waiting as w}
          <button class="secondary" onclick={() => session.admin({ type: 'skip', seat: w.seat })}>
            Stand for {names[w.seat]} now ({secondsLeft(w.until)}s)
          </button>
        {/each}
      {/if}
    </section>

    <section class="others">
      {#each view.seats.filter((s) => s.seat !== you.seat) as seat (seat.seat)}
        <div class="other" class:turn={view.turn === seat.seat} class:away={away.has(seat.seat)}>
          <span>{names[seat.seat]}</span>
          <span class="total">{seat.total}</span>
          <span class="muted">{seat.result ? RESULT[seat.result] : STATUS[seat.status]}</span>
        </div>
      {/each}
    </section>

    {#if you.admin}
      <button class="secondary small end" onclick={() => confirm('End this game and go back to the lobby?') && session.admin({ type: 'new-game' })}>
        End game
      </button>
    {/if}
  </main>
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
  .cards {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .total {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .flag {
    margin: 0;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.9rem;
  }
  .flag.win {
    color: var(--ok);
  }
  .flag.lose,
  .flag.bust {
    color: var(--danger);
  }
  .flag.waiting {
    color: var(--accent);
  }
  .away {
    opacity: 0.5;
  }

  /* Shared screen */
  .table {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 3vh;
    padding: 4vh 4vw 2vh;
  }
  .dealer {
    display: grid;
    justify-items: center;
    gap: 1rem;
  }
  .dealer h2 {
    margin: 0;
    font-size: 1.6rem;
  }
  .seats {
    display: flex;
    gap: 2vw;
    justify-content: center;
    align-items: start;
    flex-wrap: wrap;
  }
  .seat {
    background: var(--panel);
    border-radius: 1rem;
    padding: 1rem 1.25rem;
    min-width: 11rem;
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    border: 0.2rem solid transparent;
    transition: border-color 0.2s;
  }
  .seat.turn {
    border-color: var(--accent);
  }
  .seat h3 {
    margin: 0;
    font-size: 1.3rem;
  }
  .seat .total {
    margin: 0;
    font-size: 1.5rem;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.3rem;
    color: var(--muted);
  }
  .join {
    font-size: 1rem;
  }

  /* Phone */
  .phone {
    max-width: 28rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 2rem;
    display: grid;
    gap: 1.5rem;
    min-height: 100dvh;
    align-content: start;
  }
  .mini-dealer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--panel);
    border-radius: 0.75rem;
    padding: 0.5rem 0.75rem;
  }
  .mini-dealer .cards {
    justify-content: start;
    flex: 1;
  }
  .hand {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding-top: 1rem;
  }
  .fan {
    gap: 0;
  }
  .fan :global(.card + .card) {
    margin-left: -2.2rem;
  }
  .big-total {
    margin: 0;
    font-size: 3rem;
    font-weight: 800;
  }
  .actions {
    display: grid;
    gap: 0.75rem;
    min-height: 4rem;
  }
  .buttons {
    display: grid;
    grid-auto-flow: column;
    gap: 0.75rem;
  }
  .buttons button {
    font-size: 1.3rem;
    padding: 1.1rem;
  }
  .others {
    display: grid;
    gap: 0.4rem;
  }
  .other {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.75rem;
    background: var(--panel);
    border-radius: 0.6rem;
    padding: 0.5rem 0.75rem;
    border: 0.15rem solid transparent;
  }
  .other.turn {
    border-color: var(--accent);
  }
  .end {
    justify-self: center;
  }
</style>
