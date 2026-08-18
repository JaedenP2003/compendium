const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  const { rows: categories } = await pool.query(
    `SELECT c.*, COUNT(e.id)::int AS entry_count
     FROM categories c
     LEFT JOIN entries e ON e.category_id = c.id
     GROUP BY c.id
     ORDER BY c.id`
  );
  res.render('categories/index', { categories });
});

module.exports = router;
