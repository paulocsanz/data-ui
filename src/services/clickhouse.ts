import { createClient, ClickHouseClient } from '@clickhouse/client';
import { logger } from '@/utils/logger';
import { env } from '@/config/environment';
import { MigrationService } from './migrations';
import { migrations } from '../migrations';

export interface ConnectionMetric {
  timestamp: Date;
  database: string;
  active_connections: number;
  max_connections: number;
  utilization_percent: number;
  server_host: string;
}

export class ClickHouseService {
  private client: ClickHouseClient | null = null;
  private readonly tableName = 'pg_connection_metrics';

  async connect(): Promise<void> {
    if (!env.CLICKHOUSE_URL) {
      logger.warn('ClickHouse URL not configured - metrics will not be stored');
      return;
    }

    try {
      this.client = createClient({
        url: env.CLICKHOUSE_URL,
      });

      await this.client.ping();
      logger.info('ClickHouse connection established');

      await this.runMigrations();
    } catch (error) {
      logger.error('Failed to connect to ClickHouse', error as Error);
      logger.warn('ClickHouse unavailable - metrics will not be stored');
      // Don't throw - allow service to continue without ClickHouse
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.client = null;
        logger.debug('ClickHouse connection closed');
      } catch (error) {
        logger.error('Error closing ClickHouse connection', error as Error);
      }
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.client) {
      logger.debug('ClickHouse not available - skipping migrations');
      return;
    }

    try {
      const migrationService = new MigrationService(this.client);
      await migrationService.runMigrations(migrations);
    } catch (error) {
      logger.error('Failed to run ClickHouse migrations', error as Error);
      logger.warn(
        'ClickHouse migrations failed - metrics storage may not work properly'
      );
      // Don't throw - allow service to continue
    }
  }

  async insertMetric(metric: ConnectionMetric): Promise<void> {
    return this.insertMetrics([metric]);
  }

  async insertMetrics(metrics: ConnectionMetric[]): Promise<void> {
    if (!this.client) {
      logger.debug('ClickHouse not available - skipping metrics insertion');
      return;
    }

    if (metrics.length === 0) return;

    try {
      const values = metrics.map((metric) => ({
        timestamp: metric.timestamp.toISOString(),
        database: metric.database,
        active_connections: metric.active_connections,
        max_connections: metric.max_connections,
        utilization_percent: metric.utilization_percent,
        server_host: metric.server_host,
      }));

      await this.client.insert({
        table: this.tableName,
        values,
        format: 'JSONEachRow',
      });

      logger.debug('Connection metrics inserted', {
        count: metrics.length,
        databases: metrics.map((m) => m.database),
      });
    } catch (error) {
      logger.error('Failed to insert metrics', error as Error);
      logger.warn('Metrics collection will continue despite ClickHouse error');
      // Don't throw - allow monitoring to continue
    }
  }
}

export async function createClickHouseService(): Promise<ClickHouseService> {
  const service = new ClickHouseService();
  await service.connect();
  return service;
}
