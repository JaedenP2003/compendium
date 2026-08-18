# Custom fonts

Drop font files here and they'll be picked up automatically:

- `compendium-display.woff2` — used for headings, entry titles, the sidebar
  brand, nav labels (`--font-display` in `public/css/theme.css`)
- `compendium-body.woff2` — used for body text, forms, entry content
  (`--font-body`)

Until these files exist, the site falls back to `Cinzel`/`Georgia`/serif for
display text and the system font for body text — nothing breaks, it just
isn't the finished look.

If your font file has a different name or format (`.ttf`, `.otf`), update the
`@font-face` `src` in `theme.css` to match, or convert it to `.woff2` first
(smaller, faster to load — [Google's woff2 tools](https://github.com/google/woff2)
or an online converter both work).
