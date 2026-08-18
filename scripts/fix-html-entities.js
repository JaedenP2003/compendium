require('dotenv').config();
const pool = require('../src/db/pool');

async function main() {
  const { rows } = await pool.query(
    `SELECT id, slug, content FROM entries
     WHERE content LIKE '%&gt;%' OR content LIKE '%&lt;%' OR content LIKE '%&amp;%'`
  );

  console.log(`Found ${rows.length} entries with stray HTML entities.`);

  for (const row of rows) {
    const fixed = row.content
      .replace(/&amp;&amp;/g, '&&')
      .replace(/&amp;/g, '&')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<');

    if (fixed !== row.content) {
      await pool.query('UPDATE entries SET content = $1 WHERE id = $2', [fixed, row.id]);
      console.log(`Fixed: ${row.slug}`);
    }
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
