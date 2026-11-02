/* ============================================================
   reference.js — shared behaviour for the reference pages
   ------------------------------------------------------------
   Three jobs, and nothing page-specific:
     1. Syntax-highlight every <pre class="code"> using the
        highlighter the Node walkthrough already ships
        (js/highlight.js). Loads fine without it, just unpainted.
     2. Put a copy button on every code block.
     3. Filter the page: typing in the search box hides any
        entry that does not match, and the contents nav follows
        the entry you are reading.
   ============================================================ */
(function () {
  'use strict';

  /* ---- 1 + 2. Code blocks ---------------------------------- */

  function decorateCode() {
    document.querySelectorAll('pre.code').forEach(function (pre) {
      var code = pre.querySelector('code') || pre;
      var source = code.textContent;
      pre.setAttribute('data-source', source);

      var lang = pre.getAttribute('data-lang') || 'js';
      if (window.Highlight && lang !== 'none') {
        code.innerHTML = window.Highlight.toHTML(source, lang);
      }

      // The label bar is optional in the markup; add one if the
      // block has a filename or language worth showing.
      var panel = pre.closest('.panel');
      var label = panel && panel.querySelector('.pane-label');
      if (!label) return;
      if (label.querySelector('.mini')) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        copy(source).then(function () {
          flash(btn, 'Copied');
        }, function () {
          flash(btn, 'Press Ctrl+C');
          select(code);
        });
      });
      label.appendChild(btn);
    });
  }

  function flash(btn, word) {
    var original = 'Copy';
    btn.textContent = word;
    btn.classList.add('done');
    window.clearTimeout(btn._t);
    btn._t = window.setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove('done');
    }, 1600);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) { resolve(); } else { reject(new Error('copy failed')); }
    });
  }

  function select(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---- 3. Filter ------------------------------------------- */

  function setupFilter() {
    var input = document.getElementById('filter');
    if (!input) return;

    var clear = document.querySelector('.finder .clear');
    var hits = document.getElementById('hits');
    var entries = Array.prototype.slice.call(document.querySelectorAll('.entry'));
    var parts = Array.prototype.slice.call(document.querySelectorAll('.part'));
    var contents = document.querySelector('.contents');
    var empty = document.querySelector('.empty');

    // Searching the rendered text is enough here: these pages are
    // mostly tables, and a student searching "splice" wants the row
    // that mentions splice wherever it sits.
    entries.forEach(function (e) {
      e._hay = (e.textContent || '').toLowerCase();
    });

    function apply() {
      var q = input.value.trim().toLowerCase();
      var shown = 0;

      entries.forEach(function (e) {
        var match = !q || e._hay.indexOf(q) !== -1;
        e.hidden = !match;
        if (match) shown++;
      });

      // Part headings and the contents nav only make sense on the full page.
      var filtering = Boolean(q);
      parts.forEach(function (p) { p.hidden = filtering; });
      if (contents) contents.hidden = filtering;
      if (empty) empty.hidden = !(filtering && shown === 0);

      if (hits) {
        hits.textContent = !filtering
          ? ''
          : shown === 0
            ? 'Nothing matches "' + input.value.trim() + '".'
            : shown + (shown === 1 ? ' entry' : ' entries') + ' matching "' + input.value.trim() + '"';
      }
    }

    input.addEventListener('input', apply);
    if (clear) {
      clear.addEventListener('click', function () {
        input.value = '';
        apply();
        input.focus();
      });
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; apply(); }
    });

    // "/" focuses the box, the same shortcut the hub uses.
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      input.focus();
      input.select();
    });

    apply();
  }

  /* ---- Contents nav follows the reader ---------------------- */

  function setupScrollSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.contents a[href^="#"]'));
    if (!links.length) return;

    var targets = links
      .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
      .filter(Boolean);
    if (!targets.length) return;

    var ticking = false;
    function spy() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        var line = window.innerHeight * 0.3;
        var current = null;
        targets.forEach(function (t) {
          if (!t.hidden && t.getBoundingClientRect().top <= line) current = t.id;
        });
        links.forEach(function (a) {
          if (a.getAttribute('href') === '#' + current) {
            a.setAttribute('aria-current', 'location');
          } else {
            a.removeAttribute('aria-current');
          }
        });
      });
    }
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', spy);
    spy();
  }

  decorateCode();
  setupFilter();
  setupScrollSpy();
})();
