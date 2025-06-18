import { z } from 'zod';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      logger.debug('Request validation failed', { errors: error.errors });
      throw new ValidationError(`Validation failed: ${details}`);
    }
    throw new ValidationError('Invalid request format');
  }
}

export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  params: Record<string, string>
): T {
  try {
    // Convert query parameters to appropriate types
    const processedParams: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      // Try to parse numbers
      if (/^\d+$/.test(value)) {
        processedParams[key] = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        processedParams[key] = parseFloat(value);
      } else if (value === 'true' || value === 'false') {
        processedParams[key] = value === 'true';
      } else {
        processedParams[key] = value;
      }
    }

    return schema.parse(processedParams);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      logger.debug('Query parameter validation failed', {
        errors: error.errors,
      });
      throw new ValidationError(`Query validation failed: ${details}`);
    }
    throw new ValidationError('Invalid query parameters');
  }
}
