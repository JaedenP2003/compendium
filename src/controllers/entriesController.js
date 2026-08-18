const pool = require('../db/pool');
const markdown = require('../services/markdown');
const slugify = require('../services/slugify');

async function uniqueSlug(title, ignoreId) {
  const base = slugify(title) || 'entry';
  let slug = base;
  let n = 1;
  for (;;) {
    const { rows } = await pool.query(
      'SELECT id FROM entries WHERE slug = $1 AND id IS DISTINCT FROM $2',
      [slug, ignoreId || null]
    );
    if (rows.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

async function loadFormOptions() {
  const { rows: categories } = await pool.query('SELECT * FROM categories ORDER BY name');
  return { categories };
}

async function setTags(entryId, tagNames) {
  await pool.query('DELETE FROM entry_tags WHERE entry_id = $1', [entryId]);
  for (const raw of tagNames) {
    const name = raw.trim();
    if (!name) continue;
    const { rows } = await pool.query(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name]
    );
    await pool.query(
      'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [entryId, rows[0].id]
    );
  }
}

exports.newForm = async (req, res) => {
  const { categories } = await loadFormOptions();
  res.render('entries/new', { categories, entry: {}, tagString: '' });
};

exports.create = async (req, res) => {
  const { title, category_id, summary, content, tags } = req.body;
  const slug = await uniqueSlug(title);
  const { rows } = await pool.query(
    `INSERT INTO entries (title, slug, category_id, summary, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [title, slug, category_id || null, summary || null, content]
  );
  await setTags(rows[0].id, (tags || '').split(','));
  res.redirect(`/entries/${slug}`);
};

exports.show = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*, c.name AS category_name, c.slug AS category_slug
     FROM entries e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.slug = $1`,
    [req.params.slug]
  );
  if (rows.length === 0) return res.status(404).render('errors/404', { layout: false });
  const entry = rows[0];

  const { rows: tags } = await pool.query(
    `SELECT t.name FROM tags t
     JOIN entry_tags et ON et.tag_id = t.id
     WHERE et.entry_id = $1 ORDER BY t.name`,
    [entry.id]
  );

  const { rows: related } = await pool.query(
    `SELECT e2.title, e2.slug FROM entry_links el
     JOIN entries e2 ON e2.id = el.to_entry_id
     WHERE el.from_entry_id = $1`,
    [entry.id]
  );

  res.render('entries/show', {
    entry,
    tags: tags.map((t) => t.name),
    related,
    html: markdown.render(entry.content),
  });
};

exports.editForm = async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM entries WHERE slug = $1', [req.params.slug]);
  if (rows.length === 0) return res.status(404).render('errors/404', { layout: false });
  const entry = rows[0];

  const { rows: tags } = await pool.query(
    `SELECT t.name FROM tags t
     JOIN entry_tags et ON et.tag_id = t.id
     WHERE et.entry_id = $1 ORDER BY t.name`,
    [entry.id]
  );

  const { categories } = await loadFormOptions();
  res.render('entries/edit', { categories, entry, tagString: tags.map((t) => t.name).join(', ') });
};

exports.update = async (req, res) => {
  const { rows } = await pool.query('SELECT id, slug FROM entries WHERE slug = $1', [req.params.slug]);
  if (rows.length === 0) return res.status(404).render('errors/404', { layout: false });
  const entryId = rows[0].id;

  const { title, category_id, summary, content, tags } = req.body;
  const slug = await uniqueSlug(title, entryId);

  await pool.query(
    `UPDATE entries
     SET title = $1, slug = $2, category_id = $3, summary = $4, content = $5, last_reviewed_at = now()
     WHERE id = $6`,
    [title, slug, category_id || null, summary || null, content, entryId]
  );
  await setTags(entryId, (tags || '').split(','));
  res.redirect(`/entries/${slug}`);
};

exports.destroy = async (req, res) => {
  await pool.query('DELETE FROM entries WHERE slug = $1', [req.params.slug]);
  res.redirect('/');
};
