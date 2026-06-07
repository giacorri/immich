import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { DeclutterGroupStatus } from 'src/enum';

export class DeclutterGroupAssetDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  thumbUrl!: string;

  @ApiProperty({ nullable: true, type: String })
  originalFileName!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  width!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  height!: number | null;

  @ApiProperty({ nullable: true, type: String })
  fileCreatedAt!: string | null;
}

export class DeclutterGroupDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: DeclutterGroupStatus, enumName: 'DeclutterGroupStatus' })
  status!: DeclutterGroupStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ nullable: true, type: String })
  reviewedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  recommendedAssetId!: string | null;

  @ApiProperty({ type: [DeclutterGroupAssetDto] })
  assets!: DeclutterGroupAssetDto[];
}

export class DeclutterStatusDto {
  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  isRunning!: boolean;

  @ApiProperty()
  embeddingCoverage!: number;
}

export class DeclutterUpdateGroupDto {
  @ApiProperty({ enum: DeclutterGroupStatus, enumName: 'DeclutterGroupStatus' })
  @IsEnum(DeclutterGroupStatus)
  status!: DeclutterGroupStatus;
}

export class DeclutterDecisionDto {
  @ApiProperty()
  @IsString()
  assetId!: string;

  @ApiProperty({ enum: ['keep', 'trash'] })
  action!: 'keep' | 'trash';
}

export class DeclutterConfirmDto {
  @ApiProperty({ type: [DeclutterDecisionDto] })
  decisions!: DeclutterDecisionDto[];
}
