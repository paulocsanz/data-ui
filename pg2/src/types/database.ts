import { z } from 'zod';

export const SQL_CONSTRAINTS = ['PRIMARY KEY', 'NOT NULL', 'UNIQUE'] as const;
export type SqlConstraint = (typeof SQL_CONSTRAINTS)[number];

export const PG_DATA_TYPES = [
  'varchar',
  'text',
  'integer',
  'bigint',
  'decimal',
  'numeric',
  'real',
  'double precision',
  'boolean',
  'date',
  'timestamp',
  'timestamptz',
  'json',
  'jsonb',
  'uuid',
  'serial',
  'bigserial',
] as const;

export type PostgreSQLDataType = (typeof PG_DATA_TYPES)[number];

export interface ColumnDefinition {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
}

export interface TableMetadata {
  name: string;
  columns: ColumnDefinition[];
  primaryKey?: string;
  rowCount: number;
}
