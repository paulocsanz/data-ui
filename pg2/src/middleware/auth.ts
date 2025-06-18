import { env } from '@/config/environment';
import { AuthenticationError } from '@/utils/errors';
import { logger } from '@/utils/logger';

// TODO: fix timing attack in string comparison and add rate limiting
export function validateAuth(request: Request): void {
  // Skip authentication in development mode
  if (env.NODE_ENV === 'development') {
    logger.debug('Skipping authentication in development mode');
    return;
  }

  const token = env.TOKEN;
  if (!token) {
    logger.warn('No TOKEN configured in production mode');
    throw new AuthenticationError('Authentication not configured');
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    logger.debug('Missing authorization header');
    throw new AuthenticationError('Authorization header required');
  }

  const expectedAuth = `Bearer ${token}`;
  if (authHeader !== expectedAuth || authHeader.length === 0) {
    logger.debug('Invalid authorization token');
    throw new AuthenticationError('Invalid authorization token');
  }

  logger.debug('Authentication successful');
}
