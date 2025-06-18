import { Client } from 'pg';
import { logger } from '@/utils/logger';
import { ConnectionError, DatabaseError } from '@/utils/errors';

export class DatabaseService {
  private client: Client | null = null;

  async connect(connectionString: string): Promise<void> {
    try {
      this.client = new Client({ connectionString });
      await this.client.connect();
      logger.debug('Database connection established');
    } catch (error) {
      logger.error('Failed to connect to database', error as Error);
      throw new ConnectionError(
        'Failed to establish database connection',
        error as Error
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
        this.client = null;
        logger.debug('Database connection closed');
      } catch (error) {
        logger.error('Error closing database connection', error as Error);
        throw new DatabaseError(
          'Failed to close database connection',
          error as Error
        );
      }
    }
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.client) {
      throw new ConnectionError('Database not connected');
    }

    try {
      logger.debug('Executing query', {
        sql: sql.substring(0, 100),
        paramCount: params.length,
      });
      const result = await this.client.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      logger.error('Query execution failed', {
        sql: sql.substring(0, 100),
        error,
      });
      throw new DatabaseError('Query execution failed', error as Error);
    }
  }

  async queryOne<T = unknown>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
      ['public', tableName]
    );
    return result?.exists ?? false;
  }

  async getTableColumns(
    tableName: string
  ): Promise<Array<{ column_name: string; data_type: string }>> {
    return this.query<{ column_name: string; data_type: string }>(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
      [tableName]
    );
  }

  async getPrimaryKey(tableName: string): Promise<string | null> {
    const result = await this.queryOne<{ attname: string }>(
      `SELECT pg_attribute.attname
       FROM pg_index, pg_class, pg_attribute, pg_namespace
       WHERE indrelid = pg_class.oid 
         AND nspname = 'public' 
         AND pg_class.relnamespace = pg_namespace.oid
         AND pg_attribute.attrelid = pg_class.oid 
         AND pg_attribute.attnum = any(pg_index.indkey) 
         AND indisprimary 
         AND relname = $1`,
      [tableName]
    );
    return result?.attname || null;
  }

  async getRowCount(tableName: string): Promise<number> {
    const result = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM ' + this.escapeIdentifier(tableName)
    );
    return parseInt(result?.count || '0', 10);
  }

  escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  escapeLiteral(literal: string): string {
    return `'${literal.replace(/'/g, "''")}'`;
  }

  async transaction<T>(
    callback: (db: DatabaseService) => Promise<T>
  ): Promise<T> {
    if (!this.client) {
      throw new ConnectionError('Database not connected');
    }

    try {
      await this.client.query('BEGIN');
      logger.debug('Transaction started');

      const result = await callback(this);

      await this.client.query('COMMIT');
      logger.debug('Transaction committed');

      return result;
    } catch (error) {
      await this.client.query('ROLLBACK');
      logger.debug('Transaction rolled back');
      throw error;
    }
  }
}

export async function createDatabaseService(
  connectionString: string
): Promise<DatabaseService> {
  const service = new DatabaseService();
  await service.connect(connectionString);
  return service;
}
