<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import DeclutterGroupView from '$lib/components/declutter/DeclutterGroupView.svelte';
  import {
    confirmDecisions,
    getDeclutterGroups,
    getDeclutterStatus,
    runDeclutter,
    updateGroupStatus,
    type DeclutterDecision,
    type DeclutterGroup,
    type DeclutterStatus,
  } from '$lib/api/declutter';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();

  // ── state ────────────────────────────────────────────────────────────────
  let status = $state<DeclutterStatus>(data.status);
  let groups = $state<DeclutterGroup[]>([]);
  let currentGroupIndex = $state(0);
  let pendingDecisions = $state<DeclutterDecision[]>([]);
  let phase = $state<'idle' | 'loading' | 'reviewing' | 'confirm' | 'done'>('idle');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────
  async function refreshStatus() {
    status = await getDeclutterStatus();
  }

  async function startReview() {
    loading = true;
    error = null;
    try {
      phase = 'loading';
      groups = await getDeclutterGroups();
      if (groups.length === 0) {
        phase = 'done';
      } else {
        currentGroupIndex = 0;
        pendingDecisions = [];
        phase = 'reviewing';
      }
    } catch (e) {
      error = String(e);
      phase = 'idle';
    } finally {
      loading = false;
    }
  }

  async function triggerScan() {
    loading = true;
    error = null;
    try {
      await runDeclutter();
      await refreshStatus();
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function onGroupComplete(decisions: DeclutterDecision[], skipped: boolean) {
    if (skipped) {
      // Mark group skipped in DB (fire and forget)
      updateGroupStatus(groups[currentGroupIndex].id, 'skipped').catch(console.error);
    } else {
      pendingDecisions = [...pendingDecisions, ...decisions];
      updateGroupStatus(groups[currentGroupIndex].id, 'reviewed').catch(console.error);
    }

    if (currentGroupIndex + 1 < groups.length) {
      currentGroupIndex++;
    } else {
      phase = 'confirm';
    }
  }

  async function applyConfirm() {
    loading = true;
    error = null;
    try {
      await confirmDecisions(pendingDecisions);
      await refreshStatus();
      phase = 'done';
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  const trashList = $derived(pendingDecisions.filter((d) => d.action === 'trash'));
</script>

<UserPageLayout title="Similar Photo Cleanup">
  <div class="mx-auto w-full max-w-xl px-4 py-8">

    <!-- Error banner -->
    {#if error}
      <div class="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
        {error}
      </div>
    {/if}

    <!-- ── IDLE / HOME ─────────────────────────────────────────────────── -->
    {#if phase === 'idle'}
      <div class="flex flex-col gap-6 rounded-2xl border border-gray-200 p-6 dark:border-immich-dark-gray">
        <h2 class="text-lg font-semibold dark:text-white">Pulizia foto simili</h2>

        <!-- Stats -->
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-immich-dark-gray">
            <p class="text-gray-500">Gruppi in attesa</p>
            <p class="text-2xl font-bold dark:text-white">{status.pendingCount}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-immich-dark-gray">
            <p class="text-gray-500">Copertura CLIP</p>
            <p class="text-2xl font-bold dark:text-white">{Math.round(status.embeddingCoverage * 100)}%</p>
          </div>
        </div>

        {#if status.embeddingCoverage < 0.5}
          <p class="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            ⚠ Meno del 50% delle foto ha embeddings CLIP. Avvia prima il job "Smart Search" per risultati migliori.
          </p>
        {/if}

        <!-- Scan button -->
        {#if status.isRunning}
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <span class="animate-spin">⏳</span> Analisi in corso…
            <button
              type="button"
              class="ml-auto text-xs underline"
              onclick={refreshStatus}
            >
              Aggiorna
            </button>
          </div>
        {:else}
          <button
            type="button"
            disabled={loading}
            class="rounded-xl bg-immich-primary px-4 py-3 font-semibold text-white hover:bg-immich-primary/90 disabled:opacity-50"
            onclick={triggerScan}
          >
            🔍 Avvia analisi similarità
          </button>
        {/if}

        <!-- Review button -->
        {#if status.pendingCount > 0}
          <button
            type="button"
            disabled={loading}
            class="rounded-xl border border-immich-primary px-4 py-3 font-semibold text-immich-primary hover:bg-immich-primary/10 disabled:opacity-50"
            onclick={startReview}
          >
            ▶ Revisiona {status.pendingCount} gruppo{status.pendingCount !== 1 ? 'i' : ''}
          </button>
        {/if}
      </div>

    <!-- ── LOADING ─────────────────────────────────────────────────────── -->
    {:else if phase === 'loading'}
      <div class="flex items-center justify-center py-12 text-gray-500">
        <span class="animate-spin mr-2">⏳</span> Caricamento gruppi…
      </div>

    <!-- ── REVIEWING ──────────────────────────────────────────────────── -->
    {:else if phase === 'reviewing'}
      {#if groups[currentGroupIndex]}
        <DeclutterGroupView
          group={groups[currentGroupIndex]}
          groupIndex={currentGroupIndex}
          totalGroups={groups.length}
          {onGroupComplete}
        />
      {/if}

    <!-- ── CONFIRM ────────────────────────────────────────────────────── -->
    {:else if phase === 'confirm'}
      <div class="flex flex-col gap-4 rounded-2xl border border-gray-200 p-6 dark:border-immich-dark-gray">
        <h2 class="text-lg font-semibold dark:text-white">Riepilogo decisioni</h2>
        <p class="text-sm text-gray-500">
          {trashList.length} foto verranno spostate nel cestino.
          Il resto rimarrà nella libreria.
        </p>

        {#if trashList.length === 0}
          <p class="text-sm text-green-600 dark:text-green-400">Nessuna foto da eliminare.</p>
        {:else}
          <ul class="max-h-48 overflow-y-auto rounded-xl bg-gray-50 p-3 dark:bg-immich-dark-gray">
            {#each trashList as d (d.assetId)}
              {@const asset = groups.flatMap((g) => g.assets).find((a) => a.id === d.assetId)}
              <li class="flex items-center gap-2 py-1 text-sm">
                <img
                  src={`/api/assets/${d.assetId}/thumbnail?size=thumbnail`}
                  alt={asset?.originalFileName ?? d.assetId}
                  class="h-8 w-8 rounded object-cover"
                />
                <span class="truncate text-gray-700 dark:text-gray-300">
                  {asset?.originalFileName ?? d.assetId}
                </span>
              </li>
            {/each}
          </ul>
        {/if}

        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-xl border border-gray-300 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-immich-dark-gray"
            onclick={() => { phase = 'idle'; pendingDecisions = []; }}
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={loading}
            class="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            onclick={applyConfirm}
          >
            Conferma ed elimina {trashList.length > 0 ? trashList.length : ''} foto
          </button>
        </div>
      </div>

    <!-- ── DONE ───────────────────────────────────────────────────────── -->
    {:else if phase === 'done'}
      <div class="flex flex-col items-center gap-4 py-12 text-center">
        <span class="text-5xl">✅</span>
        <h2 class="text-lg font-semibold dark:text-white">Nessun gruppo da revisionare</h2>
        <p class="text-sm text-gray-500">Tutti i gruppi simili sono stati processati.</p>
        <button
          type="button"
          class="rounded-xl bg-immich-primary px-6 py-2 font-semibold text-white"
          onclick={() => { phase = 'idle'; refreshStatus(); }}
        >
          Torna alla home
        </button>
      </div>
    {/if}

  </div>
</UserPageLayout>
