const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function render(content) {
  return md.render(content || '');
}

module.exports = { render };
