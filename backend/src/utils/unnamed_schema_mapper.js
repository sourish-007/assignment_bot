import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function resolveUnnamedColumns() {
  const { rows } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);

  const tableMap = {};
  for (const { table_name, column_name } of rows) {
    if (!tableMap[table_name]) tableMap[table_name] = [];
    tableMap[table_name].push(column_name);
  }

  const readable = Object.entries(tableMap)
    .map(([table, cols]) => `• ${table}: ${cols.join(', ')}`)
    .join('\n');

  return {
    map: tableMap,
    readable
  };
}