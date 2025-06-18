import { logger } from '@/utils/logger';

export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(
    message: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.cause && { cause: this.cause.message }),
    };
  }
}

export class ValidationError extends BaseError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class DatabaseError extends BaseError {
  readonly statusCode = 500;
  readonly code = 'DATABASE_ERROR';

  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class ConnectionError extends BaseError {
  readonly statusCode = 503;
  readonly code = 'CONNECTION_ERROR';

  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class AuthenticationError extends BaseError {
  readonly statusCode = 401;
  readonly code = 'AUTHENTICATION_ERROR';

  constructor(message: string = 'Authentication required', cause?: Error) {
    super(message, cause);
  }
}

export class NotFoundError extends BaseError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, cause?: Error) {
    super(`${resource} not found`, cause);
  }
}

export class TimeoutError extends BaseError {
  readonly statusCode = 408;
  readonly code = 'TIMEOUT_ERROR';

  constructor(message: string = 'Request timeout', cause?: Error) {
    super(message, cause);
  }
}

export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

export function normalizeError(error: unknown): BaseError {
  if (isBaseError(error)) {
    return error;
  }

  if (error instanceof Error) {
    logger.error(`Error: ${error.message}`, { error })
    return new DatabaseError('An unexpected error occurred', error);
  }

  return new DatabaseError(String(error));
}
