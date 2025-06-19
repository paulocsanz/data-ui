import { Migration } from '../services/migrations';

export const migration: Migration = {
  version: 1,
  name: 'create_pg_connection_metrics_table',
  up: `
    CREATE TABLE IF NOT EXISTS pg_connection_metrics (
      timestamp DateTime64(3),
      database String,
      active_connections UInt32,
      max_connections UInt32,
      utilization_percent Float32,
      server_host String
    )
    ENGINE = MergeTree()
    ORDER BY (timestamp, database)
    TTL timestamp + INTERVAL 30 DAY
    SETTINGS index_granularity = 8192
  `,
};
