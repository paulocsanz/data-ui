import { Client } from 'pg';

export async function createConnection(databaseUrl: string): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function escapeLiteral(literal: string): string {
  return `'${literal.replace(/'/g, "''")}'`;
}
