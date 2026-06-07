<script lang="ts">
  import type { DeclutterDecision, DeclutterGroup } from '$lib/api/declutter';
  import SwipeCard from './SwipeCard.svelte';

  interface Props {
    group: DeclutterGroup;
    groupIndex: number;
    totalGroups: number;
    onGroupComplete: (decisions: DeclutterDecision[], skipped: boolean) => void;
  }

  let { group, groupIndex, totalGroups, onGroupComplete }: Props = $props();

  // Track decisions for current group: assetId → 'keep' | 'trash' | null
  let decisions = $state<Record<string, 'keep' | 'trash'>>(
    Object.fromEntries(group.assets.map((a) => [a.id, 'keep'])),
  );
  // Which asset card is currently "focused" for swipe
  let currentAssetIndex = $state(0);

  const currentAsset = $derived(group.assets[currentAssetIndex]);
  const pendingAssets = $derived(
    group.assets.filter((a) => decisions[a.id] !== 'trash'),
  );

  function onDecide(action: 'keep' | 'trash') {
    const assetId = currentAsset?.id;
    if (!assetId) return;

    // Can't trash the last remaining asset
    const trashCount = Object.values(decisions).filter((v) => v === 'trash').length;
    if (action === 'trash' && trashCount >= group.assets.length - 1) {
      // Already at minimum — skip to next or finish
      advance();
      return;
    }

    decisions = { ...decisions, [assetId]: action };
    advance();
  }

  function advance() {
    if (currentAssetIndex < group.assets.length - 1) {
      currentAssetIndex++;
    } else {
      // All cards seen — complete the group
      const result: DeclutterDecision[] = group.assets.map((a) => ({
        assetId: a.id,
        action: decisions[a.id] ?? 'keep',
      }));
      onGroupComplete(result, false);
    }
  }

  function skipGroup() {
    onGroupComplete([], true);
  }
</script>

<div class="mx-auto flex max-w-sm flex-col gap-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <span class="text-sm text-gray-500 dark:text-gray-400">
      Gruppo {groupIndex + 1} / {totalGroups} — {group.assets.length} foto simili
    </span>
    <button
      type="button"
      class="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      onclick={skipGroup}
    >
      Salta →
    </button>
  </div>

  <!-- Progress dots -->
  <div class="flex justify-center gap-1">
    {#each group.assets as _, i (i)}
      <span
        class="h-2 w-2 rounded-full {i === currentAssetIndex
          ? 'bg-immich-primary'
          : decisions[group.assets[i].id] === 'trash'
            ? 'bg-red-400'
            : 'bg-gray-300 dark:bg-gray-600'}"
      ></span>
    {/each}
  </div>

  <!-- Swipe card for current asset -->
  {#if currentAsset}
    <SwipeCard
      asset={currentAsset}
      isRecommended={currentAsset.id === group.recommendedAssetId}
      {onDecide}
    />
  {/if}

  <!-- Summary row: decisions so far -->
  <div class="flex flex-wrap gap-2">
    {#each group.assets as asset (asset.id)}
      <div
        class="flex items-center gap-1 rounded-full px-2 py-1 text-xs
          {decisions[asset.id] === 'trash'
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}"
      >
        <span>{decisions[asset.id] === 'trash' ? '✕' : '✓'}</span>
        <span class="max-w-[8rem] truncate">{asset.originalFileName ?? asset.id.slice(0, 8)}</span>
      </div>
    {/each}
  </div>
</div>
