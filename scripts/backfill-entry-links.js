require('dotenv').config();
const pool = require('../src/db/pool');
const wikilinks = require('../src/services/wikilinks');

async function main() {
  const { rows } = await pool.query('SELECT id, slug, content FROM entries');

  for (const entry of rows) {
    await wikilinks.syncEntryLinks(entry.id, entry.content);
    console.log(`Synced: ${entry.slug}`);
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
