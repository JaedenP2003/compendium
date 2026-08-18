-- categories = "regions" / item types
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  description TEXT
);

-- tags = "abilities"
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- core content
CREATE TABLE entries (
  id SERIAL PRIMARY KEY,
  entry_number SERIAL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  summary TEXT,
  content TEXT NOT NULL,            -- raw markdown
  discovered_at TIMESTAMP DEFAULT now(),
  last_reviewed_at TIMESTAMP,
  search_vector TSVECTOR
);

CREATE TABLE entry_tags (
  entry_id INT REFERENCES entries(id) ON DELETE CASCADE,
  tag_id INT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE entry_links (
  from_entry_id INT REFERENCES entries(id) ON DELETE CASCADE,
  to_entry_id INT REFERENCES entries(id) ON DELETE CASCADE,
  PRIMARY KEY (from_entry_id, to_entry_id)
);

-- keep search_vector in sync
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

CREATE INDEX entries_search_idx ON entries USING GIN (search_vector);

-- seed categories (the theme mapping)
INSERT INTO categories (name, slug, icon, description) VALUES
  ('Weapons', 'weapons', 'weapons.svg', 'Core language syntax / patterns'),
  ('Materials', 'materials', 'materials.svg', 'Libraries, packages, tools'),
  ('Creatures', 'creatures', 'creatures.svg', 'Bugs, gotchas, monsters fought'),
  ('Runes', 'runes', 'runes.svg', 'CLI tools, utilities, scripts'),
  ('Treasure', 'treasure', 'treasure.svg', 'Reusable snippets / boilerplate'),
  ('Rumors', 'rumors', 'rumors.svg', 'Unverified TILs, needs more testing');
