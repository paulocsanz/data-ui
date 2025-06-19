import { Migration } from '../services/migrations';

// Import all migrations
import { migration as migration001 } from './001_create_pg_connection_metrics_table';
import { migration as migration002 } from './002_add_connection_metrics_projection';

// Export all migrations in order
export const migrations: Migration[] = [migration001, migration002];

// Auto-validate migration order
const versions = migrations.map((m) => m.version);
const sortedVersions = [...versions].sort((a, b) => a - b);
if (JSON.stringify(versions) !== JSON.stringify(sortedVersions)) {
  throw new Error('Migrations must be exported in version order');
}

// Auto-validate unique versions
const uniqueVersions = [...new Set(versions)];
if (versions.length !== uniqueVersions.length) {
  throw new Error('Migration versions must be unique');
}
