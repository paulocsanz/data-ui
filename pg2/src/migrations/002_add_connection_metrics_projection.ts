import { Migration } from '../services/migrations';

export const migration: Migration = {
  version: 2,
  name: 'add_connection_metrics_projection',
  up: `
    -- ClickHouse doesn't support traditional indexes like PostgreSQL
    -- Instead, we can create materialized views or optimize table structure
    -- This migration demonstrates adding a projection for better query performance
    ALTER TABLE pg_connection_metrics 
    ADD PROJECTION hourly_avg (
      SELECT 
        toStartOfHour(timestamp) as hour,
        database,
        server_host,
        avg(active_connections) as avg_active_connections,
        avg(utilization_percent) as avg_utilization_percent
      GROUP BY hour, database, server_host
      ORDER BY hour, database
    )
  `,
};
