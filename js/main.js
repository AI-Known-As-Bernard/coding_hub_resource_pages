/*
 * main.js
 * Page-level behaviour: syntax-highlighted code blocks with copy buttons,
 * the Express 4 / Express 5 switch, tabs, lesson navigation, the hero
 * terminal, and the setup checklist.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_MODULE = 'nx-tutorial-module';
  var STORAGE_CHECKS = 'nx-tutorial-checklist';
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }
  function load(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ */
  /* Module switch: Express 4 (CommonJS) vs Express 5 (ES modules)       */
  /* ------------------------------------------------------------------ */

  var currentModule = load(STORAGE_MODULE) === 'esm' ? 'esm' : 'cjs';

  function getModule() { return currentModule; }

  function setModule(mode, anchorEl) {
    if (mode !== 'cjs' && mode !== 'esm') return;
    var changed = mode !== currentModule;

    // Keep whatever the user clicked in the same place on screen, even
    // though code blocks above it may change height.
    var before = anchorEl ? anchorEl.getBoundingClientRect().top : null;

    currentModule = mode;
    root.setAttribute('data-module', mode);
    store(STORAGE_MODULE, mode);

    document.querySelectorAll('[data-set-module]').forEach(function (btn) {
      var active = btn.getAttribute('data-set-module') === mode;
      if (btn.getAttribute('role') === 'tab') {
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
      } else {
        btn.setAttribute('aria-pressed', String(active));
      }
    });

    if (anchorEl && before !== null) {
      var after = anchorEl.getBoundingClientRect().top;
      window.scrollBy(0, after - before);
    }

    if (changed) document.dispatchEvent(new CustomEvent('modulechange', { detail: { module: mode } }));
  }

  // For the top-bar switch: pick the first heading still on screen so the
  // reader's place is kept while code blocks above it change height.
  function headingNearTop() {
    var headings = document.querySelectorAll('main h2, main h3, main h4');
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top >= 64) return headings[i];
    }
    return null;
  }

  function enhanceVariants() {
    document.querySelectorAll('.variants').forEach(function (group) {
      var list = document.createElement('div');
      list.className = 'variant-tabs';
      list.setAttribute('role', 'tablist');
      list.setAttribute('aria-label', 'Code style');
      [['cjs', 'Express 4', 'CommonJS'], ['esm', 'Express 5', 'ES modules']].forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('data-set-module', v[0]);
        b.innerHTML = v[1] + ' <small>' + v[2] + '</small>';
        list.appendChild(b);
      });
      list.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var next = currentModule === 'cjs' ? 'esm' : 'cjs';
        setModule(next, list);
        list.querySelector('[data-set-module="' + next + '"]').focus();
      });
      group.insertBefore(list, group.firstChild);
      group.querySelectorAll('.variant').forEach(function (v) {
        v.setAttribute('role', 'tabpanel');
      });
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-set-module]');
      if (!btn) return;
      setModule(btn.getAttribute('data-set-module'), btn.closest('.variant-tabs') || headingNearTop());
    });
  }

  /* ------------------------------------------------------------------ */
  /* Code blocks: highlighting, filename header, copy button             */
  /* ------------------------------------------------------------------ */

  var LANG_LABEL = { js: 'JavaScript', json: 'JSON', bash: 'Terminal', env: '.env', text: 'Text', out: 'Output' };

  function enhanceCodeBlocks() {
    document.querySelectorAll('pre.code').forEach(function (pre) {
      var code = pre.querySelector('code') || pre;
      var lang = pre.getAttribute('data-lang') || 'text';
      var source = code.textContent;
      pre.setAttribute('data-source', source);

      if (lang !== 'out') code.innerHTML = window.Highlight.toHTML(source, lang);

      var figure = document.createElement('figure');
      figure.className = 'codeblock codeblock-' + lang;

      var head = document.createElement('figcaption');
      head.className = 'codeblock-head';
      var label = document.createElement('span');
      label.className = 'codeblock-file';
      label.textContent = pre.getAttribute('data-file') || LANG_LABEL[lang] || lang;
      head.appendChild(label);

      if (lang !== 'out') {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy ' + label.textContent);
        btn.addEventListener('click', function () {
          copyText(source).then(function () {
            btn.textContent = 'Copied';
            btn.classList.add('is-done');
            announce('Copied to clipboard');
          }, function () {
            btn.textContent = 'Press Ctrl+C';
            selectText(code);
          });
          window.clearTimeout(btn.__t);
          btn.__t = window.setTimeout(function () {
            btn.textContent = 'Copy';
            btn.classList.remove('is-done');
          }, 1800);
        });
        head.appendChild(btn);
      }

      pre.parentNode.insertBefore(figure, pre);
      figure.appendChild(head);
      figure.appendChild(pre);
      pre.tabIndex = 0; // scrollable regions must be keyboard reachable
    });
  }

  function copyText(text) {
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
      if (ok) { resolve(); } else { reject(new Error('Copy failed')); }
    });
  }

  function selectText(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  var liveRegion;
  function announce(text) {
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.className = 'visually-hidden';
      liveRegion.setAttribute('aria-live', 'polite');
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = '';
    window.setTimeout(function () { liveRegion.textContent = text; }, 30);
  }

  /* ------------------------------------------------------------------ */
  /* Generic tabs (operating system instructions)                        */
  /* ------------------------------------------------------------------ */

  function enhanceTabs() {
    document.querySelectorAll('[data-tabs]').forEach(function (group) {
      var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]'));
      function activate(tab, focus) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { activate(tab); });
        tab.addEventListener('keydown', function (e) {
          var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          activate(tabs[(i + dir + tabs.length) % tabs.length], true);
        });
      });
      // Default to the visitor's platform
      if (/Win/i.test(navigator.platform || navigator.userAgent)) {
        var win = tabs.filter(function (t) { return /win/i.test(t.id); })[0];
        if (win) activate(win);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Navigation: active lesson, progress bar, mobile drawer              */
  /* ------------------------------------------------------------------ */

  function setupNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var sections = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);

    function setActive(id) {
      links.forEach(function (a) {
        if (a === byId[id]) { a.setAttribute('aria-current', 'location'); } else { a.removeAttribute('aria-current'); }
      });
    }

    var progressBar = document.querySelector('.progress-bar');
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        var line = window.innerHeight * 0.3;
        var current = null;
        for (var i = 0; i < sections.length; i++) {
          if (sections[i].getBoundingClientRect().top <= line) current = sections[i].id;
        }
        setActive(current);
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    // Mobile drawer
    var toggle = document.querySelector('.nav-toggle');
    var sidebar = document.getElementById('sidebar');
    var scrim = document.querySelector('.scrim');
    function openNav(open) {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.visually-hidden').textContent = open ? 'Close lesson list' : 'Open lesson list';
      scrim.hidden = !open;
      if (open) {
        var first = sidebar.querySelector('a[aria-current]') || sidebar.querySelector('a');
        if (first) first.focus();
      }
    }
    toggle.addEventListener('click', function () { openNav(!document.body.classList.contains('nav-open')); });
    scrim.addEventListener('click', function () { openNav(false); });
    sidebar.addEventListener('click', function (e) { if (e.target.closest('a')) openNav(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        openNav(false);
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Hero terminal replay                                                */
  /* ------------------------------------------------------------------ */

  var HERO_LINES = [
    { cmd: 'node -v' },
    { out: 'v22.12.0' },
    { cmd: 'mkdir my-express-api && cd my-express-api' },
    { cmd: 'npm init -y' },
    { out: 'Wrote to ~/code/my-express-api/package.json' },
    { cmd: 'npm install express' },
    { out: 'added 66 packages, and audited 67 packages in 2s' },
    { cmd: 'npm install --save-dev nodemon' },
    { out: 'added 27 packages, and audited 94 packages in 1s' },
    { cmd: 'npm run dev' },
    { out: '[nodemon] starting `node src/server.js`' },
    { ok: 'Server listening on http://localhost:3000' }
  ];

  function heroTerminal() {
    var term = document.getElementById('hero-terminal');
    if (!term) return;

    function lineNode(item) {
      var span = document.createElement('span');
      if (item.cmd !== undefined) {
        span.className = 't-line';
        span.innerHTML = '<span class="t-prompt" aria-hidden="true">$ </span><span class="t-cmd"></span>';
        span.querySelector('.t-cmd').textContent = item.cmd;
      } else {
        span.className = 't-line ' + (item.ok ? 't-ok' : 't-out');
        span.textContent = item.ok || item.out;
      }
      return span;
    }

    if (reducedMotion) {
      HERO_LINES.forEach(function (item) { term.appendChild(lineNode(item)); term.appendChild(document.createTextNode('\n')); });
      return;
    }

    var i = 0;
    function nextLine() {
      if (i >= HERO_LINES.length) {
        var cursor = document.createElement('span');
        cursor.className = 't-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        term.appendChild(cursor);
        return;
      }
      var item = HERO_LINES[i++];
      var node = lineNode(item);
      term.appendChild(node);
      if (item.cmd !== undefined) {
        var target = node.querySelector('.t-cmd');
        var full = item.cmd;
        target.textContent = '';
        var c = 0;
        (function type() {
          target.textContent = full.slice(0, ++c);
          if (c < full.length) {
            window.setTimeout(type, 16 + Math.random() * 28);
          } else {
            term.appendChild(document.createTextNode('\n'));
            window.setTimeout(nextLine, 260);
          }
        })();
      } else {
        term.appendChild(document.createTextNode('\n'));
        window.setTimeout(nextLine, item.ok ? 0 : 320);
      }
    }
    window.setTimeout(nextLine, 400);
  }

  /* ------------------------------------------------------------------ */
  /* Buttons that load playground examples or open StackBlitz            */
  /* ------------------------------------------------------------------ */

  function setupActions() {
    document.addEventListener('click', function (e) {
      var presetBtn = e.target.closest('[data-preset]');
      if (presetBtn && window.Playground) {
        window.Playground.loadPreset(presetBtn.getAttribute('data-preset'));
        return;
      }
      var sbBtn = e.target.closest('[data-stackblitz-project]');
      if (sbBtn && window.Playground) {
        window.Playground.openStackBlitzProject(sbBtn.getAttribute('data-stackblitz-project'));
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Checklist with saved progress                                       */
  /* ------------------------------------------------------------------ */

  function setupChecklist() {
    var boxes = Array.prototype.slice.call(document.querySelectorAll('[data-check]'));
    var status = document.getElementById('checklist-status');
    var reset = document.getElementById('checklist-reset');
    if (!boxes.length) return;

    var saved = {};
    try { saved = JSON.parse(load(STORAGE_CHECKS) || '{}') || {}; } catch (e) { saved = {}; }

    function update() {
      var done = boxes.filter(function (b) { return b.checked; }).length;
      status.textContent = done === boxes.length
        ? 'All ' + done + ' done. Your project is set up the way a professional team would expect.'
        : done + ' of ' + boxes.length + ' done.';
    }

    boxes.forEach(function (box) {
      box.checked = Boolean(saved[box.getAttribute('data-check')]);
      box.addEventListener('change', function () {
        saved[box.getAttribute('data-check')] = box.checked;
        store(STORAGE_CHECKS, JSON.stringify(saved));
        update();
      });
    });
    reset.addEventListener('click', function () {
      boxes.forEach(function (b) { b.checked = false; });
      saved = {};
      store(STORAGE_CHECKS, '{}');
      update();
    });
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  enhanceVariants();
  enhanceCodeBlocks();
  enhanceTabs();
  setModule(currentModule);
  setupNav();
  heroTerminal();
  setupActions();
  setupChecklist();
  if (window.Playground) window.Playground.init(getModule);
})();
