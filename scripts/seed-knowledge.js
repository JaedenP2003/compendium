require('dotenv').config();
const pool = require('../src/db/pool');
const slugify = require('../src/services/slugify');

const entries = [
  {
    title: 'Single-Password Session Gate',
    category: 'weapons',
    summary: 'Pattern for gating a whole app behind one shared password without a full auth system.',
    tags: ['express', 'auth', 'sessions'],
    content: `When an app only has one real user, a full account system (password
hashing, a users table, reset-password flows) is pure overhead. The pattern
used here instead: one shared password, checked against a session flag.

**1. One env var holds the password.**

\`APP_PASSWORD\` in \`.env\` — plaintext is fine here because there's exactly
one real user and it never touches a database. Never do this for an app with
more than one real account.

**2. A tiny middleware gates everything else:**

\`\`\`js
function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  return res.redirect('/login');
}
\`\`\`

**3. The login route does a direct comparison and flips the flag:**

\`\`\`js
router.post('/login', (req, res) => {
  if (req.body.password === process.env.APP_PASSWORD) {
    req.session.authed = true;
    return res.redirect('/');
  }
  res.render('auth/login', { error: 'Wrong password.' });
});
\`\`\`

**4. Mount order matters** — auth routes before the gate, the gate before
everything else, so \`/login\`/\`/logout\` stay reachable while every other
route is blocked:

\`\`\`js
app.use(authRoutes);
app.use(requireAuth);
app.use(indexRoutes);
\`\`\`

**When to reach for this:** a personal tool or dashboard that needs to sit on
a public URL but only you should ever touch. **When not to:** anything with
real users or sensitive data beyond your own notes — use bcrypt + a users
table, or an auth provider, instead.`,
  },
  {
    title: 'Postgres Full-Text Search (tsvector + GIN + ts_rank)',
    category: 'weapons',
    summary: 'Ranked keyword search without a search engine dependency — just Postgres.',
    tags: ['postgres', 'search', 'sql'],
    content: `No Elasticsearch, no Algolia — Postgres does ranked full-text search
natively, and it's plenty for anything under a few hundred thousand rows.

**1. A generated/triggered \`tsvector\` column, weighted by field importance:**

\`\`\`sql
CREATE FUNCTION entries_search_trigger() RETURNS trigger AS $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.summary,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.content,'')), 'C');
  return new;
end
$$ LANGUAGE plpgsql;

CREATE TRIGGER entries_search_update
BEFORE INSERT OR UPDATE ON entries
FOR EACH ROW EXECUTE FUNCTION entries_search_trigger();
\`\`\`

Weight \`A\`/\`B\`/\`C\` means a title match ranks above a summary match, which
ranks above a body match — title hits float to the top.

**2. A GIN index so the query is actually fast:**

\`\`\`sql
CREATE INDEX entries_search_idx ON entries USING GIN (search_vector);
\`\`\`

**3. Query it with \`websearch_to_tsquery\` (handles quotes and \`-exclude\`
like a real search box) and rank with \`ts_rank\`:**

\`\`\`sql
SELECT e.*, ts_rank(e.search_vector, websearch_to_tsquery('english', $1)) AS rank
FROM entries e
WHERE e.search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY rank DESC
LIMIT 50;
\`\`\`

The trigger keeps the vector in sync automatically on every insert/update —
no separate reindex step, no background job.`,
  },
  {
    title: 'method-override v3 Silently Breaks Body-Based Overrides',
    category: 'creatures',
    summary: 'PUT/DELETE forms 404\'d because method-override\'s default getter changed between major versions.',
    tags: ['express', 'bug', 'gotcha'],
    content: `HTML forms can only submit GET or POST, so editing/deleting a resource
from a plain \`<form>\` needs the \`method-override\` middleware to fake PUT/DELETE
from a hidden \`_method\` field.

**The trap:** in method-override 1.x/2.x, passing a string
(\`methodOverride('_method')\`) meant "look for this key in \`req.body\`."
In **v3.0.0** that changed — a string getter now only checks the **query
string**. Passing \`'_method'\` silently stops reading form bodies at all, and
every PUT/DELETE form just 404s as a plain POST with no error pointing at
the real cause.

**Fix:** pass a function instead of a string, and read/delete the field
from \`req.body\` yourself:

\`\`\`js
app.use(
  methodOverride((req) => {
    if (req.body && '_method' in req.body) {
      const method = req.body._method;
      delete req.body._method;
      return method;
    }
  })
);
\`\`\`

Must run **after** \`express.urlencoded()\` (so \`req.body\` exists) and
**before** the routers that expect the rewritten method.

**Lesson:** a major-version bump on a tiny middleware can change default
behavior without throwing — it just quietly stops doing the thing you relied
on. If PUT/DELETE routes ever start 404ing again after a dependency update,
check this first. See also [[render-postgres-needs-ssl-and-node-env-is-the-wrong-signal-for-it]].`,
  },
  {
    title: 'Render Postgres Needs SSL, and NODE_ENV Is the Wrong Signal for It',
    category: 'creatures',
    summary: 'ECONNRESET connecting to a managed Postgres instance because SSL was toggled off the wrong condition.',
    tags: ['postgres', 'ssl', 'render', 'gotcha'],
    content: `**Symptom:** \`npm run migrate\` (or any query) against Render's Postgres
fails with \`Error: read ECONNRESET\` — no useful message, just a dropped
connection.

**Cause:** Render's managed Postgres requires SSL on external connections.
The original code enabled SSL based on \`NODE_ENV === 'production'\`:

\`\`\`js
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
\`\`\`

That's the wrong signal. Running the migration *locally* against the
*external* Render DB URL still has \`NODE_ENV=development\` — so SSL got
disabled exactly when it was required, and Postgres just reset the
connection instead of giving a clear "SSL required" error.

**Fix:** key SSL off whether the connection string actually points at
localhost, not off environment name:

\`\`\`js
const isLocalDb = /localhost|127\\.0\\.0\\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});
\`\`\`

Now the same code works whether you're running migrations from your PC
against the external URL, or the app itself is running inside Render against
the internal URL — both are "not localhost," both get SSL.

**Lesson:** don't infer infrastructure requirements (SSL, TLS, etc.) from an
app-level flag like \`NODE_ENV\`. Infer them from the actual thing that needs
them — here, where the database lives. See also [[method-override-v3-silently-breaks-body-based-overrides]].`,
  },
  {
    title: 'express-ejs-layouts for Shared Page Chrome',
    category: 'materials',
    summary: 'Wraps every EJS view in a common layout without repeating <html>/<head> boilerplate in every template.',
    tags: ['ejs', 'express', 'templating'],
    content: `Plain EJS has no concept of a "layout" — every view is a standalone
file, so shared chrome (the \`<head>\`, sidebar, etc.) would normally have to
be copy-pasted into every template. \`express-ejs-layouts\` fixes that.

**Setup:**

\`\`\`js
app.set('view engine', 'ejs');
app.set('layout', 'layout');   // views/layout.ejs is the default wrapper
app.use(expressLayouts);
\`\`\`

**The layout file gets a \`body\` variable** containing whatever the route
rendered:

\`\`\`ejs
<body>
  <div class="app-shell">
    <%- include('partials/sidebar') %>
    <main class="main-pane">
      <%- body %>
    </main>
  </div>
</body>
\`\`\`

Every view (\`categories/index.ejs\`, \`entries/show.ejs\`, etc.) just renders
its own inner content — no \`<html>\`, no sidebar include, nothing repeated.

**Opting out per-render** (useful for a login page that shouldn't show the
authenticated sidebar):

\`\`\`js
res.render('auth/login', { error: null, layout: false });
\`\`\`

That page then needs its own full \`<!DOCTYPE html>\`/\`<head>\`/\`<body>\`
since it's not going through the wrapper.`,
  },
  {
    title: 'markdown-it Rendering Pipeline',
    category: 'materials',
    summary: 'Turning raw stored markdown into HTML at render time, not at save time.',
    tags: ['markdown', 'markdown-it', 'content-pipeline'],
    content: `**Store the raw markdown, render HTML on the way out — never the
reverse.** The \`entries.content\` column holds exactly what was typed. HTML
is generated fresh on every \`GET /entries/:slug\`:

\`\`\`js
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function render(content) {
  return md.render(content || '');
}
\`\`\`

**Why \`html: false\`:** disables raw HTML passthrough in the markdown source.
Without it, anything typed into the content field — including \`<script>\`
tags — would render verbatim. This is a single-user app, but it costs
nothing to not build the XSS footgun in.

**Why render-on-read instead of render-on-write:** if the rendering rules
ever change (new plugin, syntax highlighting added, a markdown-it option
tweaked), every existing entry benefits immediately with zero migration —
there's no stale pre-rendered HTML sitting in the database to regenerate.

**In the view**, the already-rendered HTML is trusted and unescaped:

\`\`\`ejs
<div class="entry-body"><%- html %></div>
\`\`\`

(\`<%-\` = unescaped output, vs. \`<%=\` which HTML-escapes — only ever use
\`<%-\` for content you've explicitly sanitized, like this markdown pipeline.)`,
  },
  {
    title: 'Unique Slug Generation with Retry Loop',
    category: 'treasure',
    summary: 'A small reusable pattern for turning a title into a URL slug guaranteed unique, including across renames.',
    tags: ['slugs', 'postgres', 'snippet'],
    content: `Reusable in basically any CRUD app with human-readable URLs.

**1. The slugify function itself — no dependency needed:**

\`\`\`js
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
\`\`\`

**2. A retry loop that appends \`-2\`, \`-3\`, etc. until it finds a free slug,**
and can exclude the row's own id so editing a title doesn't collide with
itself:

\`\`\`js
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
    slug = \`\${base}-\${n}\`;
  }
}
\`\`\`

**The \`IS DISTINCT FROM\` trick** is the key detail: on *create*, \`ignoreId\`
is \`null\`, and \`IS DISTINCT FROM NULL\` is true for every real id, so the
check behaves like a normal uniqueness check. On *update*, passing the
row's own id means it won't collide with itself when the title didn't
change enough to actually need a new slug.`,
  },
  {
    title: 'connect-pg-simple: Sessions Backed by the Same Postgres DB',
    category: 'materials',
    summary: 'No Redis, no separate session store — session rows just live in the same database as everything else.',
    tags: ['sessions', 'postgres', 'express-session'],
    content: `For a low-traffic app, adding Redis just to hold session cookies is
one more moving part with no real benefit. \`connect-pg-simple\` stores
sessions as rows in the existing Postgres database instead.

\`\`\`js
const pgSession = require('connect-pg-simple')(session);

app.use(
  session({
    store: new pgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);
\`\`\`

\`createTableIfMissing: true\` means no manual migration step for the session
table — it self-creates on first boot.

**Tradeoff to know about:** every authenticated request does a read/write
against the session table, which is an extra DB round-trip per request
compared to a stateless JWT. At single-user scale this is free; it would be
worth reconsidering at real multi-tenant traffic.`,
  },
  {
    title: 'Render Deploy Pattern: Blueprint + Env Vars + One-Time Migration',
    category: 'runes',
    summary: 'How this app gets from git push to a live URL on Render.',
    tags: ['render', 'deployment', 'postgres'],
    content: `**The pieces:**

1. **\`render.yaml\`** describes both the web service and the database as
   code, so the whole stack is reproducible from one file instead of manual
   dashboard clicking:

\`\`\`yaml
databases:
  - name: compendium-db
    plan: free

services:
  - type: web
    name: compendium
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: compendium-db
          property: connectionString
      - key: SESSION_SECRET
        generateValue: true
      - key: APP_PASSWORD
        sync: false   # prompts for a value instead of committing one
\`\`\`

\`fromDatabase\` wires the connection string automatically. \`generateValue\`
makes Render mint a random secret. \`sync: false\` means "ask me at blueprint
creation time" — the one thing that must never be hardcoded in a committed
file.

2. **Migrations run once, manually** — there's no automatic migration step
   on deploy. Either through Render's Shell tab (\`npm run migrate\`, running
   inside Render's network against the internal DB URL), or temporarily
   pointing a local \`.env\` at the *external* DB URL. See
   [[render-postgres-needs-ssl-and-node-env-is-the-wrong-signal-for-it]] for why that second path needs the SSL fix.

3. **Every push to \`main\` auto-redeploys** once the service is connected to
   the repo — no separate deploy command.

**Node version pinning** avoids Render guessing:

\`\`\`json
"engines": { "node": ">=20.0.0" }
\`\`\`

Note \`render.yaml\` only affects *new* blueprint-based deploys — an
already-existing manually-created service won't retroactively pick it up.`,
  },
  {
    title: 'CSS Custom Properties as a Theming Seam',
    category: 'treasure',
    summary: 'Designing a stylesheet so a future visual overhaul, or a swapped-in font, touches one place instead of every selector.',
    tags: ['css', 'theming', 'design-system'],
    content: `Instead of hardcoding colors/fonts throughout a stylesheet, define them
once as custom properties and reference the variables everywhere:

\`\`\`css
:root {
  --line-gold: #c9a227;
  --line-teal: #2bb8a8;
  --font-display: 'Compendium Display', 'Cinzel', Georgia, serif;
  --font-body: 'Compendium Body', system-ui, sans-serif;
}

h1, h2, h3 { font-family: var(--font-display); }
body { font-family: var(--font-body); }
.sidebar-brand { color: var(--line-gold); }
\`\`\`

**The payoff shows up when the asset doesn't exist yet.** Pairing the
variable with an \`@font-face\` block means the whole site can reference a
custom font before the font file is even in hand:

\`\`\`css
@font-face {
  font-family: 'Compendium Display';
  src: url('/fonts/compendium-display.woff2') format('woff2');
  font-display: swap;
}
\`\`\`

Until that file exists, the browser 404s on the font request and silently
falls through to the next name in the \`--font-display\` stack (\`Cinzel\`,
then \`Georgia\`, then serif) — nothing breaks, nothing needs a code change.
Drop the real file in later and every heading, label, and button that
already referenced \`var(--font-display)\` re-themes itself at once.

**General form of the pattern:** any value that's "probably going to change
later, or doesn't exist yet" — a brand color before the style guide is
final, a font before the asset is delivered, a spacing scale before design
is locked — is worth a variable from the start, even if it only has one
consumer today.`,
  },
];

async function main() {
  for (const e of entries) {
    const { rows: catRows } = await pool.query('SELECT id FROM categories WHERE slug = $1', [e.category]);
    const categoryId = catRows[0]?.id || null;

    const baseSlug = slugify(e.title);
    let slug = baseSlug;
    let n = 1;
    for (;;) {
      const { rows } = await pool.query('SELECT id FROM entries WHERE slug = $1', [slug]);
      if (rows.length === 0) break;
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    const { rows } = await pool.query(
      `INSERT INTO entries (title, slug, category_id, summary, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, slug`,
      [e.title, slug, categoryId, e.summary, e.content]
    );
    const entryId = rows[0].id;

    for (const tagName of e.tags) {
      const { rows: tagRows } = await pool.query(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tagName]
      );
      await pool.query(
        'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [entryId, tagRows[0].id]
      );
    }

    console.log(`Inserted: ${e.title} -> /entries/${rows[0].slug}`);
  }

  // Manually cross-link the entries that reference each other via [[slug]]
  // in their prose (wikilink auto-parsing is Phase 4, not built yet).
  const links = [
    ['method-override-v3-silently-breaks-body-based-overrides', 'render-postgres-needs-ssl-and-node-env-is-the-wrong-signal-for-it'],
    ['render-postgres-needs-ssl-and-node-env-is-the-wrong-signal-for-it', 'method-override-v3-silently-breaks-body-based-overrides'],
    ['render-deploy-pattern-blueprint-env-vars-one-time-migration', 'render-postgres-needs-ssl-and-node-env-is-the-wrong-signal-for-it'],
  ];

  for (const [fromSlug, toSlug] of links) {
    const { rows: fromRows } = await pool.query('SELECT id FROM entries WHERE slug = $1', [fromSlug]);
    const { rows: toRows } = await pool.query('SELECT id FROM entries WHERE slug = $1', [toSlug]);
    if (fromRows.length && toRows.length) {
      await pool.query(
        'INSERT INTO entry_links (from_entry_id, to_entry_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [fromRows[0].id, toRows[0].id]
      );
    } else {
      console.warn(`Skipped link ${fromSlug} -> ${toSlug} (slug not found, check exact slugify output)`);
    }
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
