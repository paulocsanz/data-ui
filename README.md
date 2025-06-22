# PostgreSQL API Server

High-performance PostgreSQL API service built with Bun and TypeScript.

## Features

- 🚀 **High Performance**: Built with Bun runtime for maximum speed
- 🔒 **Type Safety**: Full TypeScript support with strict type checking
- 🛡️ **Input Validation**: Comprehensive request validation using Zod schemas
- 📊 **Structured Logging**: Configurable logging with metadata support
- 🔐 **Authentication**: Token-based authentication with development mode bypass
- 🌐 **CORS Support**: Pre-configured for Railway domains
- ⚡ **Connection Management**: Per-request database connections for optimal resource usage
- 🎯 **Error Handling**: Custom error classes with proper HTTP status codes

## Quick Start

```bash
# Install dependencies
bun install

# Set environment variables
export PGUSER=user
export PGPASSWORD=password
export PGPORT=port
export PGHOST=host
export TOKEN="your-api-token"  # Optional in development

# Start development server
bun run dev

# Start production server
bun run start

# Run type checking
bun run typecheck

# Run linting and formatting
bun run lint
```

## API Endpoints

### Database Operations

- `GET /directories?drive=<url>` - List all tables
- `POST /directory` - Create a new table
- `DELETE /directory` - Delete a table

### Data Operations

- `GET /objects?directory=<name>&drive=<url>&cursor=<n>&limit=<n>` - Get table data
- `POST /object` - Insert new row
- `PUT /object` - Update existing row
- `DELETE /objects` - Delete rows

### Schema Operations

- `POST /property` - Add new column to table

### Utility Operations

- `POST /query` - Execute raw SQL query
- `POST /generate/dummy` - Generate test data

## Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `9009` | Server port |
| `TIMEOUT` | `15000` | Request timeout (ms) |
| `TOKEN` | - | API authentication token |
| `LOG_LEVEL` | `info` | Logging level |

## Project Structure

```
src/
├── config/          # Configuration files
│   ├── cors.ts      # CORS settings
│   └── environment.ts # Environment validation
├── controllers/     # Request handlers
│   └── postgresql.ts # API controllers
├── middleware/      # Request middleware
│   ├── auth.ts      # Authentication
│   └── validation.ts # Request validation
├── services/        # Business logic
│   ├── database.ts  # Database service
│   └── postgresql.ts # PostgreSQL operations
├── types/           # Type definitions
│   ├── database.ts  # Database types
│   └── requests.ts  # Request/response schemas
├── utils/           # Utilities
│   ├── errors.ts    # Error classes
│   └── logger.ts    # Logging utility
└── index.ts         # Application entry point
```

## Request Examples

### Create Table
```json
POST /directory
{
  "directory": "users",
  "drive": "mydb",
  "properties": [
    {
      "name": "id",
      "type": "SERIAL",
      "constraint": "PRIMARY KEY"
    },
    {
      "name": "email",
      "type": "VARCHAR(100)",
      "constraint": "NOT NULL"
    }
  ]
}
```

### Query Data
```bash
GET /objects?directory=users&drive=mydb&limit=10&cursor=0
```

### Insert Data
```json
POST /object
{
  "directory": "users",
  "drive": "mydb",
  "properties": {
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

## Development

```bash
# Type checking
bun run typecheck

# Linting and formatting
bun run lint

# Check code quality
bun run lint:check

# Build for production
bun run build

# Clean build artifacts
bun run clean
```

## Authentication

In development mode (`NODE_ENV=development`), authentication is bypassed.

In production, include the `Authorization` header:
```
Authorization: Bearer <your-token>
```
