const pool = require('../db/pool');

exports.results = async (req, res) => {
  const q = (req.query.q || '').trim();

  if (!q) {
    return res.render('search/results', { q, results: [] });
  }

  const { rows: results } = await pool.query(
    `SELECT e.id, e.entry_number, e.title, e.slug, e.summary,
            c.name AS category_name, c.slug AS category_slug,
            ts_rank(e.search_vector, websearch_to_tsquery('english', $1)) AS rank
     FROM entries e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.search_vector @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT 50`,
    [q]
  );

  res.render('search/results', { q, results });
};
