import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AssetType, DeclutterGroupStatus, VectorIndex } from 'src/enum';
import { probes } from 'src/repositories/database.repository';
import { DB } from 'src/schema';
import { DeclutterGroupAssetTable } from 'src/schema/tables/declutter-group-asset.table';
import { DeclutterGroupTable } from 'src/schema/tables/declutter-group.table';
import { asUuid, withDefaultVisibility } from 'src/utils/database';

const SIMILAR_SEARCH_LIMIT = 32;

export interface SimilarAssetResult {
  assetId: string;
  distance: number;
}

export interface SimilarSearchOptions {
  assetId: string;
  embedding: string;
  maxDistance: number;
  type: AssetType;
  userId: string;
}

export interface DeclutterGroupWithAssets {
  id: string;
  status: DeclutterGroupStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  recommendedAssetId: string | null;
  userId: string;
  assetIds: string[];
}

export interface NewDeclutterGroup {
  userId: string;
  recommendedAssetId: string | null;
  assetIds: string[];
}

@Injectable()
export class DeclutterRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({
    params: [{ assetId: DummyValue.UUID, embedding: DummyValue.VECTOR, maxDistance: 0.06, type: AssetType.Image, userId: DummyValue.UUID }],
  })
  async searchSimilar({ assetId, embedding, maxDistance, type, userId }: SimilarSearchOptions): Promise<SimilarAssetResult[]> {
    return this.db.transaction().execute(async (trx) => {
      await sql`set local vchordrq.probes = ${sql.lit(probes[VectorIndex.Clip])}`.execute(trx);
      return trx
        .with('cte', (qb) =>
          qb
            .selectFrom('asset')
            .$call(withDefaultVisibility)
            .select([
              'asset.id as assetId',
              sql<number>`smart_search.embedding <=> ${embedding}`.as('distance'),
            ])
            .innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
            .where('asset.ownerId', '=', asUuid(userId))
            .where('asset.deletedAt', 'is', null)
            .where('asset.type', '=', type)
            .where('asset.id', '!=', asUuid(assetId))
            .orderBy('distance')
            .limit(SIMILAR_SEARCH_LIMIT),
        )
        .selectFrom('cte')
        .selectAll()
        .where('cte.distance', '<=', maxDistance as number)
        .execute();
    });
  }

  @GenerateSql({ params: [DummyValue.UUID], stream: true })
  streamAssetsForDeclutter(userId: string) {
    return this.db
      .selectFrom('asset')
      .$call(withDefaultVisibility)
      .innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
      .where('asset.ownerId', '=', asUuid(userId))
      .where('asset.deletedAt', 'is', null)
      .where('asset.stackId', 'is', null)
      .select(['asset.id', 'asset.type', 'asset.fileCreatedAt', 'asset.width', 'asset.height', 'smart_search.embedding'])
      .stream();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getGroupedPendingAssetIds(userId: string): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('declutter_group_asset')
      .select('declutter_group_asset.assetId')
      .innerJoin('declutter_group', 'declutter_group.id', 'declutter_group_asset.groupId')
      .where('declutter_group.userId', '=', asUuid(userId))
      .where('declutter_group.status', '=', DeclutterGroupStatus.Pending)
      .execute();
    return new Set(rows.map((r) => r.assetId));
  }

  async saveGroups(groups: NewDeclutterGroup[]): Promise<void> {
    if (groups.length === 0) {
      return;
    }

    for (const group of groups) {
      const inserted = await this.db
        .insertInto('declutter_group')
        .values({
          userId: group.userId,
          recommendedAssetId: group.recommendedAssetId ?? null,
          status: DeclutterGroupStatus.Pending,
        } as Insertable<DeclutterGroupTable>)
        .returning('id')
        .executeTakeFirstOrThrow();

      await this.db
        .insertInto('declutter_group_asset')
        .values(
          group.assetIds.map((assetId) => ({ groupId: inserted.id, assetId } as Insertable<DeclutterGroupAssetTable>)),
        )
        .execute();
    }
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getPendingGroups(userId: string): Promise<DeclutterGroupWithAssets[]> {
    const groups = await this.db
      .selectFrom('declutter_group')
      .selectAll('declutter_group')
      .where('declutter_group.userId', '=', asUuid(userId))
      .where('declutter_group.status', '=', DeclutterGroupStatus.Pending)
      .orderBy('declutter_group.createdAt', 'asc')
      .execute();

    const result: DeclutterGroupWithAssets[] = [];
    for (const group of groups) {
      const assetRows = await this.db
        .selectFrom('declutter_group_asset')
        .select('assetId')
        .where('groupId', '=', group.id)
        .execute();

      result.push({
        id: group.id,
        status: group.status as DeclutterGroupStatus,
        createdAt: group.createdAt as unknown as Date,  // Kysely returns Date from pg driver
        reviewedAt: group.reviewedAt as unknown as Date | null,
        recommendedAssetId: group.recommendedAssetId ?? null,
        userId: group.userId,
        assetIds: assetRows.map((r) => r.assetId),
      });
    }

    return result;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async countPending(userId: string): Promise<number> {
    const result = await this.db
      .selectFrom('declutter_group')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('userId', '=', asUuid(userId))
      .where('status', '=', DeclutterGroupStatus.Pending)
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }

  @GenerateSql({ params: [DummyValue.UUID, DeclutterGroupStatus.Reviewed, DummyValue.UUID] })
  async updateStatus(groupId: string, status: DeclutterGroupStatus, userId: string): Promise<void> {
    const isResolved = status === DeclutterGroupStatus.Reviewed || status === DeclutterGroupStatus.Skipped;
    await this.db
      .updateTable('declutter_group')
      .set({
        status,
        reviewedAt: isResolved ? new Date() : null,
      })
      .where('id', '=', asUuid(groupId))
      .where('userId', '=', asUuid(userId))
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async countEmbeddingCoverage(userId: string): Promise<{ total: number; withEmbedding: number }> {
    const [totalRow, embeddingRow] = await Promise.all([
      this.db
        .selectFrom('asset')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('ownerId', '=', asUuid(userId))
        .where('deletedAt', 'is', null)
        .where('type', '=', AssetType.Image)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('asset')
        .innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('asset.ownerId', '=', asUuid(userId))
        .where('asset.deletedAt', 'is', null)
        .where('asset.type', '=', AssetType.Image)
        .executeTakeFirstOrThrow(),
    ]);

    return { total: Number(totalRow.count), withEmbedding: Number(embeddingRow.count) };
  }
}
