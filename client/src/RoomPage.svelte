<script lang="ts">
  import Lobby from './Lobby.svelte';
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
  {:else}
    <TwentyOne {session} />
  {/if}
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
  .toast {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    margin: 0;
  }
</style>
