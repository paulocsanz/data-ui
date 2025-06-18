import { createDatabaseService } from './database';
import { logger } from '@/utils/logger';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { SQL_CONSTRAINTS } from '@/types/database';
import type {
  SqlRequest,
  CreateDirectoryRequest,
  DeleteDirectoryRequest,
  ObjectsRequest,
  ObjectsResponse,
  CreateObjectRequest,
  CreatePropertyRequest,
  UpdateObjectRequest,
  DeleteObjectRequest,
  GenerateDummyRequest,
} from '@/types/requests';

export class PostgreSQLService {
  async executeSql(request: SqlRequest): Promise<unknown[]> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Executing SQL query', { queryLength: request.query.length });

      const result = await db.query(request.query);
      const fields: unknown[] = [];

      // Flatten all row data into a single array (matching original API behavior)
      for (const row of result) {
        const rowObj = row as Record<string, unknown>;
        for (let i = 0; i < result.length; i++) {
          fields.push(rowObj[String(i)]);
        }
      }

      logger.info('SQL query executed successfully', {
        resultCount: fields.length,
      });
      return fields;
    } finally {
      await db.disconnect();
    }
  }

  async getDirectories(request: { drive: string }): Promise<string[]> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Fetching database tables');

      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );

      const tableNames = tables.map((row) => row.table_name);
      logger.info('Fetched database tables', { count: tableNames.length });

      return tableNames;
    } finally {
      await db.disconnect();
    }
  }

  async createDirectory(request: CreateDirectoryRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Creating table', { tableName: request.directory });

      // Check if table already exists
      if (await db.tableExists(request.directory)) {
        throw new ValidationError(
          `Table '${request.directory}' already exists`
        );
      }

      // Build column definitions
      const columns = request.properties.map((property) => {
        let columnDef = `${db.escapeIdentifier(property.name)} ${property.type}`;

        if (property.default) {
          columnDef += ` DEFAULT ${db.escapeLiteral(property.default)}`;
        }

        if (
          property.constraint &&
          SQL_CONSTRAINTS.includes(property.constraint)
        ) {
          columnDef += ` ${property.constraint}`;
        }

        return columnDef;
      });

      const columnsClause =
        columns.length > 0 ? columns.join(', ') : 'id SERIAL PRIMARY KEY';
      const sql = `CREATE TABLE ${db.escapeIdentifier(request.directory)} (${columnsClause})`;

      await db.query(sql);
      logger.info('Table created successfully', {
        tableName: request.directory,
      });
    } finally {
      await db.disconnect();
    }
  }

  async deleteDirectory(request: DeleteDirectoryRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Deleting table', { tableName: request.directory });

      // Check if table exists
      if (!(await db.tableExists(request.directory))) {
        throw new NotFoundError(`Table '${request.directory}'`);
      }

      const sql = `DROP TABLE ${db.escapeIdentifier(request.directory)}`;
      await db.query(sql);

      logger.info('Table deleted successfully', {
        tableName: request.directory,
      });
    } finally {
      await db.disconnect();
    }
  }

  async getObjects(request: ObjectsRequest): Promise<ObjectsResponse> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Fetching table data', {
        tableName: request.directory,
        cursor: request.cursor,
        limit: request.limit,
      });

      // Check if table exists
      if (!(await db.tableExists(request.directory))) {
        throw new NotFoundError(`Table '${request.directory}'`);
      }

      // Get table columns
      const columns = await db.getTableColumns(request.directory);
      const propertyNames = columns.map((col) => col.column_name);
      const propertyTypes = columns.map((col) => col.data_type);

      // Get data with pagination
      const sql = `SELECT row_to_json(${db.escapeIdentifier(request.directory)}.*) as data 
                   FROM ${db.escapeIdentifier(request.directory)} 
                   LIMIT $1 OFFSET $2`;

      const rows = await db.query<{ data: Record<string, unknown> }>(sql, [
        request.limit,
        request.cursor,
      ]);

      // Process JSON columns
      const objects = rows.map((row) => {
        if (!row.data) return null;

        const obj = { ...row.data };
        for (const [property, value] of Object.entries(obj)) {
          const column = columns.find((col) => col.column_name === property);
          if (
            column &&
            (column.data_type === 'json' || column.data_type === 'jsonb')
          ) {
            obj[property as string] = JSON.stringify(value);
          }
        }

        return obj;
      });

      // Get total count
      const count = await db.getRowCount(request.directory);

      // Get primary key
      const primaryKey = await db.getPrimaryKey(request.directory);

      const hasMore = (request.cursor || 0) + (request.limit || 10) < count;

      logger.info('Table data fetched successfully', {
        tableName: request.directory,
        objectCount: objects.length,
        totalCount: count,
      });

      return {
        objects,
        propertyNames,
        propertyTypes,
        primaryKey,
        count,
        hasMore,
      };
    } finally {
      await db.disconnect();
    }
  }

  async createObject(request: CreateObjectRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Creating table row', { tableName: request.directory });

      // Check if table exists
      if (!(await db.tableExists(request.directory))) {
        throw new NotFoundError(`Table '${request.directory}'`);
      }

      const properties = request.properties;
      const hasProperties = Object.keys(properties).length > 0;

      let sql: string;

      if (!hasProperties && request.primaryKey) {
        // Insert with default primary key
        sql = `INSERT INTO ${db.escapeIdentifier(request.directory)} 
               (${db.escapeIdentifier(request.primaryKey)}) VALUES (DEFAULT)`;
      } else if (hasProperties) {
        // Insert with specified values
        const columns = Object.keys(properties)
          .map((k) => db.escapeIdentifier(k))
          .join(', ');
        const values = Object.values(properties)
          .map((v) => db.escapeLiteral(v))
          .join(', ');
        sql = `INSERT INTO ${db.escapeIdentifier(request.directory)} (${columns}) VALUES (${values})`;
      } else {
        // Insert with all defaults
        sql = `INSERT INTO ${db.escapeIdentifier(request.directory)} DEFAULT VALUES`;
      }

      await db.query(sql);
      logger.info('Table row created successfully', {
        tableName: request.directory,
      });
    } finally {
      await db.disconnect();
    }
  }

  async createProperty(request: CreatePropertyRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Adding table column', {
        tableName: request.directory,
        columnName: request.property.name,
      });

      // Check if table exists
      if (!(await db.tableExists(request.directory))) {
        throw new NotFoundError(`Table '${request.directory}'`);
      }

      let columnDef = `${db.escapeIdentifier(request.property.name)} ${request.property.type}`;

      if (request.property.default) {
        columnDef += ` DEFAULT ${db.escapeLiteral(request.property.default)}`;
      }

      if (
        request.property.constraint &&
        SQL_CONSTRAINTS.includes(request.property.constraint)
      ) {
        columnDef += ` ${request.property.constraint}`;
      }

      const sql = `ALTER TABLE ${db.escapeIdentifier(request.directory)} ADD COLUMN ${columnDef}`;
      await db.query(sql);

      logger.info('Table column added successfully', {
        tableName: request.directory,
        columnName: request.property.name,
      });
    } finally {
      await db.disconnect();
    }
  }

  async updateObject(request: UpdateObjectRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Updating table row', {
        tableName: request.directory,
        id: request.id,
      });

      // Check if table exists
      if (!(await db.tableExists(request.directory))) {
        throw new NotFoundError(`Table '${request.directory}'`);
      }

      // Get primary key
      const primaryKey = await db.getPrimaryKey(request.directory);
      if (!primaryKey) {
        throw new ValidationError(
          `Table '${request.directory}' has no primary key`
        );
      }

      // Build SET clause
      const setClause = Object.entries(request.properties)
        .map(
          ([key, value]) =>
            `${db.escapeIdentifier(key)} = COALESCE(${value != null ? db.escapeLiteral(value) : 'NULL'}, ${db.escapeIdentifier(key)})`
        )
        .join(', ');

      const sql = `UPDATE ${db.escapeIdentifier(request.directory)} 
                   SET ${setClause} 
                   WHERE ${db.escapeIdentifier(primaryKey)} = $1`;

      await db.query(sql, [request.id]);
      logger.info('Table row updated successfully', {
        tableName: request.directory,
        id: request.id,
      });
    } finally {
      await db.disconnect();
    }
  }

  async deleteObjects(request: DeleteObjectRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Deleting table rows', {
        tableName: request.directory,
        idCount: request.ids.length,
      });

      // Check if table exists
      if (!(await db.tableExists(request.directory))) {
        throw new NotFoundError(`Table '${request.directory}'`);
      }

      // Get primary key
      const primaryKey = await db.getPrimaryKey(request.directory);
      if (!primaryKey) {
        throw new ValidationError(
          `Table '${request.directory}' has no primary key`
        );
      }

      const sql = `DELETE FROM ${db.escapeIdentifier(request.directory)} 
                   WHERE ${db.escapeIdentifier(primaryKey)} = ANY($1)`;

      await db.query(sql, [request.ids]);
      logger.info('Table rows deleted successfully', {
        tableName: request.directory,
        idCount: request.ids.length,
      });
    } finally {
      await db.disconnect();
    }
  }

  async generateDummy(request: GenerateDummyRequest): Promise<void> {
    const db = await createDatabaseService(request.drive);

    try {
      logger.info('Generating dummy data');

      const queries = [
        `CREATE TABLE IF NOT EXISTS authors (
          id SERIAL NOT NULL PRIMARY KEY,
          first_name varchar(50) NOT NULL,
          last_name varchar(50) NOT NULL,
          email varchar(100) NOT NULL UNIQUE
        )`,
        `CREATE TABLE IF NOT EXISTS jokes (
          id SERIAL NOT NULL PRIMARY KEY,
          setup varchar(255) NOT NULL,
          punchline varchar(500)
        )`,
        `INSERT INTO authors (id, first_name, last_name, email) VALUES 
         (1, 'Thomas', 'Tank', 'thomas.the.tank@example.org'),
         (2, 'Johnny', 'Coalheart', 'JCoal@example.com'),
         (3, 'Brandy', 'Smokestack', 'smokestack@example.org'),
         (4, 'Ima', 'Caboose', 'the.boose.is.loose@example.com'),
         (5, 'Megan', 'Trainer', 'megan@example.com')
         ON CONFLICT (id) DO NOTHING`,
        `INSERT INTO jokes (id, setup, punchline) VALUES 
         (1, 'I was gonna tell a joke', 'but I lost my train of thought'),
         (2, 'How do trains eat?', 'They chew-chew'),
         (3, 'Why did the crazy guy steal the train?', 'He had locomotives')
         ON CONFLICT (id) DO NOTHING`,
      ];

      for (const query of queries) {
        await db.query(query);
      }

      logger.info('Dummy data generated successfully');
    } finally {
      await db.disconnect();
    }
  }
}
