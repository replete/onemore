<script lang="ts">
  // The draw pile (D-040): its height shows how many tiles are left, so everyone can
  // see the end coming. On your turn only the top tile wiggles; tap it to draw, and it
  // slides off the stack into your hand beside it. Otherwise, tap it to see how many
  // are left.

  let {
    count,
    total = 71,
    active = false,
    onDraw,
  }: {
    count: number;
    total?: number;
    /** Someone's turn to draw: the top tile wiggles. */
    active?: boolean;
    /** Only on the phone whose turn it is: tapping the top tile draws it. */
    onDraw?: () => void;
  } = $props();

  let open = $state(false);

  // One layer per 6 tiles, and one per tile once it's nearly empty.
  let layers = $derived(count <= 8 ? count : Math.min(12, Math.ceil(count / 6)));
  let nearlyDone = $derived(count > 0 && count <= 10);

  function tap() {
    if (active && onDraw) onDraw();
    else open = !open;
  }
</script>

<div class="stack-wrap">
  {#if open}
    <div class="panel" role="status">
      <strong>{count}</strong> of {total} tiles left
      <div class="backs">
        {#each Array.from({ length: count }) as _, i (i)}<span></span>{/each}
      </div>
    </div>
  {/if}

  <button
    class="stack"
    class:drawable={active && onDraw}
    class:nearly={nearlyDone}
    aria-label={active && onDraw ? 'Draw a tile' : `${count} tiles left`}
    onclick={tap}
    disabled={count === 0}
  >
    {#each Array.from({ length: layers }) as _, i (i)}
      <span class="layer" class:top={i === layers - 1} class:wiggle={active && i === layers - 1} style="--i: {i}"></span>
    {/each}
    <span class="count">{count}</span>
  </button>
</div>

<style>
  .stack-wrap {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    display: grid;
    justify-items: start;
    gap: 0.4rem;
    z-index: 2;
  }
  .stack {
    position: relative;
    width: 4.2rem;
    height: 5.4rem;
    padding: 0;
    background: none;
    border-radius: 0.3rem;
  }
  .layer {
    position: absolute;
    left: 0;
    bottom: calc(var(--i) * 0.2rem);
    width: 4.2rem;
    height: 4.2rem;
    border-radius: 0.3rem;
    background: repeating-linear-gradient(45deg, #5b3b22 0 0.35rem, #6b4629 0.35rem 0.7rem);
    border: 0.12rem solid #f0e2c4;
    box-shadow: 0 0.1rem 0.25rem rgb(0 0 0 / 0.45);
  }
  .layer.wiggle {
    border-color: var(--accent);
    box-shadow: 0 0 0.9rem var(--accent);
    animation: wiggle 1.2s ease-in-out infinite;
  }
  .drawable {
    cursor: pointer;
  }
  .count {
    position: absolute;
    right: -0.5rem;
    top: -0.3rem;
    min-width: 1.7rem;
    padding: 0.1rem 0.35rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.75);
    color: var(--ink);
    font-size: 0.85rem;
    font-weight: 800;
  }
  .nearly .count {
    background: var(--danger);
  }
  .panel {
    background: rgb(0 0 0 / 0.8);
    border-radius: 0.6rem;
    padding: 0.5rem 0.7rem;
    max-width: 16rem;
    font-size: 0.9rem;
  }
  .backs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    margin-top: 0.35rem;
  }
  .backs span {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 0.1rem;
    background: #6b4629;
    border: 1px solid #f0e2c4;
  }
  @keyframes wiggle {
    0%,
    100% {
      transform: rotate(0);
    }
    15% {
      transform: rotate(-5deg) translateY(-0.25rem);
    }
    30% {
      transform: rotate(5deg) translateY(-0.25rem);
    }
    45% {
      transform: rotate(0);
    }
  }
</style>
