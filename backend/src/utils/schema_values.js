import { Pool } from 'pg';
const POOL = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getSchemaWithValues(limit = 5) {
  const { rows: meta } = await POOL.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const tableMap = meta.reduce((acc, { table_name, column_name, data_type }) => {
    if (!acc[table_name]) acc[table_name] = [];
    acc[table_name].push({ column_name, data_type });
    return acc;
  }, {});

  const sections = [];
  for (const [table, cols] of Object.entries(tableMap)) {
    const lines = [`TABLE: ${table}`, `COLUMNS:`];
    for (const { column_name, data_type } of cols) {
      let sampleText = '';
      if (['text', 'character varying', 'varchar', 'char'].includes(data_type.toLowerCase())) {
        try {
          const { rows: vals } = await POOL.query(
            `SELECT DISTINCT ${column_name} 
             FROM ${table} 
             WHERE ${column_name} IS NOT NULL 
             LIMIT ${limit}`
          );
          const samples = vals.map(r => r[column_name]);
          if (samples.length) {
            sampleText = `  Values: [${samples.map(v => JSON.stringify(v)).join(', ')}]`;
          }
        } catch {
          // ignore errors sampling
        }
      }
      lines.push(`  • ${column_name} (${data_type})${sampleText}`);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
