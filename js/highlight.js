/*
 * highlight.js
 * A small, dependency-free syntax highlighter for the languages used in
 * this tutorial: JavaScript, JSON, shell commands, and .env files.
 * Exposes window.Highlight.toHTML(source, lang) -> HTML string.
 */
(function () {
  'use strict';

  var KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'of', 'in', 'new', 'class', 'extends', 'import', 'export', 'from', 'default',
    'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
    'this', 'as', 'switch', 'case', 'break', 'continue', 'do', 'delete', 'void',
    'yield', 'static', 'get', 'set'
  ]);
  var LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
  var BUILTINS = new Set([
    'require', 'module', 'exports', 'process', 'console', '__dirname',
    '__filename', 'globalThis', 'Promise', 'JSON', 'Number', 'String',
    'Boolean', 'Array', 'Object', 'Error', 'Date', 'Math', 'describe', 'it',
    'expect'
  ]);

  function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + escapeHTML(text) + '</span>';
  }

  /* Run a list of sticky regex rules over the source. Each rule is
     [className | function(match, src, pos) -> className, RegExp]. */
  function tokenize(src, rules) {
    var out = '';
    var pos = 0;
    var plain = '';
    while (pos < src.length) {
      var matched = false;
      for (var i = 0; i < rules.length; i++) {
        var re = rules[i][1];
        re.lastIndex = pos;
        var m = re.exec(src);
        if (m && m[0].length > 0) {
          var cls = typeof rules[i][0] === 'function' ? rules[i][0](m[0], src, pos) : rules[i][0];
          if (plain) { out += escapeHTML(plain); plain = ''; }
          out += cls ? span(cls, m[0]) : escapeHTML(m[0]);
          pos += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        plain += src[pos];
        pos += 1;
      }
    }
    if (plain) out += escapeHTML(plain);
    return out;
  }

  var JS_RULES = [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    ['string', /`(?:\\[\s\S]|[^\\`])*`|'(?:\\.|[^\\'\n])*'|"(?:\\.|[^\\"\n])*"/y],
    ['number', /\b\d+(?:\.\d+)?\b/y],
    [function (word, src, pos) {
      if (KEYWORDS.has(word)) return 'keyword';
      if (LITERALS.has(word)) return 'literal';
      if (BUILTINS.has(word)) return 'builtin';
      // Property access: previous non-space char is "."
      var after = src.slice(pos + word.length);
      if (/^\s*\(/.test(after)) return 'fn';
      return '';
    }, /[A-Za-z_$][\w$]*/y]
  ];

  var JSON_RULES = [
    ['key', /"(?:\\.|[^\\"\n])*"(?=\s*:)/y],
    ['string', /"(?:\\.|[^\\"\n])*"/y],
    ['number', /-?\b\d+(?:\.\d+)?\b/y],
    ['literal', /\b(?:true|false|null)\b/y]
  ];

  function atLineStart(src, pos) {
    var i = pos - 1;
    while (i >= 0 && (src[i] === ' ' || src[i] === '\t')) i--;
    return i < 0 || src[i] === '\n';
  }

  var BASH_RULES = [
    [function (t, src, pos) { return atLineStart(src, pos) || /\s/.test(src[pos - 1] || '') ? 'comment' : ''; }, /#[^\n]*/y],
    ['string', /'[^'\n]*'|"(?:\\.|[^\\"\n])*"/y],
    ['operator', /&&|\|\||\||>>?/y],
    [function (t, src, pos) {
      var prev = src[pos - 1];
      return (prev === undefined || /\s/.test(prev)) ? 'flag' : '';
    }, /--?[A-Za-z][\w-]*(?:=[^\s]*)?/y],
    [function (word, src, pos) {
      if (atLineStart(src, pos)) return 'command';
      // First word after && or | is also a command
      var before = src.slice(Math.max(0, pos - 4), pos);
      if (/(?:&&|\|)\s*$/.test(before)) return 'command';
      return '';
    }, /[A-Za-z_][\w.\-]*/y]
  ];

  var ENV_RULES = [
    [function (t, src, pos) { return atLineStart(src, pos) ? 'comment' : ''; }, /#[^\n]*/y],
    [function (t, src, pos) { return atLineStart(src, pos) ? 'key' : ''; }, /[A-Za-z_][A-Za-z0-9_]*(?==)/y],
    ['operator', /=/y],
    ['string', /[^\n]+/y]
  ];

  var TEXT_RULES = [
    [function (t, src, pos) { return atLineStart(src, pos) ? 'comment' : ''; }, /#[^\n]*/y]
  ];

  var LANGS = { js: JS_RULES, json: JSON_RULES, bash: BASH_RULES, env: ENV_RULES, text: TEXT_RULES };

  function toHTML(src, lang) {
    var rules = LANGS[lang];
    if (!rules) return escapeHTML(src);
    return tokenize(src, rules);
  }

  window.Highlight = { toHTML: toHTML, escapeHTML: escapeHTML };
})();
