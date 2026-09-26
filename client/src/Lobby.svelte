<script lang="ts">
  import Qr from './lib/Qr.svelte';
  import { adminUrl, joinUrl } from './lib/codes';
  import type { Session } from './lib/session.svelte';

  let { session }: { session: Session } = $props();

  let room = $derived(session.room!);
  let you = $derived(room.you);
  let players = $derived(room.participants.filter((p) => p.role === 'player'));
  let screens = $derived(room.participants.filter((p) => p.role === 'screen'));
  let named = $state('');
  let game = $derived(room.games.find((g) => g.id === room.game)!);
  let canStart = $derived(players.length >= game.minSeats && players.length <= game.maxSeats);
  const seatsLabel = (min: number, max: number) => (min === max ? `${min} players` : `${min}–${max} players`);
</script>

{#if you.role === 'screen'}
  <!-- The shared screen: big QR codes to join, and who's here (D-020). -->
  <main class="screen">
    <section class="join">
      <h1>One More</h1>
      <p class="game">{game.name}</p>
      <p class="muted">{game.blurb} · {seatsLabel(game.minSeats, game.maxSeats)}</p>
      <Qr text={joinUrl(room.code)} label="Scan to join" />
      <p class="code big">{room.code}</p>
    </section>

    <section class="who">
      <h2>Players</h2>
      {#if players.length === 0}
        <p class="muted">Waiting for players to scan in…</p>
      {/if}
      <ul>
        {#each players as p (p.id)}
          <li class:away={!p.connected}>
            {p.name || 'Joining…'}
            {#if p.admin}<span class="badge admin">admin</span>{/if}
          </li>
        {/each}
      </ul>
      {#if you.admin}
        <div class="screen-games">
          {#each room.games as g (g.id)}
            <button
              class="small"
              class:secondary={g.id !== room.game}
              onclick={() => session.admin({ type: 'set-game', game: g.id })}>{g.name}</button
            >
          {/each}
        </div>
        {#each game.options as option (option.id)}
          <label class="option">
            <input
              type="checkbox"
              checked={room.options[option.id]}
              onchange={(e) => session.admin({ type: 'set-option', option: option.id, value: e.currentTarget.checked })}
            />
            <span><strong>{option.label}</strong></span>
          </label>
        {/each}
        <button onclick={() => session.admin({ type: 'start' })} disabled={!canStart}>
          {canStart ? 'Start game' : `Start game (${seatsLabel(game.minSeats, game.maxSeats)})`}
        </button>
      {/if}
      {#if room.adminCode}
        <div class="admin-qr">
          <Qr text={adminUrl(room.code, room.adminCode)} label="Scan to run the game (admin)" />
        </div>
      {/if}
    </section>
  </main>
{:else}
  <!-- A phone in the lobby. -->
  <main class="phone">
    <header>
      <span class="code">{room.code}</span>
      {#if you.admin}<span class="badge admin">admin</span>{/if}
    </header>

    {#if !you.name}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          session.setName(named);
        }}
      >
        <label for="name">Your name, to play</label>
        <input id="name" bind:value={named} maxlength="16" autocomplete="nickname" />
        <button type="submit" disabled={!named.trim()}>Play</button>
      </form>
    {:else}
      <p class="hello">You're in, {you.name}. Waiting for the game to start…</p>
    {/if}

    <section class="game-choice">
      <h2>Game</h2>
      {#if you.admin}
        <div class="games">
          {#each room.games as g (g.id)}
            <button
              class="game-card"
              class:chosen={g.id === room.game}
              aria-pressed={g.id === room.game}
              onclick={() => session.admin({ type: 'set-game', game: g.id })}
            >
              <strong>{g.name}</strong>
              <span>{g.blurb}</span>
              <small>{seatsLabel(g.minSeats, g.maxSeats)}</small>
            </button>
          {/each}
        </div>
        {#each game.options as option (option.id)}
          <label class="option">
            <input
              type="checkbox"
              checked={room.options[option.id]}
              onchange={(e) => session.admin({ type: 'set-option', option: option.id, value: e.currentTarget.checked })}
            />
            <span><strong>{option.label}</strong>{#if option.description}<br /><small>{option.description}</small>{/if}</span>
          </label>
        {/each}
      {:else}
        <p><strong>{game.name}</strong> · {seatsLabel(game.minSeats, game.maxSeats)}</p>
        {#each game.options as option (option.id)}
          <p class="muted">{option.label}: {room.options[option.id] ? 'on' : 'off'}</p>
        {/each}
      {/if}
    </section>

    {#if you.admin}
      <div class="actions">
        <button onclick={() => session.admin({ type: 'start' })} disabled={!canStart}>
          {canStart ? 'Start game' : `Start game (${seatsLabel(game.minSeats, game.maxSeats)})`}
        </button>
        <button class="secondary" onclick={() => session.admin({ type: 'make-screen' })}>
          Make this the shared screen
        </button>
      </div>
    {/if}

    <h2>Players</h2>
    <ul class="people">
      {#each players as p (p.id)}
        <li class:away={!p.connected}>
          <span>
            {p.name || 'Joining…'}
            {#if p.id === you.id}<span class="badge">you</span>{/if}
            {#if p.admin}<span class="badge admin">admin</span>{/if}
          </span>
          {#if you.admin && p.id !== you.id}
            <span class="tools">
              <button class="small secondary" onclick={() => session.admin({ type: 'make-screen', participant: p.id })}>Screen</button>
              {#if !p.admin}
                <button class="small secondary" onclick={() => session.admin({ type: 'make-admin', participant: p.id })}>Admin</button>
              {/if}
              <button class="small secondary" onclick={() => session.admin({ type: 'remove', participant: p.id })}>Remove</button>
            </span>
          {/if}
        </li>
      {/each}
    </ul>

    {#if screens.length > 0}
      <h2>Screens</h2>
      <ul class="people">
        {#each screens as p (p.id)}
          <li class:away={!p.connected}>
            <span>Shared screen {#if p.admin}<span class="badge admin">admin</span>{/if}</span>
            {#if you.admin}
              <button class="small secondary" onclick={() => session.admin({ type: 'make-player', participant: p.id })}>Make player</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if you.admin && screens.length === 0}
      <details>
        <summary>Invite people from this phone</summary>
        <Qr text={joinUrl(room.code)} label="Scan to join" />
      </details>
    {/if}
  </main>
{/if}

<style>
  .screen {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(16rem, 2fr) minmax(14rem, 1fr);
    gap: 4vw;
    padding: 5vh 5vw;
    align-items: start;
  }
  .join {
    display: grid;
    justify-items: center;
    gap: 1rem;
    max-width: 34rem;
    margin: 0 auto;
    width: 100%;
  }
  h1 {
    margin: 0;
    font-size: clamp(2rem, 5vw, 4rem);
  }
  .game {
    margin: 0;
    color: var(--accent);
    font-size: 1.5rem;
    font-weight: 700;
  }
  .big {
    font-size: clamp(1.5rem, 4vw, 3rem);
    margin: 0;
  }
  .who {
    display: grid;
    gap: 1rem;
  }
  .who ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 1.5rem;
    display: grid;
    gap: 0.4rem;
  }
  .screen-games {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .admin-qr {
    max-width: 11rem;
    margin-top: 2rem;
  }
  .muted {
    color: var(--muted);
  }
  .game-choice {
    display: grid;
    gap: 0.6rem;
  }
  .game-choice p {
    margin: 0;
  }
  .games {
    display: grid;
    gap: 0.5rem;
  }
  .game-card {
    display: grid;
    gap: 0.2rem;
    text-align: left;
    background: var(--panel);
    color: var(--ink);
    font-weight: 400;
    border: 0.15rem solid transparent;
  }
  .game-card.chosen {
    border-color: var(--accent);
  }
  .game-card small {
    color: var(--muted);
  }
  .option {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    background: var(--panel);
    border-radius: 0.6rem;
    padding: 0.6rem 0.75rem;
  }
  .option input {
    width: auto;
    margin-top: 0.2rem;
  }
  .option small {
    color: var(--muted);
  }
  .away {
    opacity: 0.45;
  }
  .phone {
    max-width: 28rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 3rem;
    display: grid;
    gap: 1rem;
  }
  header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--muted);
  }
  form {
    display: grid;
    gap: 0.5rem;
  }
  .hello {
    font-size: 1.1rem;
  }
  .actions {
    display: grid;
    gap: 0.5rem;
  }
  h2 {
    margin: 0.5rem 0 0;
    font-size: 1rem;
    color: var(--muted);
  }
  .people {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.4rem;
  }
  .people li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    background: var(--panel);
    border-radius: 0.6rem;
    padding: 0.55rem 0.75rem;
  }
  .tools {
    display: flex;
    gap: 0.3rem;
  }
  details {
    background: var(--panel);
    border-radius: 0.75rem;
    padding: 0.75rem;
  }
  summary {
    cursor: pointer;
  }
  @media (max-width: 48rem) {
    .screen {
      grid-template-columns: 1fr;
    }
  }
</style>
