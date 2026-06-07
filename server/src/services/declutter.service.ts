import { Injectable } from '@nestjs/common';
import { JOBS_ASSET_PAGINATION_SIZE } from 'src/constants';
import { OnJob } from 'src/decorators';
import { DeclutterConfirmDto, DeclutterGroupDto, DeclutterStatusDto, DeclutterUpdateGroupDto } from 'src/dtos/declutter.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AssetStatus, DeclutterGroupStatus, JobName, JobStatus, Permission, QueueName } from 'src/enum';
import { NewDeclutterGroup } from 'src/repositories/declutter.repository';
import { BaseService } from 'src/services/base.service';
import { IDeclutterJob, JobOf } from 'src/types';

/** CLIP cosine distance threshold for "similar but not identical" grouping */
const SIMILAR_MAX_DISTANCE = 0.06;

/** Temporal burst window in seconds */
const BURST_WINDOW_SECONDS = 30;

/** Minimum group size to be worth reviewing */
const MIN_GROUP_SIZE = 2;

function qualityScore(width: number | null, height: number | null): number {
  return (width ?? 0) * (height ?? 0);
}

@Injectable()
export class DeclutterService extends BaseService {
  async getStatus(auth: AuthDto): Promise<DeclutterStatusDto> {
    const userId = auth.user.id;
    const [pendingCount, isRunning, coverage] = await Promise.all([
      this.declutterRepository.countPending(userId),
      this.jobRepository.isActive(QueueName.SimilarDeclutter),
      this.declutterRepository.countEmbeddingCoverage(userId),
    ]);

    const embeddingCoverage = coverage.total === 0 ? 1 : coverage.withEmbedding / coverage.total;

    return { pendingCount, isRunning, embeddingCoverage };
  }

  async runJob(auth: AuthDto): Promise<void> {
    const isRunning = await this.jobRepository.isActive(QueueName.SimilarDeclutter);
    if (isRunning) {
      return;
    }
    await this.jobRepository.queue({ name: JobName.SimilarDeclutter, data: { userId: auth.user.id } });
  }

  async getPendingGroups(auth: AuthDto): Promise<DeclutterGroupDto[]> {
    const groups = await this.declutterRepository.getPendingGroups(auth.user.id);

    const result: DeclutterGroupDto[] = [];
    for (const group of groups) {
      const assets = await this.assetRepository.getByIds(group.assetIds);
      result.push({
        id: group.id,
        status: group.status,
        createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : String(group.createdAt),
        reviewedAt: group.reviewedAt instanceof Date ? group.reviewedAt.toISOString() : null,
        recommendedAssetId: group.recommendedAssetId,
        assets: assets.map((a) => ({
          id: a.id,
          thumbUrl: `/api/assets/${a.id}/thumbnail`,
          originalFileName: a.originalFileName ?? null,
          width: a.width ?? null,
          height: a.height ?? null,
          fileCreatedAt: a.fileCreatedAt instanceof Date ? a.fileCreatedAt.toISOString() : null,
        })),
      });
    }
    return result;
  }

  async updateGroupStatus(auth: AuthDto, groupId: string, dto: DeclutterUpdateGroupDto): Promise<void> {
    await this.declutterRepository.updateStatus(groupId, dto.status, auth.user.id);
  }

  async confirmDecisions(auth: AuthDto, dto: DeclutterConfirmDto): Promise<void> {
    const trashIds = dto.decisions.filter((d) => d.action === 'trash').map((d) => d.assetId);

    if (trashIds.length > 0) {
      await this.requireAccess({ auth, permission: Permission.AssetDelete, ids: trashIds });
      await this.assetRepository.updateAll(trashIds, {
        deletedAt: new Date(),
        status: AssetStatus.Trashed,
      });
      await this.eventRepository.emit('AssetTrashAll', { assetIds: trashIds, userId: auth.user.id });
    }
  }

  @OnJob({ name: JobName.SimilarDeclutterQueueAll, queue: QueueName.SimilarDeclutter })
  async handleQueueSimilarDeclutter(_data: JobOf<JobName.SimilarDeclutterQueueAll>): Promise<JobStatus> {
    const users = await this.userRepository.getList({ withDeleted: false });
    for (const user of users) {
      await this.jobRepository.queue({ name: JobName.SimilarDeclutter, data: { userId: user.id } });
    }
    return JobStatus.Success;
  }

  @OnJob({ name: JobName.SimilarDeclutter, queue: QueueName.SimilarDeclutter })
  async handleSimilarDeclutter({ userId }: JobOf<JobName.SimilarDeclutter>): Promise<JobStatus> {
    this.logger.log(`Starting similar declutter scan for user ${userId}`);

    const alreadyGrouped = await this.declutterRepository.getGroupedPendingAssetIds(userId);

    // Union-find structures
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      if (!parent.has(x)) parent.set(x, x);
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      // path compression
      let cur = x;
      while (cur !== root) {
        const next = parent.get(cur)!;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const union = (a: string, b: string) => {
      parent.set(find(a), find(b));
    };

    // Metadata map for quality scoring
    const assetMeta = new Map<string, { width: number | null; height: number | null; embedding: string; fileCreatedAt: Date | null; type: string }>();

    let processed = 0;
    const assets = this.declutterRepository.streamAssetsForDeclutter(userId);
    for await (const asset of assets) {
      if (alreadyGrouped.has(asset.id)) {
        continue;
      }

      assetMeta.set(asset.id, {
        width: asset.width ?? null,
        height: asset.height ?? null,
        embedding: asset.embedding as string,
        fileCreatedAt: asset.fileCreatedAt instanceof Date ? asset.fileCreatedAt : null,
        type: asset.type as string,
      });

      // Initialize in union-find
      find(asset.id);

      processed++;
    }

    if (processed === 0) {
      this.logger.log(`No unprocessed assets found for user ${userId}`);
      return JobStatus.Skipped;
    }

    this.logger.log(`Scanning ${processed} assets for similar groups`);

    // Find similar pairs via vector search
    let pairCount = 0;
    for (const [assetId, meta] of assetMeta) {
      if (!meta.embedding) continue;

      const similar = await this.declutterRepository.searchSimilar({
        assetId,
        embedding: meta.embedding,
        maxDistance: SIMILAR_MAX_DISTANCE,
        type: meta.type as any,
        userId,
      });

      for (const result of similar) {
        if (!assetMeta.has(result.assetId)) continue;

        const otherMeta = assetMeta.get(result.assetId)!;

        // Temporal burst check: only group if within BURST_WINDOW_SECONDS or very similar
        const timeDiffSeconds =
          meta.fileCreatedAt && otherMeta.fileCreatedAt
            ? Math.abs(meta.fileCreatedAt.getTime() - otherMeta.fileCreatedAt.getTime()) / 1000
            : 0;

        const isBurst = timeDiffSeconds <= BURST_WINDOW_SECONDS;
        const isVeryClose = result.distance <= SIMILAR_MAX_DISTANCE * 0.5;

        if (isBurst || isVeryClose) {
          union(assetId, result.assetId);
          pairCount++;
        }
      }
    }

    this.logger.log(`Found ${pairCount} similar pairs`);

    // Build clusters from union-find
    const clusters = new Map<string, string[]>();
    for (const assetId of assetMeta.keys()) {
      const root = find(assetId);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(assetId);
    }

    // Create groups for clusters with >1 asset
    const newGroups: NewDeclutterGroup[] = [];
    for (const [, members] of clusters) {
      if (members.length < MIN_GROUP_SIZE) continue;

      // Pick recommended: highest quality score (width * height)
      const recommended = members.reduce((best, id) => {
        const meta = assetMeta.get(id);
        const bestMeta = assetMeta.get(best);
        return qualityScore(meta?.width ?? null, meta?.height ?? null) >=
          qualityScore(bestMeta?.width ?? null, bestMeta?.height ?? null)
          ? id
          : best;
      });

      newGroups.push({ userId, assetIds: members, recommendedAssetId: recommended });

      if (newGroups.length >= JOBS_ASSET_PAGINATION_SIZE) {
        await this.declutterRepository.saveGroups(newGroups);
        newGroups.length = 0;
      }
    }

    if (newGroups.length > 0) {
      await this.declutterRepository.saveGroups(newGroups);
    }

    this.logger.log(`Created ${clusters.size} similar groups for user ${userId}`);
    return JobStatus.Success;
  }
}
