<script lang="ts">
  import { normalizeCode } from './lib/codes';
  import { keepAwake, type Session } from './lib/session.svelte';

  let { session, navigate }: { session: Session; navigate: (to: string) => void } = $props();

  let typed = $state('');
  let busy = $state(false);
  let problem = $state('');
  let code = $derived(normalizeCode(typed));

  async function start() {
    busy = true;
    problem = '';
    try {
      const created = await session.create({});
      keepAwake();
      navigate(`/${created}`);
    } catch {
      problem = 'Couldn’t reach the server. Is it running?';
    } finally {
      busy = false;
    }
  }

  function join(e: SubmitEvent) {
    e.preventDefault();
    if (code) navigate(`/${code}`);
  }
</script>

<main>
  <h1>One More</h1>
  <p class="tagline">The games everyone knows. No box, no shuffling. Scan and play.</p>

  <button class="start" onclick={start} disabled={busy}>Start a room</button>

  <form onsubmit={join}>
    <label for="code">Have a code?</label>
    <div class="row">
      <input
        id="code"
        bind:value={typed}
        placeholder="kfp-nwt-hdz"
        autocapitalize="none"
        autocomplete="off"
        spellcheck="false"
        class="code"
      />
      <button type="submit" class="secondary" disabled={!code}>Join</button>
    </div>
  </form>

  {#if problem}<p class="error">{problem}</p>{/if}
</main>

<style>
  main {
    max-width: 26rem;
    margin: 0 auto;
    padding: 12vh 1.25rem 2rem;
    display: grid;
    gap: 1.25rem;
  }
  h1 {
    font-size: clamp(2.5rem, 12vw, 4rem);
    margin: 0;
    letter-spacing: -0.02em;
  }
  .tagline {
    margin: 0;
    color: var(--muted);
  }
  .start {
    font-size: 1.2rem;
    padding: 1rem;
  }
  form {
    display: grid;
    gap: 0.5rem;
  }
  label {
    color: var(--muted);
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
</style>
