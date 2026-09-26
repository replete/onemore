<script lang="ts">
  import Home from './Home.svelte';
  import RoomPage from './RoomPage.svelte';
  import { normalizeCode } from './lib/codes';
  import { Session } from './lib/session.svelte';

  const session = new Session();
  let path = $state(location.pathname);

  function navigate(to: string) {
    history.pushState(null, '', to);
    path = to;
  }

  $effect(() => {
    const onPop = () => (path = location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  let code = $derived(normalizeCode(path.slice(1)));
</script>

{#if code}
  {#key code}
    <RoomPage {code} {session} />
  {/key}
{:else}
  <Home {session} {navigate} />
{/if}
