const ALLOWED_ORIGINS: string[] = [
  'https://railway-develop.app',
  'https://railway-develop.com',
  'https://railway-staging.app',
  'https://railway-staging.com',
  'https://railway.app',
  'https://railway.com',
] as const;

const ALLOWED_METHODS = [
  'GET',
  'POST',
  'DELETE',
  'PUT',
  'HEAD',
  'OPTIONS',
] as const;

const ALLOWED_HEADERS = ['authorization', 'content-type'] as const;

export function createCorsHeaders(opt?: {
  origin: string;
}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':
      opt?.origin && ALLOWED_ORIGINS.includes(opt.origin)
        ? opt.origin
        : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Allow-Private-Network': 'true',
  };
}
