# PostgreSQL Connection Monitoring

This system automatically monitors PostgreSQL connection metrics and stores them in ClickHouse for analysis.

## Features

- **Always Running**: Starts automatically regardless of ClickHouse configuration
- **Auto-Discovery**: Automatically discovers and monitors all PostgreSQL databases
- **5-Second Intervals**: Configurable collection frequency (default: 5000ms)
- **Efficient Collection**: Single query to collect metrics from all databases
- **Graceful Degradation**: Works with or without ClickHouse storage
- **ClickHouse Storage**: Time-series optimized storage with 30-day TTL (when configured)
- **Migration System**: Proper schema management with versioning

## Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CLICKHOUSE_URL` | ClickHouse connection URL (optional) | - | `http://default:password@localhost:8123/default` |
| `MONITORING_INTERVAL` | Collection interval in ms | `5000` | `10000` |

## Quick Start

1. **Start the server**:
   ```bash
   bun run dev
   ```

2. **Optional: Configure ClickHouse for persistent storage**:
   ```bash
   export CLICKHOUSE_URL="http://default:password@localhost:8123/default"
   bun run dev  # Restart to enable ClickHouse storage
   ```

Monitoring will start automatically and discover all PostgreSQL databases. Metrics will be logged to console and stored in ClickHouse if configured.

## Data Schema

The system creates a `pg_connection_metrics` table in ClickHouse:

```sql
CREATE TABLE pg_connection_metrics (
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
```

## Metrics Collected

- **Active Connections**: Current number of active connections
- **Max Connections**: PostgreSQL max_connections setting
- **Utilization Percent**: (active/max) * 100
- **Database**: Target database name
- **Server Host**: Hostname of the monitoring server
- **Timestamp**: Collection time with millisecond precision

## Testing

The system includes comprehensive tests:

```bash
# Run all tests
bun test

# Run specific test suites
bun test:integration     # Integration tests with environment info
bun test:monitoring      # MonitoringService unit tests
bun test:clickhouse      # ClickHouse service tests
bun test:migrations      # Migration system tests

# Watch mode for development
bun test:watch
```

## Migration System

The system uses a proper migration system for ClickHouse schema management:

- **Versioned Migrations**: Each migration has a unique version number
- **Automatic Execution**: Runs on startup
- **Rollback Support**: Down migrations for reversibility
- **Checksum Validation**: Ensures migration integrity
- **Schema Tracking**: `schema_migrations` table tracks applied migrations

### Current Migrations

1. **v1**: Create base `pg_connection_metrics` table
2. **v2**: Add hourly aggregation projection for performance

## Querying Data

Example ClickHouse queries:

```sql
-- Recent metrics
SELECT * FROM pg_connection_metrics 
ORDER BY timestamp DESC 
LIMIT 10;

-- Average utilization by database (last hour)
SELECT 
    database,
    avg(utilization_percent) as avg_utilization,
    max(active_connections) as peak_connections
FROM pg_connection_metrics 
WHERE timestamp >= now() - INTERVAL 1 HOUR
GROUP BY database
ORDER BY avg_utilization DESC;

-- Hourly averages using projection
SELECT * FROM pg_connection_metrics
WHERE timestamp >= today() - 1
ORDER BY hour DESC;
```

## Production Considerations

1. **Always Monitoring**: The service collects metrics regardless of ClickHouse availability
2. **Log Output**: Metrics are always logged to console for visibility
3. **ClickHouse Setup**: Optional but recommended for persistent storage and analysis
4. **Network Access**: PostgreSQL must be accessible; ClickHouse is optional
5. **Monitoring Interval**: Adjust based on your needs (5s default is aggressive)
6. **Data Retention**: TTL is set to 30 days when using ClickHouse
7. **Error Handling**: Service continues running even if ClickHouse fails

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  PostgreSQL     │◄───│  Monitoring      │────►│  ClickHouse     │
│  Databases      │    │  Service         │    │  Cluster        │
│                 │    │                  │    │                 │
│  - postgres     │    │  Collects every  │    │  Stores metrics │
│  - app_db       │    │  5 seconds       │    │  with TTL       │
│  - analytics    │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

The monitoring service:
1. Queries each configured PostgreSQL database
2. Collects connection metrics using `pg_stat_activity`
3. Calculates utilization percentages
4. Stores data in ClickHouse with timestamp
5. Handles errors gracefully and logs issues

## Troubleshooting

- **No metrics appearing**: Check ClickHouse connection and PostgreSQL access
- **Connection failures**: Verify environment variables and network connectivity
- **High CPU usage**: Consider increasing `MONITORING_INTERVAL`
- **Missing databases**: Check `MONITORING_DATABASES` configuration
- **Migration errors**: Check ClickHouse permissions and disk space