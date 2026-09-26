<script lang="ts">
  import QRCode from 'qrcode';

  let { text, label = '' }: { text: string; label?: string } = $props();
  let svg = $state('');

  $effect(() => {
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((s) => (svg = s));
  });
</script>

<figure class="qr">
  <div class="code" role="img" aria-label={label || text}>{@html svg}</div>
  {#if label}<figcaption>{label}</figcaption>{/if}
</figure>

<style>
  .qr {
    margin: 0;
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }
  .code {
    background: #fff;
    padding: 0.5rem;
    border-radius: 0.75rem;
    width: 100%;
    aspect-ratio: 1;
  }
  .code :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  figcaption {
    font-size: 0.9rem;
    opacity: 0.8;
    text-align: center;
  }
</style>
