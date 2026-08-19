const pool = require('../db/pool');
const slugify = require('./slugify');

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function extractRawLinks(content) {
  const found = new Set();
  const re = new RegExp(WIKILINK_RE);
  let match;
  while ((match = re.exec(content || '')) !== null) {
    found.add(match[1].trim());
  }
  return [...found];
}

async function resolveTarget(raw) {
  const bySlug = await pool.query('SELECT id, slug, title FROM entries WHERE slug = $1', [slugify(raw)]);
  if (bySlug.rows.length) return bySlug.rows[0];

  const byTitle = await pool.query('SELECT id, slug, title FROM entries WHERE title ILIKE $1', [raw]);
  if (byTitle.rows.length) return byTitle.rows[0];

  return null;
}

// Rewrites [[slug-or-title]] references into real markdown links so the
// markdown pipeline renders them as <a>. Unresolved references are left
// as literal text rather than a "broken link" style, to keep this simple.
async function replaceWikilinksWithLinks(content) {
  const raws = extractRawLinks(content);
  if (raws.length === 0) return content;

  const resolved = new Map();
  for (const raw of raws) {
    resolved.set(raw, await resolveTarget(raw));
  }

  return content.replace(WIKILINK_RE, (full, raw) => {
    const target = resolved.get(raw.trim());
    if (!target) return full;
    return `[${target.title}](/entries/${target.slug})`;
  });
}

// Re-derives this entry's outgoing entry_links rows from its current
// content. Call on every create/update so "Related Entries" stays in sync
// with whatever [[links]] are currently in the text.
async function syncEntryLinks(entryId, content) {
  const raws = extractRawLinks(content);
  await pool.query('DELETE FROM entry_links WHERE from_entry_id = $1', [entryId]);

  const linked = new Set();
  for (const raw of raws) {
    const target = await resolveTarget(raw);
    if (!target || target.id === entryId || linked.has(target.id)) continue;
    linked.add(target.id);
    await pool.query(
      'INSERT INTO entry_links (from_entry_id, to_entry_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [entryId, target.id]
    );
  }
}

module.exports = { replaceWikilinksWithLinks, syncEntryLinks };
