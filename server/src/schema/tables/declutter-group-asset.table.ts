import { CreateDateColumn, ForeignKeyColumn, Generated, Table, Timestamp } from '@immich/sql-tools';
import { AssetTable } from 'src/schema/tables/asset.table';
import { DeclutterGroupTable } from 'src/schema/tables/declutter-group.table';

@Table('declutter_group_asset')
export class DeclutterGroupAssetTable {
  @ForeignKeyColumn(() => DeclutterGroupTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  groupId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  assetId!: string;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
