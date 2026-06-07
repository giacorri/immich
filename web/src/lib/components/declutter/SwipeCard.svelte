<script lang="ts">
  import type { DeclutterAsset } from '$lib/api/declutter';

  interface Props {
    asset: DeclutterAsset;
    isRecommended: boolean;
    onDecide: (action: 'keep' | 'trash') => void;
  }

  let { asset, isRecommended, onDecide }: Props = $props();

  // Drag state
  let dragStartX = $state(0);
  let dragDeltaX = $state(0);
  let isDragging = $state(false);

  const SWIPE_THRESHOLD = 80;

  function getThumbnailUrl(id: string) {
    return `/api/assets/${id}/thumbnail?size=preview`;
  }

  function onPointerDown(e: PointerEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragDeltaX = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    dragDeltaX = e.clientX - dragStartX;
  }

  function onPointerUp(_e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    if (dragDeltaX > SWIPE_THRESHOLD) {
      onDecide('keep');
    } else if (dragDeltaX < -SWIPE_THRESHOLD) {
      onDecide('trash');
    }
    dragDeltaX = 0;
  }

  const cardStyle = $derived(
    isDragging
      ? `transform: translateX(${dragDeltaX}px) rotate(${dragDeltaX * 0.04}deg); transition: none;`
      : 'transform: translateX(0) rotate(0deg); transition: transform 0.2s ease;',
  );

  const overlayKeep = $derived(isDragging && dragDeltaX > 20);
  const overlayTrash = $derived(isDragging && dragDeltaX < -20);
</script>

<div class="relative select-none">
  <!-- Swipeable card -->
  <div
    class="relative cursor-grab overflow-hidden rounded-xl shadow-lg active:cursor-grabbing"
    style={cardStyle}
    role="button"
    tabindex="0"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <img
      src={getThumbnailUrl(asset.id)}
      alt={asset.originalFileName ?? asset.id}
      class="h-64 w-full object-cover"
      draggable="false"
    />

    <!-- Keep overlay -->
    {#if overlayKeep}
      <div class="absolute inset-0 flex items-center justify-center bg-green-500/40 text-4xl font-bold text-white">
        TIENI
      </div>
    {/if}

    <!-- Trash overlay -->
    {#if overlayTrash}
      <div class="absolute inset-0 flex items-center justify-center bg-red-500/40 text-4xl font-bold text-white">
        ELIMINA
      </div>
    {/if}

    <!-- Recommended badge -->
    {#if isRecommended}
      <div class="absolute top-2 left-2 rounded-full bg-immich-primary px-2 py-1 text-xs font-semibold text-white">
        ★ Consigliato
      </div>
    {/if}
  </div>

  <!-- Info bar -->
  <div class="mt-1 flex justify-between px-1 text-xs text-gray-500 dark:text-gray-400">
    <span>{asset.originalFileName ?? '—'}</span>
    {#if asset.width && asset.height}
      <span>{asset.width}×{asset.height}</span>
    {/if}
  </div>

  <!-- Button fallback (always visible) -->
  <div class="mt-2 flex gap-2">
    <button
      type="button"
      class="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600"
      onclick={() => onDecide('keep')}
    >
      Tieni
    </button>
    <button
      type="button"
      class="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600"
      onclick={() => onDecide('trash')}
    >
      Elimina
    </button>
  </div>
</div>
