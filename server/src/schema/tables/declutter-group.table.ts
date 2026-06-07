import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { DeclutterGroupStatus } from 'src/enum';
import { declutter_group_status_enum } from 'src/schema/enums';
import { AssetTable } from 'src/schema/tables/asset.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('declutter_group')
@UpdatedAtTrigger('declutter_group_updatedAt')
@Index({ columns: ['userId', 'status'] })
export class DeclutterGroupTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
  userId!: string;

  @Column({ type: 'enum', enum: declutter_group_status_enum, default: DeclutterGroupStatus.Pending })
  status!: Generated<DeclutterGroupStatus>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  reviewedAt!: Timestamp | null;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'SET NULL', nullable: true })
  recommendedAssetId!: string | null;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
