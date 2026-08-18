require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const file = path.join(__dirname, 'migrations', '001_init.sql');
  const sql = fs.readFileSync(file, 'utf8');
  await pool.query(sql);
  console.log('Migration applied.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
