const pool = require('../db/pool');

async function loadCategories(req, res, next) {
  const { rows } = await pool.query(
    `SELECT c.*, COUNT(e.id)::int AS entry_count
     FROM categories c
     LEFT JOIN entries e ON e.category_id = c.id
     GROUP BY c.id
     ORDER BY c.id`
  );
  res.locals.sidebarCategories = rows;
  next();
}

module.exports = loadCategories;
