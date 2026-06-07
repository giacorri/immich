import { createZodDto } from 'nestjs-zod';
import { DeclutterGroupStatus } from 'src/enum';
import z from 'zod';

const DeclutterGroupStatusSchema = z.nativeEnum(DeclutterGroupStatus);

const DeclutterGroupAssetSchema = z.object({
  id: z.string(),
  thumbUrl: z.string(),
  originalFileName: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  fileCreatedAt: z.string().nullable(),
});

const DeclutterGroupSchema = z.object({
  id: z.string(),
  status: DeclutterGroupStatusSchema,
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  recommendedAssetId: z.string().nullable(),
  assets: z.array(DeclutterGroupAssetSchema),
});

const DeclutterStatusSchema = z.object({
  pendingCount: z.number(),
  isRunning: z.boolean(),
  embeddingCoverage: z.number(),
});

const DeclutterUpdateGroupSchema = z.object({
  status: DeclutterGroupStatusSchema,
});

const DeclutterDecisionSchema = z.object({
  assetId: z.string(),
  action: z.enum(['keep', 'trash']),
});

const DeclutterConfirmSchema = z.object({
  decisions: z.array(DeclutterDecisionSchema),
});

export class DeclutterGroupAssetDto extends createZodDto(DeclutterGroupAssetSchema) {}
export class DeclutterGroupDto extends createZodDto(DeclutterGroupSchema) {}
export class DeclutterStatusDto extends createZodDto(DeclutterStatusSchema) {}
export class DeclutterUpdateGroupDto extends createZodDto(DeclutterUpdateGroupSchema) {}
export class DeclutterDecisionDto extends createZodDto(DeclutterDecisionSchema) {}
export class DeclutterConfirmDto extends createZodDto(DeclutterConfirmSchema) {}
