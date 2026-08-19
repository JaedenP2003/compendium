const MarkdownIt = require('markdown-it');
const { createHighlighter } = require('shiki');

const THEME = 'github-dark';
const LANGS = ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'bash', 'sql', 'csharp', 'python', 'java', 'kotlin', 'yaml'];

let highlighter = null;
async function getHighlighter() {
  if (!highlighter) {
    highlighter = await createHighlighter({ themes: [THEME], langs: LANGS });
  }
  return highlighter;
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = (token.info || '').trim().split(/\s+/)[0];

  if (highlighter && lang && highlighter.getLoadedLanguages().includes(lang)) {
    return highlighter.codeToHtml(token.content, { lang, theme: THEME });
  }

  const escaped = md.utils.escapeHtml(token.content);
  return `<pre><code>${escaped}</code></pre>\n`;
};

async function render(content) {
  await getHighlighter();
  return md.render(content || '');
}

module.exports = { render };
