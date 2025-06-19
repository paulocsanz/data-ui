import { ClickHouseClient } from '@clickhouse/client';
import { logger } from '@/utils/logger';
import { DatabaseError } from '@/utils/errors';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

export class MigrationService {
  private client: ClickHouseClient;
  private readonly migrationsTable = 'schema_migrations';

  constructor(client: ClickHouseClient) {
    this.client = client;
  }

  async initialize(): Promise<void> {
    await this.createMigrationsTable();
  }

  private async createMigrationsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        version UInt32,
        name String,
        applied_at DateTime64(3) DEFAULT now(),
        checksum String
      )
      ENGINE = MergeTree()
      ORDER BY version
    `;

    try {
      await this.client.command({ query: createTableQuery });
      logger.debug('Migrations table created/verified');
    } catch (error) {
      logger.error('Failed to create migrations table', error as Error);
      throw new DatabaseError(
        'Failed to create migrations table',
        error as Error
      );
    }
  }

  async getAppliedMigrations(): Promise<number[]> {
    try {
      const result = await this.client.query({
        query: `SELECT version FROM ${this.migrationsTable} ORDER BY version`,
        format: 'JSONEachRow',
      });

      const rows = (await result.json()) as Array<{ version: number }>;
      return rows.map((row) => row.version);
    } catch (error) {
      logger.error('Failed to get applied migrations', error as Error);
      throw new DatabaseError(
        'Failed to get applied migrations',
        error as Error
      );
    }
  }

  async applyMigration(migration: Migration): Promise<void> {
    const checksum = this.calculateChecksum(migration.up);

    try {
      // Execute the migration
      await this.client.command({ query: migration.up });

      // Record the migration
      await this.client.insert({
        table: this.migrationsTable,
        values: [
          {
            version: migration.version,
            name: migration.name,
            applied_at: new Date().toISOString(),
            checksum,
          },
        ],
        format: 'JSONEachRow',
      });

      logger.info('Applied migration', {
        version: migration.version,
        name: migration.name,
      });
    } catch (error) {
      logger.error('Failed to apply migration', {
        version: migration.version,
        name: migration.name,
        error,
      });
      throw new DatabaseError(
        `Failed to apply migration ${migration.version}: ${migration.name}`,
        error as Error
      );
    }
  }

  async runMigrations(migrations: Migration[]): Promise<void> {
    await this.initialize();

    const appliedVersions = await this.getAppliedMigrations();
    const pendingMigrations = migrations.filter(
      (migration) => !appliedVersions.includes(migration.version)
    );

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to apply');
      return;
    }

    // Sort migrations by version
    pendingMigrations.sort((a, b) => a.version - b.version);

    logger.info('Applying migrations', {
      pending: pendingMigrations.length,
      versions: pendingMigrations.map((m) => m.version),
    });

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    logger.info('All migrations applied successfully');
  }

  private calculateChecksum(sql: string): string {
    // Simple checksum using Bun's built-in crypto
    return Bun.hash(sql).toString(16);
  }
}
