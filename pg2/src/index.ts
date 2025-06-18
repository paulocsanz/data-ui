/**
 * PostgreSQL API Server
 * High-performance database API built with Bun and TypeScript
 */
import 'dotenv/config';
import { env } from '@/config/environment';
import { createCorsHeaders } from '@/config/cors';
import { validateAuth } from '@/middleware/auth';
import { logger } from '@/utils/logger';
import { normalizeError, TimeoutError } from '@/utils/errors';
import {
  executeSql,
  getDirectories,
  createDirectory,
  deleteDirectory,
  getObjects,
  createObject,
  createProperty,
  updateObject,
  deleteObjects,
  generateDummy,
} from '@/controllers/postgresql';

/**
 * Create a standardized JSON response
 */
function createResponse(
  data: unknown,
  status: number,
  opt?: { origin: string }
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders(opt),
    },
  });
}

/**
 * Create an error response
 */
function createErrorResponse(
  error: unknown,
  opt?: { origin: string }
): Response {
  const normalizedError = normalizeError(error);

  logger.error('Request failed', normalizedError);

  return createResponse(
    {
      error: {
        message: normalizedError.message,
        code: normalizedError.code,
      },
    },
    normalizedError.statusCode,
    opt ? { origin: opt.origin } : undefined
  );
}

/**
 * Handle CORS preflight requests
 */
function handleOptions({ origin }: { origin: string }): Response {
  return new Response(null, {
    status: 200,
    headers: createCorsHeaders({ origin }),
  });
}

/**
 * Route handler for API requests
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('origin') ?? '';
  const { pathname, method } = {
    pathname: url.pathname,
    method: request.method,
  };

  logger.info('Request received', {
    method,
    pathname,
    userAgent: request.headers.get('user-agent'),
  });

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return handleOptions({ origin });
  }

  // Validate authentication
  try {
    validateAuth(request);
  } catch (error) {
    return createErrorResponse(error, { origin });
  }

  // Route requests
  try {
    let result: unknown;

    switch (pathname) {
      case '/directories':
        if (method === 'GET') {
          result = await getDirectories(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      case '/directory':
        if (method === 'POST') {
          result = await createDirectory(request);
        } else if (method === 'DELETE') {
          result = await deleteDirectory(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      case '/objects':
        if (method === 'GET') {
          result = await getObjects(request);
        } else if (method === 'DELETE') {
          result = await deleteObjects(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      case '/object':
        if (method === 'POST') {
          result = await createObject(request);
        } else if (method === 'PUT') {
          result = await updateObject(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      case '/property':
        if (method === 'POST') {
          result = await createProperty(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      case '/query':
        if (method === 'POST') {
          result = await executeSql(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      case '/generate/dummy':
        if (method === 'POST') {
          result = await generateDummy(request);
        } else {
          throw new Error(`Method ${method} not allowed for ${pathname}`);
        }
        break;

      default:
        throw new Error(`Route ${pathname} not found`);
    }

    logger.info('Request completed successfully', { method, pathname });
    return createResponse(result || {}, 200, { origin });
  } catch (error) {
    return createErrorResponse(error, { origin });
  }
}

/**
 * Add request timeout wrapper
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new TimeoutError(`Request timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  logger.info('Starting PostgreSQL API server', {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    timeout: env.TIMEOUT,
  });

  const server = Bun.serve({
    port: env.PORT,
    hostname: '0.0.0.0',

    async fetch(request: Request): Promise<Response> {
      const origin = request.headers.get('origin') ?? '';
      try {
        return await withTimeout(handleRequest(request), env.TIMEOUT);
      } catch (error) {
        return createErrorResponse(error, { origin });
      }
    },

    error(error: Error): Response {
      logger.error('Server error', error);
      return createErrorResponse(error);
    },
  });

  logger.info('🚀 Server started successfully', {
    url: `http://${server.hostname}:${server.port}`,
    environment: env.NODE_ENV,
  });
}

// Start the server
main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
