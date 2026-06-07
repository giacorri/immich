// Hand-written API client for the declutter endpoints (not in auto-generated SDK)

export interface DeclutterAsset {
  id: string;
  thumbUrl: string;
  originalFileName: string | null;
  width: number | null;
  height: number | null;
  fileCreatedAt: string | null;
}

export interface DeclutterGroup {
  id: string;
  status: 'pending' | 'reviewed' | 'skipped';
  createdAt: string;
  reviewedAt: string | null;
  recommendedAssetId: string | null;
  assets: DeclutterAsset[];
}

export interface DeclutterStatus {
  pendingCount: number;
  isRunning: boolean;
  embeddingCoverage: number;
}

export interface DeclutterDecision {
  assetId: string;
  action: 'keep' | 'trash';
}

const base = '/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`Declutter API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const getDeclutterStatus = (): Promise<DeclutterStatus> =>
  apiFetch('/declutter/status');

export const runDeclutter = (): Promise<void> =>
  apiFetch('/declutter/run', { method: 'POST' });

export const getDeclutterGroups = (): Promise<DeclutterGroup[]> =>
  apiFetch('/declutter/groups');

export const updateGroupStatus = (groupId: string, status: 'reviewed' | 'skipped'): Promise<void> =>
  apiFetch(`/declutter/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const confirmDecisions = (decisions: DeclutterDecision[]): Promise<void> =>
  apiFetch('/declutter/confirm', {
    method: 'POST',
    body: JSON.stringify({ decisions }),
  });
