import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE "declutter_group_status_enum" AS ENUM ('pending', 'reviewed', 'skipped')`.execute(db);

  await sql`
    CREATE TABLE "declutter_group" (
      "id"                  uuid         PRIMARY KEY DEFAULT immich_uuid_v7(),
      "createdAt"           timestamptz  NOT NULL DEFAULT now(),
      "updatedAt"           timestamptz  NOT NULL DEFAULT now(),
      "userId"              uuid         NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "status"              "declutter_group_status_enum" NOT NULL DEFAULT 'pending',
      "reviewedAt"          timestamptz,
      "recommendedAssetId"  uuid         REFERENCES "assets" ("id") ON DELETE SET NULL,
      "updateId"            uuid         NOT NULL DEFAULT immich_uuid_v7()
    )
  `.execute(db);

  await sql`CREATE INDEX "IDX_declutter_group_userId_status" ON "declutter_group" ("userId", "status")`.execute(db);
  await sql`CREATE INDEX "IDX_declutter_group_updateId" ON "declutter_group" ("updateId")`.execute(db);

  await sql`
    CREATE OR REPLACE TRIGGER "declutter_group_updatedAt"
    BEFORE UPDATE ON "declutter_group"
    FOR EACH ROW EXECUTE FUNCTION updated_at()
  `.execute(db);

  await sql`
    CREATE TABLE "declutter_group_asset" (
      "groupId"    uuid  NOT NULL REFERENCES "declutter_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "assetId"    uuid  NOT NULL REFERENCES "assets" ("id")          ON DELETE CASCADE ON UPDATE CASCADE,
      "createdAt"  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("groupId", "assetId")
    )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "declutter_group_asset"`.execute(db);
  await sql`DROP TABLE IF EXISTS "declutter_group"`.execute(db);
  await sql`DROP TYPE IF EXISTS "declutter_group_status_enum"`.execute(db);
}
