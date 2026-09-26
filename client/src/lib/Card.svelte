<script lang="ts">
  import type { CardView } from '@onemore/engine';

  let { card, size = 'md' }: { card: CardView; size?: 'sm' | 'md' | 'lg' } = $props();

  const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK: Record<string, string> = { T: '10' };

  let rank = $derived(card.def ? (RANK[card.def[0]!] ?? card.def[0]) : '');
  let suit = $derived(card.def ? SUIT[card.def[1]!] : '');
  let red = $derived(card.def ? card.def[1] === 'H' || card.def[1] === 'D' : false);
</script>

{#if card.def}
  <div class="card {size}" class:red aria-label="{rank}{suit}">
    <span class="corner">{rank}<br />{suit}</span>
    <span class="pip">{suit}</span>
  </div>
{:else}
  <div class="card back {size}" aria-label="face-down card"></div>
{/if}

<style>
  .card {
    --w: 4.2rem;
    width: var(--w);
    aspect-ratio: 5 / 7;
    border-radius: calc(var(--w) * 0.1);
    background: #fdfdf8;
    color: #1a1a1a;
    position: relative;
    box-shadow: 0 0.15rem 0.4rem rgb(0 0 0 / 0.35);
    flex: none;
    font-weight: 700;
    user-select: none;
  }
  .sm { --w: 2.8rem; }
  .lg { --w: 6rem; }
  .red { color: #c0262d; }
  .corner {
    position: absolute;
    top: 0.3em;
    left: 0.35em;
    font-size: calc(var(--w) * 0.24);
    line-height: 1;
    text-align: center;
  }
  .pip {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: calc(var(--w) * 0.5);
  }
  .back {
    background:
      repeating-linear-gradient(45deg, #1d4ed8 0 0.3rem, #1e40af 0.3rem 0.6rem);
    border: 0.2rem solid #fdfdf8;
  }
</style>
