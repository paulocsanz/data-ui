import { z } from 'zod';
import { SQL_CONSTRAINTS } from './database';

const BaseRequestSchema = z.object({
  drive: z.string(),
});

export const SqlRequestSchema = BaseRequestSchema.extend({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(10000, 'Query too long'),
});

export type SqlRequest = z.infer<typeof SqlRequestSchema>;

export const CreatePropertySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid column name'),
  type: z.string().min(1, 'Type is required'),
  default: z.string().optional(),
  constraint: z.enum(SQL_CONSTRAINTS).optional(),
});

export type CreateProperty = z.infer<typeof CreatePropertySchema>;

export const CreateDirectoryRequestSchema = BaseRequestSchema.extend({
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  properties: z.array(CreatePropertySchema).optional().default([]),
});

export type CreateDirectoryRequest = z.infer<
  typeof CreateDirectoryRequestSchema
>;

export const DeleteDirectoryRequestSchema = BaseRequestSchema.extend({
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
});

export type DeleteDirectoryRequest = z.infer<
  typeof DeleteDirectoryRequestSchema
>;

export const ObjectsRequestSchema = BaseRequestSchema.extend({
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  cursor: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export type ObjectsRequest = z.infer<typeof ObjectsRequestSchema>;

export interface ObjectsResponse {
  objects: Array<Record<string, unknown> | null>;
  propertyNames: string[];
  propertyTypes: string[];
  primaryKey: string | null;
  count: number;
  hasMore: boolean;
}

export const CreateObjectRequestSchema = BaseRequestSchema.extend({
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  properties: z.record(z.string(), z.string()).default({}),
  primaryKey: z.string().optional(),
});

export type CreateObjectRequest = z.infer<typeof CreateObjectRequestSchema>;

export const CreatePropertyRequestSchema = BaseRequestSchema.extend({
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  property: CreatePropertySchema,
});

export type CreatePropertyRequest = z.infer<typeof CreatePropertyRequestSchema>;

export const UpdateObjectRequestSchema = BaseRequestSchema.extend({
  id: z.union([z.string(), z.number()]),
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  properties: z
    .record(z.string(), z.string().nullable())
    .refine(
      (obj) => Object.keys(obj).length > 0,
      'At least one property must be updated'
    ),
});

export type UpdateObjectRequest = z.infer<typeof UpdateObjectRequestSchema>;

export const DeleteObjectRequestSchema = BaseRequestSchema.extend({
  ids: z
    .array(z.union([z.string(), z.number()]))
    .min(1, 'At least one ID must be provided'),
  directory: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
});

export type DeleteObjectRequest = z.infer<typeof DeleteObjectRequestSchema>;

export const GenerateDummyRequestSchema = BaseRequestSchema;

export type GenerateDummyRequest = z.infer<typeof GenerateDummyRequestSchema>;
