/**
 * PostgreSQL API controllers
 */
import { PostgreSQLService } from '@/services/postgresql';
import {
  validateRequestBody,
  validateQueryParams,
} from '@/middleware/validation';
import { logger } from '@/utils/logger';
import {
  SqlRequestSchema,
  CreateDirectoryRequestSchema,
  DeleteDirectoryRequestSchema,
  CreateObjectRequestSchema,
  CreatePropertyRequestSchema,
  UpdateObjectRequestSchema,
  DeleteObjectRequestSchema,
  GenerateDummyRequestSchema,
} from '@/types/requests';
import { z } from 'zod';

const postgresqlService = new PostgreSQLService();

/**
 * Execute SQL query
 */
export async function executeSql(request: Request): Promise<unknown[]> {
  logger.info('SQL execution requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(SqlRequestSchema, body);
  return postgresqlService.executeSql(validatedRequest);
}

/**
 * Get all tables (directories)
 */
export async function getDirectories(request: Request): Promise<string[]> {
  logger.info('Directories list requested');
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const schema = z.object({
    driver: z.string().url(),
  });

  const validatedParams = validateQueryParams(schema, params);
  return postgresqlService.getDirectories(validatedParams);
}

/**
 * Create a new table (directory)
 */
export async function createDirectory(request: Request): Promise<void> {
  logger.info('Directory creation requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(
    CreateDirectoryRequestSchema,
    body
  );
  const requestWithDefaults = {
    ...validatedRequest,
    properties: validatedRequest.properties || [],
  };
  return postgresqlService.createDirectory(requestWithDefaults);
}

/**
 * Delete a table (directory)
 */
export async function deleteDirectory(request: Request): Promise<void> {
  logger.info('Directory deletion requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(
    DeleteDirectoryRequestSchema,
    body
  );
  return postgresqlService.deleteDirectory(validatedRequest);
}

/**
 * Get table data (objects)
 */
export async function getObjects(request: Request): Promise<unknown> {
  logger.info('Objects list requested');
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const schema = z.object({
    directory: z.string().min(1),
    cursor: z.number().int().min(0).optional().default(0),
    limit: z.number().int().min(1).max(100).optional().default(10),
    driver: z.string().url(),
  });

  const validatedParams = validateQueryParams(schema, params);
  const requestWithDefaults = {
    ...validatedParams,
    cursor: validatedParams.cursor || 0,
    limit: validatedParams.limit || 10,
  };
  return postgresqlService.getObjects(requestWithDefaults);
}

/**
 * Create a new row (object)
 */
export async function createObject(request: Request): Promise<void> {
  logger.info('Object creation requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(CreateObjectRequestSchema, body);
  const requestWithDefaults = {
    ...validatedRequest,
    properties: validatedRequest.properties || {},
  };
  return postgresqlService.createObject(requestWithDefaults);
}

/**
 * Add a new column (property)
 */
export async function createProperty(request: Request): Promise<void> {
  logger.info('Property creation requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(
    CreatePropertyRequestSchema,
    body
  );
  return postgresqlService.createProperty(validatedRequest);
}

/**
 * Update a row (object)
 */
export async function updateObject(request: Request): Promise<void> {
  logger.info('Object update requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(UpdateObjectRequestSchema, body);
  return postgresqlService.updateObject(validatedRequest);
}

/**
 * Delete rows (objects)
 */
export async function deleteObjects(request: Request): Promise<void> {
  logger.info('Objects deletion requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(DeleteObjectRequestSchema, body);
  return postgresqlService.deleteObjects(validatedRequest);
}

/**
 * Generate dummy data
 */
export async function generateDummy(request: Request): Promise<void> {
  logger.info('Dummy data generation requested');
  const body = await request.json();
  const validatedRequest = validateRequestBody(
    GenerateDummyRequestSchema,
    body
  );
  return postgresqlService.generateDummy(validatedRequest);
}
