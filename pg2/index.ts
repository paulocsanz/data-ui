import 'dotenv/config';
import { authorize } from './src/auth';
import { AppError } from './src/error';
import {
  sql,
  directories,
  createDirectory,
  deleteDirectory,
  objects,
  createObject,
  createProperty,
  updateObject,
  deleteObjects,
  generateDummy,
} from './src/handlers';

const DEFAULT_TIMEOUT = 15000;

function getTimeout(): number {
  const timeout = process.env.TIMEOUT;
  return timeout ? parseInt(timeout, 10) || DEFAULT_TIMEOUT : DEFAULT_TIMEOUT;
}

function createCorsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': [
      'https://railway-develop.app',
      'https://railway-develop.com',
      'https://railway-staging.app',
      'https://railway-staging.com',
      'https://railway.app',
      'https://railway.com',
    ].join(', '),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Private-Network': 'true',
  };
}

function createResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...createCorsHeaders(),
    },
  });
}

function createErrorResponse(error: Error): Response {
  console.error('Error:', error);

  if (error instanceof AppError) {
    return createResponse({ error: error.message }, error.status);
  }

  return createResponse({ error: 'Internal server error' }, 500);
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: createCorsHeaders(),
    });
  }

  if (!authorize(req)) {
    return createResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    switch (url.pathname) {
      case '/directories':
        if (req.method === 'GET') {
          const driver = url.searchParams.get('driver');
          if (!driver) {
            return createResponse(
              { error: 'Driver parameter is required' },
              400
            );
          }
          const directoriesResult = await directories({ driver });
          return createResponse(directoriesResult);
        }
        break;

      case '/directory':
        if (req.method === 'POST') {
          const body = await req.json();
          await createDirectory(body);
          return createResponse({});
        }
        if (req.method === 'DELETE') {
          const body = await req.json();
          await deleteDirectory(body);
          return createResponse({});
        }
        break;

      case '/objects':
        if (req.method === 'GET') {
          const params = Object.fromEntries(url.searchParams.entries());
          if (!params.driver) {
            return createResponse(
              { error: 'Driver parameter is required' },
              400
            );
          }
          const objectsResult = await objects({
            directory: params.directory,
            cursor: params.cursor ? parseInt(params.cursor, 10) : undefined,
            driver: params.driver,
          });
          return createResponse(objectsResult);
        }
        if (req.method === 'DELETE') {
          const body = await req.json();
          await deleteObjects(body);
          return createResponse({});
        }
        break;

      case '/object':
        if (req.method === 'POST') {
          const body = await req.json();
          await createObject(body);
          return createResponse({});
        }
        if (req.method === 'PUT') {
          const body = await req.json();
          await updateObject(body);
          return createResponse({});
        }
        break;

      case '/property':
        if (req.method === 'POST') {
          const body = await req.json();
          await createProperty(body);
          return createResponse({});
        }
        break;

      case '/sql':
        if (req.method === 'POST') {
          const body = await req.json();
          const result = await sql(body);
          return createResponse(result);
        }
        break;

      case '/generate/dummy':
        if (req.method === 'POST') {
          const body = await req.json();
          await generateDummy(body);
          return createResponse({});
        }
        break;

      default:
        return createResponse({ error: 'Not found' }, 404);
    }

    return createResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  );

  return Promise.race([promise, timeout]);
}

async function main(): Promise<void> {
  const timeout = getTimeout();
  console.log(`Request timeout set to ${timeout}ms`);

  const server = Bun.serve({
    port: 9009,
    hostname: '0.0.0.0',
    async fetch(req: Request): Promise<Response> {
      try {
        return await withTimeout(handleRequest(req), timeout);
      } catch (error) {
        return createErrorResponse(error as Error);
      }
    },
  });

  console.log(`Server listening on ${server.hostname}:${server.port}`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
