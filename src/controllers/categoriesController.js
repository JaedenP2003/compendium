const pool = require('../db/pool');

exports.show = async (req, res) => {
  const { rows: categories } = await pool.query('SELECT * FROM categories WHERE slug = $1', [
    req.params.slug,
  ]);
  if (categories.length === 0) return res.status(404).render('errors/404', { layout: false });
  const category = categories[0];

  const { rows: entries } = await pool.query(
    `SELECT id, entry_number, title, slug, summary FROM entries
     WHERE category_id = $1 ORDER BY title`,
    [category.id]
  );

  res.render('categories/show', { category, entries });
};
