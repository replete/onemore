<script lang="ts">
  import Lobby from './Lobby.svelte';
  import CarcassEon from './games/carcass/CarcassEon.svelte';
  import TwentyOne from './games/TwentyOne.svelte';
  import { keepAwake, type Session } from './lib/session.svelte';

  let { code, session }: { code: string; session: Session } = $props();

  const adminCode = new URLSearchParams(location.search).get('admin') ?? undefined;
  let checked = $state(false);
  let name = $state('');
  let busy = $state(false);
  let problem = $state('');

  // Already in this room (we just created it), or rejoin our seat with a saved token.
  $effect(() => {
    if (session.room?.code === code) {
      checked = true;
      return;
    }
    void session.resume(code).then(() => (checked = true));
  });

  async function join(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    problem = '';
    try {
      await session.join(code, { name, ...(adminCode ? { adminCode } : {}) });
      keepAwake();
      // Don't leave the admin code in the address bar or history.
      history.replaceState(null, '', `/${code}`);
    } catch {
      problem = 'That room doesn’t exist, or it has closed.';
    } finally {
      busy = false;
    }
  }
</script>

{#if session.status === 'reconnecting' || session.status === 'lost'}
  <div class="banner" role="status">
    {#if session.status === 'reconnecting'}
      Reconnecting…
    {:else}
      Connection lost. <button class="small" onclick={() => session.resume(code)}>Reconnect</button>
    {/if}
  </div>
{/if}

{#if session.room}
  {#if session.room.phase === 'lobby'}
    <Lobby {session} />
  {:else if session.room.game === 'carcass-eon'}
    <CarcassEon {session} />
  {:else}
    <TwentyOne {session} />
  {/if}
  {@const room = session.room}
  {@const you = room.you}
  {#if room.phase === 'playing' && you.role === 'player' && !you.seat}
    {@const free = room.participants.filter((p) => p.seat && !p.connected)}
    <aside class="sheet" aria-live="polite">
      {#if you.claiming}
        <p>Waiting for an admin to let you back in as <strong>{room.participants.find((p) => p.id === you.claiming)?.name}</strong>…</p>
      {:else if free.length}
        <p>A game is on. Were you playing? Pick your name to get your seat back:</p>
        <div class="row">
          {#each free as p (p.id)}
            <button onclick={() => session.claim(p.id)}>I’m {p.name}</button>
          {/each}
        </div>
      {:else}
        <p>A game is on. You can watch, and join the next one.</p>
      {/if}
    </aside>
  {/if}
  {#each room.claims ?? [] as c (c.from)}
    <aside class="sheet claim" role="alert">
      <p><strong>{c.fromName || 'Someone'}</strong> wants to rejoin as <strong>{c.targetName}</strong>.</p>
      <div class="row">
        <button onclick={() => session.admin({ type: 'approve-claim', participant: c.from })}>Let them in</button>
        <button class="secondary" onclick={() => session.admin({ type: 'deny-claim', participant: c.from })}>No</button>
      </div>
    </aside>
  {/each}
  {#if session.error}<p class="error toast">{session.error}</p>{/if}
{:else if !checked}
  <p class="centered">Connecting…</p>
{:else}
  <main>
    <p class="code big">{code}</p>
    <form onsubmit={join}>
      <label for="name">Your name</label>
      <input id="name" bind:value={name} maxlength="16" autocomplete="nickname" required />
      <button type="submit" disabled={busy || !name.trim()}>
        {adminCode ? 'Join as admin' : 'Join'}
      </button>
    </form>
    {#if problem}<p class="error">{problem}</p>{/if}
  </main>
{/if}

<style>
  main {
    max-width: 24rem;
    margin: 0 auto;
    padding: 14vh 1.25rem 2rem;
    display: grid;
    gap: 1rem;
  }
  form {
    display: grid;
    gap: 0.6rem;
  }
  label {
    color: var(--muted);
  }
  .big {
    font-size: 1.6rem;
    margin: 0;
    text-align: center;
  }
  .centered {
    text-align: center;
    padding-top: 30vh;
    color: var(--muted);
  }
  .banner {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #6b4a00;
    color: #fff3d6;
    text-align: center;
    padding: 0.5rem;
  }
  .sheet {
    position: fixed;
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
    z-index: 20;
    max-width: 30rem;
    margin: 0 auto;
    background: #1c2a23;
    border: 1px solid rgb(255 255 255 / 0.15);
    border-radius: 0.9rem;
    padding: 0.9rem 1rem;
    box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.5);
  }
  .sheet p {
    margin: 0 0 0.6rem;
  }
  .sheet.claim {
    border-color: var(--accent);
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .toast {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    margin: 0;
  }
</style>
