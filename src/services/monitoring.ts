import { createDatabaseService } from './database';
import { createClickHouseService, ConnectionMetric } from './clickhouse';
import { logger } from '@/utils/logger';
import { env } from '@/config/environment';
import os from 'os';
import { setInterval, clearInterval } from 'timers';

export class MonitoringService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private databases: string[] = [];

  constructor(databases: string[]) {
    this.databases = databases;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Monitoring service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting PostgreSQL connection monitoring', {
      interval: env.MONITORING_INTERVAL,
      databases: this.databases,
    });

    this.intervalId = setInterval(() => {
      void this.collectMetrics().catch((error) => {
        logger.error('Failed to collect metrics', error as Error);
      });
    }, env.MONITORING_INTERVAL);

    await this.collectMetrics();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('PostgreSQL connection monitoring stopped');
  }

  private async collectMetrics(): Promise<void> {
    const clickHouseService = await createClickHouseService();
    const timestamp = new Date();
    const serverHost = os.hostname();

    try {
      const metrics = await this.getAllConnectionMetrics(timestamp, serverHost);

      if (metrics.length > 0) {
        // Always log metrics for visibility
        const metricsData = metrics.map((m) => ({
          database: m.database,
          active: m.active_connections,
          max: m.max_connections,
          utilization: `${m.utilization_percent}%`,
        }));

        logger.info('Connection metrics collected', {
          count: metrics.length,
          timestamp: timestamp.toISOString(),
          metrics: metricsData,
        });

        // Try to store in ClickHouse if available
        await clickHouseService.insertMetrics(metrics);
      } else {
        logger.debug('No connection metrics found');
      }
    } finally {
      await clickHouseService.disconnect();
    }
  }

  private async getAllConnectionMetrics(
    timestamp: Date,
    serverHost: string
  ): Promise<ConnectionMetric[]> {
    const db = await createDatabaseService('postgres');

    try {
      // Get all database connection metrics in a single query
      const [connectionResults, maxConnResult] = await Promise.all([
        db.query<{ database: string; active_connections: string }>(`
          SELECT 
            COALESCE(datname, 'unknown') as database,
            COUNT(*) as active_connections
          FROM pg_stat_activity 
          WHERE datname IS NOT NULL 
          AND state = 'active'
          GROUP BY datname
          ORDER BY datname
        `),

        db.queryOne<{ setting: string }>(`
          SELECT setting 
          FROM pg_settings 
          WHERE name = 'max_connections'
        `),
      ]);

      const maxConnections = parseInt(maxConnResult?.setting || '100', 10);

      // Convert results to metrics
      const metrics: ConnectionMetric[] = connectionResults.map((row) => {
        const activeConnections = parseInt(row.active_connections, 10);
        const utilizationPercent =
          maxConnections > 0 ? (activeConnections / maxConnections) * 100 : 0;

        return {
          timestamp,
          database: row.database,
          active_connections: activeConnections,
          max_connections: maxConnections,
          utilization_percent: parseFloat(utilizationPercent.toFixed(2)),
          server_host: serverHost,
        };
      });

      // Add entries for databases with no active connections
      const databasesWithConnections = new Set(metrics.map((m) => m.database));
      for (const database of this.databases) {
        if (!databasesWithConnections.has(database)) {
          metrics.push({
            timestamp,
            database,
            active_connections: 0,
            max_connections: maxConnections,
            utilization_percent: 0,
            server_host: serverHost,
          });
        }
      }

      return metrics.sort((a, b) => a.database.localeCompare(b.database));
    } catch (error) {
      logger.error('Failed to collect connection metrics', error as Error);
      return [];
    } finally {
      await db.disconnect();
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getDatabases(): string[] {
    return [...this.databases];
  }

  addDatabase(database: string): void {
    if (!this.databases.includes(database)) {
      this.databases.push(database);
      logger.info('Database added to monitoring', { database });
    }
  }

  removeDatabase(database: string): void {
    const index = this.databases.indexOf(database);
    if (index > -1) {
      this.databases.splice(index, 1);
      logger.info('Database removed from monitoring', { database });
    }
  }
}

let monitoringService: MonitoringService | null = null;

export function getMonitoringService(): MonitoringService | null {
  return monitoringService;
}

async function getAllDatabases(): Promise<string[]> {
  try {
    // Use a temporary connection to get all databases
    const db = await createDatabaseService('postgres');

    try {
      const databases = await db.query<{ datname: string }>(`
        SELECT datname 
        FROM pg_database 
        WHERE datistemplate = false 
        AND datallowconn = true
        ORDER BY datname
      `);

      return databases.map((row) => row.datname);
    } finally {
      await db.disconnect();
    }
  } catch (error) {
    logger.error('Failed to get database list, using default', error as Error);
    return ['postgres']; // Fallback to default
  }
}

export async function initializeMonitoring(): Promise<void> {
  if (monitoringService) {
    logger.warn('Monitoring service already initialized');
    return;
  }

  const databases = await getAllDatabases();

  if (!env.CLICKHOUSE_URL) {
    logger.info(
      'PostgreSQL connection monitoring starting without ClickHouse storage',
      {
        databases,
        interval: env.MONITORING_INTERVAL,
        note: 'Metrics will be collected but not stored (CLICKHOUSE_URL not configured)',
      }
    );
  } else {
    logger.info('Initializing PostgreSQL connection monitoring', {
      databases,
      interval: env.MONITORING_INTERVAL,
      clickhouseUrl: env.CLICKHOUSE_URL,
    });
  }

  monitoringService = new MonitoringService(databases);
  void monitoringService.start();
}

export function stopConnectionMonitoring(): void {
  if (monitoringService) {
    void monitoringService.stop();
    monitoringService = null;
  }
}
