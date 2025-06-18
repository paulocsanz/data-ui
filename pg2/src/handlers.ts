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
  CreateProperty,
} from './types';
import { createConnection, escapeIdentifier, escapeLiteral } from './database';
import { NoPrimaryKeyError } from './error';

const VALID_CONSTRAINTS = ['PRIMARY KEY', 'NOT NULL', 'UNIQUE'];

export async function sql(req: SqlRequest): Promise<unknown[]> {
  const client = await createConnection(req.driver);
  try {
    const result = await client.query(req.query);
    const fields: unknown[] = [];
    for (const row of result.rows) {
      for (let i = 0; i < result.rows.length; i++) {
        fields.push(row[i]);
      }
    }
    return fields;
  } finally {
    await client.end();
  }
}

export async function directories(req: { driver: string }): Promise<string[]> {
  const client = await createConnection(req.driver);
  try {
    const result = await client.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'public'"
    );
    return result.rows.map((row) => row.table_name);
  } finally {
    await client.end();
  }
}

export async function createDirectory(
  req: CreateDirectoryRequest
): Promise<void> {
  const properties = (req.properties || []).map((p: CreateProperty) => {
    let prop = `${escapeIdentifier(p.name)} ${p.type}`;
    if (p.default) {
      prop = `${prop} DEFAULT ${escapeLiteral(p.default)}`;
    }
    if (p.constraint && VALID_CONSTRAINTS.includes(p.constraint)) {
      prop = `${prop} ${p.constraint}`;
    }
    return prop;
  });

  const query = `CREATE TABLE ${escapeIdentifier(req.directory)} (${properties.join(', ')})`;

  const client = await createConnection(req.driver);
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

export async function deleteDirectory(
  req: DeleteDirectoryRequest
): Promise<void> {
  const query = `DROP TABLE ${escapeIdentifier(req.directory)}`;

  const client = await createConnection(req.driver);
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

export async function objects(req: ObjectsRequest): Promise<ObjectsResponse> {
  const client = await createConnection(req.driver);
  try {
    const propertiesQuery = `SELECT column_name, data_type FROM information_schema.columns where table_name = ${escapeLiteral(req.directory)}`;
    const propertiesResult = await client.query(propertiesQuery);

    const properties: Array<[string, string]> = propertiesResult.rows.map(
      (row) => [row.column_name, row.data_type]
    );

    const objectsQuery = `SELECT row_to_json(${escapeIdentifier(req.directory)}.*) FROM ${escapeIdentifier(req.directory)} LIMIT 10 OFFSET ${req.cursor || 0}`;
    const objectsResult = await client.query(objectsQuery);

    const objects = objectsResult.rows.map((row) => {
      let json = row.row_to_json;
      if (json && typeof json === 'object') {
        for (const [property, value] of Object.entries(json)) {
          const propertyType = properties.find(([name]) => name === property);
          if (
            propertyType &&
            (propertyType[1] === 'json' || propertyType[1] === 'jsonb')
          ) {
            json[property] = JSON.stringify(value);
          }
        }
      }
      return json;
    });

    const countQuery = `SELECT COUNT(*) FROM ${escapeIdentifier(req.directory)}`;
    const countResult = await client.query(countQuery);
    const count = parseInt(countResult.rows[0].count);

    const primaryKeyQuery = `SELECT pg_attribute.attname
                             FROM pg_index, pg_class, pg_attribute, pg_namespace
                             WHERE indrelid = pg_class.oid AND nspname = 'public' AND pg_class.relnamespace = pg_namespace.oid AND
                               pg_attribute.attrelid = pg_class.oid AND pg_attribute.attnum = any(pg_index.indkey) AND indisprimary AND
                               relName = $1`;
    const primaryKeyResult = await client.query(primaryKeyQuery, [
      req.directory,
    ]);
    const primaryKey = primaryKeyResult.rows[0]?.attname || null;

    return {
      objects,
      count,
      primaryKey,
      propertyNames: properties.map(([name]) => name),
      propertyTypes: properties.map(([, type]) => type),
    };
  } finally {
    await client.end();
  }
}

export async function createObject(req: CreateObjectRequest): Promise<void> {
  const names = Object.keys(req.properties)
    .map((k) => escapeIdentifier(k))
    .join(', ');
  const values = Object.values(req.properties)
    .map((value) => escapeLiteral(value))
    .join(', ');

  let query: string;
  if (names === '' && values === '') {
    if (req.primaryKey) {
      query = `INSERT INTO ${escapeIdentifier(req.directory)} (${escapeIdentifier(req.primaryKey)}) VALUES (DEFAULT)`;
    } else {
      query = `INSERT INTO ${escapeIdentifier(req.directory)} (${names}) VALUES (${values})`;
    }
  } else {
    query = `INSERT INTO ${escapeIdentifier(req.directory)} (${names}) VALUES (${values})`;
  }

  const client = await createConnection(req.driver);
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

export async function createProperty(
  req: CreatePropertyRequest
): Promise<void> {
  let prop = `${escapeIdentifier(req.property.name)} ${req.property.type}`;
  if (req.property.default) {
    prop = `${prop} DEFAULT ${escapeLiteral(req.property.default)}`;
  }
  if (
    req.property.constraint &&
    VALID_CONSTRAINTS.includes(req.property.constraint)
  ) {
    prop = `${prop} ${req.property.constraint}`;
  }

  const query = `ALTER TABLE ${escapeIdentifier(req.directory)} ADD COLUMN ${prop}`;

  const client = await createConnection(req.driver);
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

export async function updateObject(req: UpdateObjectRequest): Promise<void> {
  const client = await createConnection(req.driver);
  try {
    const primaryKeyQuery = `SELECT pg_attribute.attname
                             FROM pg_index, pg_class, pg_attribute, pg_namespace
                             WHERE indrelid = pg_class.oid AND nspname = 'public' AND pg_class.relnamespace = pg_namespace.oid AND
                               pg_attribute.attrelid = pg_class.oid AND pg_attribute.attnum = any(pg_index.indkey) AND indisprimary AND
                               relName = $1`;
    const primaryKeyResult = await client.query(primaryKeyQuery, [
      req.directory,
    ]);

    if (primaryKeyResult.rows.length === 0) {
      throw new NoPrimaryKeyError();
    }

    const primaryKey = primaryKeyResult.rows[0].attname;

    const values = Object.entries(req.properties)
      .map(
        ([key, value]) => `${escapeIdentifier(key)} = ${escapeLiteral(value)}`
      )
      .join(', ');

    const query = `UPDATE ${escapeIdentifier(req.directory)} SET ${values} WHERE ${escapeIdentifier(primaryKey)} = $1`;

    await client.query(query, [req.id]);
  } finally {
    await client.end();
  }
}

export async function deleteObjects(req: DeleteObjectRequest): Promise<void> {
  const client = await createConnection(req.driver);
  try {
    const primaryKeyQuery = `SELECT pg_attribute.attname
                             FROM pg_index, pg_class, pg_attribute, pg_namespace
                             WHERE indrelid = pg_class.oid AND nspname = 'public' AND pg_class.relnamespace = pg_namespace.oid AND
                               pg_attribute.attrelid = pg_class.oid AND pg_attribute.attnum = any(pg_index.indkey) AND indisprimary AND
                               relName = $1`;
    const primaryKeyResult = await client.query(primaryKeyQuery, [
      req.directory,
    ]);

    if (primaryKeyResult.rows.length === 0) {
      throw new NoPrimaryKeyError();
    }

    const primaryKey = primaryKeyResult.rows[0].attname;

    const query = `DELETE FROM ${escapeIdentifier(req.directory)} WHERE ${escapeIdentifier(primaryKey)} = ANY ($1)`;

    await client.query(query, [req.ids]);
  } finally {
    await client.end();
  }
}

export async function generateDummy(req: { driver: string }): Promise<void> {
  const client = await createConnection(req.driver);
  try {
    const queries = [
      `CREATE TABLE authors (
        id SERIAL NOT NULL PRIMARY KEY,
        first_name varchar(50) NOT NULL,
        last_name varchar(50) NOT NULL,
        email varchar(100) NOT NULL UNIQUE
      );`,
      `CREATE TABLE jokes (
        id SERIAL NOT NULL PRIMARY KEY,
        setup varchar(255) NOT NULL,
        punchline varchar(500)
      );`,
      `INSERT INTO authors VALUES 
      ('1','Thomas','Tank','thomas.the.tank@example.org'),
      ('2','Johnny','Coalheart','JCoal@example.com'),
      ('3','Brandy','Smokestack','smokestack@example.org'),
      ('4','Ima','Caboose','the.boose.is.loose@example.com'),
      ('5','Megan','Trainer','megan@example.com');`,
      `INSERT INTO jokes VALUES 
      ('1','I was gonna tell a joke','but I lost my train of thought'),
      ('2','How do trains eat?','They chew-chew'),
      ('3','Why did the crazy guy steal the train?','He had locomotives');`,
    ];

    for (const query of queries) {
      await client.query(query);
    }
  } finally {
    await client.end();
  }
}
