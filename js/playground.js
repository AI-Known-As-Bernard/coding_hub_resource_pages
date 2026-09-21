/*
 * playground.js
 * The interactive editor: loads examples, runs code against the simulated
 * Express in mini-express.js, sends requests, and hands code off to
 * StackBlitz for real Node.js.
 *
 * Exposes window.Playground = { init, loadPreset, openStackBlitzProject }
 */
(function () {
  'use strict';

  var PRESETS = {
    hello: {
      title: 'Hello server',
      blurb: 'The smallest useful Express app: two routes and app.listen(). Send a request to each route, then to a path that doesn\u2019t exist.',
      requests: [
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/api/time' },
        { method: 'GET', path: '/missing' }
      ]
    },
    routing: {
      title: 'Routing: params, query, body',
      blurb: 'An in-memory users API. Try the query filter, a route parameter, a POST with a JSON body, and the wildcard route.',
      requests: [
        { method: 'GET', path: '/api/users' },
        { method: 'GET', path: '/api/users?role=admin' },
        { method: 'GET', path: '/api/users/2' },
        { method: 'GET', path: '/api/users/99' },
        { method: 'POST', path: '/api/users', body: '{\n  "name": "Grace",\n  "role": "admin"\n}' },
        { method: 'POST', path: '/api/users', body: '{ "role": "admin" }' },
        { method: 'GET', path: '/files/docs/readme.md' }
      ]
    },
    router: {
      title: 'express.Router and controllers',
      blurb: 'Routes grouped in a router and mounted at /api/users. The router\u2019s \u201c/\u201d becomes /api/users. In a real project each section would be its own file.',
      requests: [
        { method: 'GET', path: '/api/users' },
        { method: 'GET', path: '/api/users/1' },
        { method: 'POST', path: '/api/users', body: '{ "name": "Linus" }' },
        { method: 'GET', path: '/users' }
      ]
    },
    middleware: {
      title: 'Middleware pipeline',
      blurb: 'A logger, a middleware that adds data to req, an API-key check scoped to /admin, and a 404 handler. Watch the terminal as requests pass through.',
      requests: [
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/admin/stats' },
        { method: 'GET', path: '/admin/stats', headers: 'x-api-key: secret123' },
        { method: 'GET', path: '/nowhere' }
      ]
    },
    errors: {
      title: 'Error handling: Express 4 vs 5',
      blurb: 'Send each request and compare. Then switch the style at the top of the page and try again: the async error behaves differently in each version.',
      requests: [
        { method: 'GET', path: '/sync-error' },
        { method: 'GET', path: '/async-caught', only: 'cjs' },
        { method: 'GET', path: '/async-uncaught' },
        { method: 'GET', path: '/forbidden', only: 'esm' }
      ]
    },
    env: {
      title: 'Environment variables with dotenv',
      blurb: 'Open the .env tab to see the values. Then comment out the dotenv line, run again, and compare the /config response.',
      env: '# Loaded by dotenv into process.env\nPORT=4000\nNODE_ENV=development\nGREETING=Hello from the .env file\nAPI_KEY=dev-only-change-me\n',
      requests: [
        { method: 'GET', path: '/config' },
        { method: 'GET', path: '/' }
      ]
    }
  };

  var DEFAULT_ENV = '# Values here are loaded only if your code calls dotenv\nPORT=3000\n';
  var REQUEST_TIMEOUT_MS = 3000;

  var el = {};
  var getModule = function () { return 'cjs'; };
  var state = {
    preset: 'hello',
    file: 'code',
    code: '',
    env: DEFAULT_ENV,
    originalCode: '',
    originalEnv: DEFAULT_ENV,
    runtime: null,
    escapePressed: false
  };

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  function init(moduleGetter) {
    getModule = moduleGetter;
    el.root = document.getElementById('pg');
    if (!el.root) return;

    ['preset', 'mode-label', 'reset', 'run', 'blurb', 'notice', 'code', 'highlight',
      'quick', 'method', 'path', 'send', 'headers', 'body', 'response', 'console',
      'clear', 'sb-embed', 'sb-open', 'sb-frame'].forEach(function (id) {
      el[id.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = document.getElementById('pg-' + id);
    });
    el.fileTabs = Array.prototype.slice.call(el.root.querySelectorAll('[data-pg-file]'));

    Object.keys(PRESETS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = PRESETS[key].title;
      el.preset.appendChild(opt);
    });

    el.preset.addEventListener('change', function () { loadPreset(el.preset.value, { scroll: false }); });
    el.reset.addEventListener('click', function () { loadPreset(state.preset, { scroll: false }); });
    el.run.addEventListener('click', run);
    el.send.addEventListener('click', sendFromForm);
    el.path.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendFromForm(); } });
    el.clear.addEventListener('click', function () { el.console.textContent = ''; });
    el.method.addEventListener('change', updateBodyVisibility);

    el.fileTabs.forEach(function (tab) {
      tab.addEventListener('click', function () { switchFile(tab.getAttribute('data-pg-file')); });
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          var other = el.fileTabs.filter(function (t) { return t !== tab; })[0];
          other.focus();
          switchFile(other.getAttribute('data-pg-file'));
        }
      });
    });

    setupEditor();

    el.sbEmbed.addEventListener('click', function () {
      openStackBlitz(playgroundFiles(), { embed: true, title: 'Express playground' });
    });
    el.sbOpen.addEventListener('click', function () {
      openStackBlitz(playgroundFiles(), { embed: false, title: 'Express playground' });
    });

    document.addEventListener('modulechange', onModuleChange);

    loadPreset('hello', { scroll: false, silent: true });
    updateModeLabel();
    print('info', 'Choose an example or write your own code, then press Run.');
  }

  /* ------------------------------------------------------------------ */
  /* Presets and module switching                                        */
  /* ------------------------------------------------------------------ */

  function presetSource(name, mode) {
    var node = document.getElementById('preset-' + name + '-' + mode);
    return node ? node.textContent.replace(/^\n/, '') : '';
  }

  function loadPreset(name, opts) {
    opts = opts || {};
    if (!PRESETS[name]) return;
    var preset = PRESETS[name];
    state.preset = name;
    state.code = presetSource(name, getModule());
    state.env = preset.env || DEFAULT_ENV;
    state.originalCode = state.code;
    state.originalEnv = state.env;
    el.preset.value = name;
    el.blurb.textContent = preset.blurb;
    hideNotice();
    switchFile('code', true);
    renderQuickRequests(preset.requests);
    if (preset.requests[0]) fillRequest(preset.requests[0]);
    stopServer();
    setResponseEmpty();
    if (!opts.silent) print('info', 'Loaded "' + preset.title + '". Press Run to start the server.');
    if (opts.scroll) {
      el.root.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      window.setTimeout(function () { el.code.focus({ preventScroll: true }); }, prefersReducedMotion() ? 0 : 450);
    }
  }

  function onModuleChange() {
    updateModeLabel();
    saveEditor();
    var wasListening = state.runtime && state.runtime.isListening();
    var unmodified = state.code === state.originalCode;
    stopServer();
    if (unmodified) {
      state.code = presetSource(state.preset, getModule());
      state.originalCode = state.code;
      if (state.file === 'code') setEditorValue(state.code);
      hideNotice();
    } else {
      showNotice('You switched to ' + modeName() + '. Your edits are kept, so the code may now use the wrong module syntax. Press "Reset example" to load the ' + modeName() + ' version.');
    }
    renderQuickRequests(PRESETS[state.preset].requests);
    if (wasListening) print('info', 'Server stopped because the code style changed. Press Run to start it again.');
  }

  function modeName() {
    return getModule() === 'esm' ? 'Express 5 (ES modules)' : 'Express 4 (CommonJS)';
  }

  function updateModeLabel() {
    el.modeLabel.textContent = modeName();
  }

  function showNotice(text) { el.notice.textContent = text; el.notice.hidden = false; }
  function hideNotice() { el.notice.hidden = true; el.notice.textContent = ''; }

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */

  function setupEditor() {
    var ta = el.code;
    ta.addEventListener('input', function () {
      renderHighlight();
    });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
        return;
      }
      if (e.key === 'Escape') { state.escapePressed = true; return; }
      if (e.key === 'Tab') {
        if (state.escapePressed) { state.escapePressed = false; return; }
        e.preventDefault();
        if (e.shiftKey) { outdent(); } else { insertText('  '); }
        return;
      }
      state.escapePressed = false;
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        var before = ta.value.slice(0, ta.selectionStart);
        var line = before.slice(before.lastIndexOf('\n') + 1);
        var indent = (/^\s*/.exec(line) || [''])[0];
        if (/[{[(]\s*$/.test(line)) indent += '  ';
        insertText('\n' + indent);
      }
    });
  }

  function insertText(text) {
    var ta = el.code;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    // setRangeText keeps the native undo stack in most browsers when used via execCommand
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, start, end, 'end');
    }
    renderHighlight();
  }

  function outdent() {
    var ta = el.code;
    var start = ta.selectionStart;
    var lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    var remove = /^ {1,2}/.exec(ta.value.slice(lineStart));
    if (!remove) return;
    ta.setRangeText('', lineStart, lineStart + remove[0].length, 'preserve');
    ta.selectionStart = ta.selectionEnd = Math.max(lineStart, start - remove[0].length);
    renderHighlight();
  }

  function renderHighlight() {
    var lang = state.file === 'env' ? 'env' : 'js';
    // Trailing newline keeps the overlay's height in step with the textarea
    el.highlight.innerHTML = window.Highlight.toHTML(el.code.value, lang) + '\n';
    syncScroll();
  }

  function syncScroll() {
    var pre = el.highlight.parentNode;
    pre.scrollTop = el.code.scrollTop;
    pre.scrollLeft = el.code.scrollLeft;
  }

  function saveEditor() {
    if (state.file === 'env') state.env = el.code.value;
    else state.code = el.code.value;
  }

  function setEditorValue(value) {
    el.code.value = value;
    el.code.scrollTop = 0;
    el.code.scrollLeft = 0;
    renderHighlight();
  }

  function switchFile(file, skipSave) {
    if (!skipSave) saveEditor();
    state.file = file;
    el.fileTabs.forEach(function (tab) {
      var active = tab.getAttribute('data-pg-file') === file;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    el.code.setAttribute('aria-labelledby', 'pg-tab-' + file);
    setEditorValue(file === 'env' ? state.env : state.code);
  }

  /* ------------------------------------------------------------------ */
  /* Console output                                                      */
  /* ------------------------------------------------------------------ */

  function print(kind, text) {
    var line = document.createElement('span');
    line.className = 'con-line con-' + kind;
    line.textContent = text + '\n';
    el.console.appendChild(line);
    el.console.scrollTop = el.console.scrollHeight;
  }

  function inspect(value, depth, seen) {
    depth = depth || 0;
    seen = seen || [];
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    var t = typeof value;
    if (t === 'string') return depth === 0 ? value : "'" + value.replace(/'/g, "\\'") + "'";
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
    if (t === 'symbol') return value.toString();
    if (t === 'function') return '[Function: ' + (value.name || '(anonymous)') + ']';
    if (value instanceof Error) return window.MiniExpress.formatError(value);
    if (value instanceof Date) return value.toISOString();
    if (seen.indexOf(value) !== -1) return '[Circular]';
    if (depth > 2) return Array.isArray(value) ? '[Array]' : '[Object]';
    seen = seen.concat([value]);
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      return '[ ' + value.map(function (v) { return inspect(v, depth + 1, seen); }).join(', ') + ' ]';
    }
    var keys = Object.keys(value);
    if (!keys.length) return '{}';
    return '{ ' + keys.map(function (k) {
      var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + k + "'";
      return key + ': ' + inspect(value[k], depth + 1, seen);
    }).join(', ') + ' }';
  }

  function makeConsole() {
    function fmt(args) {
      return Array.prototype.map.call(args, function (a) { return inspect(a, 0); }).join(' ');
    }
    return {
      log: function () { print('log', fmt(arguments)); },
      info: function () { print('log', fmt(arguments)); },
      debug: function () { print('log', fmt(arguments)); },
      warn: function () { print('warn', fmt(arguments)); },
      error: function () { print('error', fmt(arguments)); },
      table: function (data) { print('log', inspect(data, 1)); },
      dir: function (obj) { print('log', inspect(obj, 1)); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Running code                                                        */
  /* ------------------------------------------------------------------ */

  function stripComments(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  }

  function findLine(code, re) {
    var lines = code.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (re.test(stripComments(lines[i]))) return { number: i + 1, text: lines[i] };
    }
    return null;
  }

  function checkModuleSyntax(code, mode) {
    var clean = stripComments(code);
    if (mode === 'cjs') {
      if (/^\s*import(?:\s+[\w{*$]|\s*['"{])/m.test(clean) || /^\s*export\s/m.test(clean)) {
        var line = findLine(code, /^\s*(import|export)\b/);
        return [
          '/project/index.js:' + (line ? line.number : 1),
          line ? line.text : '',
          line ? line.text.replace(/\S.*/, '^^^^^^') : '^^^^^^',
          '',
          'SyntaxError: Cannot use import statement outside a module',
          '',
          'Hint: package.json has no "type": "module", so Node reads .js files as CommonJS.',
          'Use require() and module.exports, or switch the page to Express 5 (ES modules).'
        ].join('\n');
      }
      return null;
    }
    if (/\brequire\s*\(/.test(clean)) {
      var rl = findLine(code, /\brequire\s*\(/);
      return [
        'file:///project/index.js:' + (rl ? rl.number : 1),
        rl ? rl.text : '',
        '',
        'ReferenceError: require is not defined in ES module scope, you can use import instead',
        'This file is being treated as an ES module because it has a \'.js\' file extension and',
        '\'/project/package.json\' contains "type": "module".',
        '',
        'Hint: use import/export, or switch the page to Express 4 (CommonJS).'
      ].join('\n');
    }
    if (/\bmodule\.exports\b|\bexports\.\w+\s*=/.test(clean)) {
      return 'ReferenceError: module is not defined in ES module scope\n\nHint: use export or export default instead of module.exports.';
    }
    if (/\b__dirname\b|\b__filename\b/.test(clean)) {
      return 'ReferenceError: __dirname is not defined in ES module scope\n\nHint: use import.meta.dirname (Node 20.11+) instead.';
    }
    return null;
  }

  /* Convert ES module syntax to the require-style calls the simulator
     understands. Only runs after checkModuleSyntax has passed. */
  function transformESM(code) {
    var counter = 0;
    code = code.replace(/^([ \t]*)import\s+([^'";]+?)\s+from\s+(['"])([^'"]+)\3;?/gm, function (m, indent, clause, q, spec) {
      clause = clause.trim();
      var ns = /^\*\s+as\s+([\w$]+)$/.exec(clause);
      if (ns) return indent + 'const ' + ns[1] + ' = __require(' + JSON.stringify(spec) + ');';
      var named = null;
      var braces = /\{([\s\S]*)\}/.exec(clause);
      if (braces) {
        named = braces[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          .map(function (s) { return s.replace(/\s+as\s+/, ': '); }).join(', ');
        clause = clause.replace(braces[0], '').replace(/,\s*$/, '').replace(/^\s*,/, '').trim();
      }
      var tmp = '__mod' + (counter++);
      var out = indent + 'const ' + tmp + ' = __require(' + JSON.stringify(spec) + ');';
      if (clause) out += ' const ' + clause + ' = (' + tmp + ' && ' + tmp + '.__esDefault) || ' + tmp + ';';
      if (named) out += ' const { ' + named + ' } = ' + tmp + ';';
      return out;
    });
    code = code.replace(/^([ \t]*)import\s+(['"])([^'"]+)\2;?/gm, function (m, indent, q, spec) {
      return indent + '__require(' + JSON.stringify(spec) + ');';
    });
    code = code.replace(/^([ \t]*)export\s+default\s+/gm, '$1__module.exports.default = ');
    code = code.replace(/^([ \t]*)export\s+(?=(?:async\s+)?function|const|let|var|class)/gm, '$1');
    code = code.replace(/\bimport\.meta\.dirname\b/g, "'/project'").replace(/\bimport\.meta\.url\b/g, "'file:///project/index.js'");
    return code;
  }

  function stopServer() {
    if (state.runtime) {
      state.runtime.dispose();
      state.runtime = null;
    }
  }

  function run() {
    saveEditor();
    stopServer();
    var mode = getModule();
    var version = mode === 'esm' ? 5 : 4;

    print('cmd', '\n$ node index.js');

    var syntaxError = checkModuleSyntax(state.code, mode);
    if (syntaxError) {
      print('error', syntaxError);
      print('dim', '\nNode.js exited with code 1');
      return;
    }

    var con = makeConsole();
    var processEnv = { HOME: '/home/student', PATH: '/usr/local/bin:/usr/bin:/bin' };
    var runtime = window.MiniExpress.createRuntime({
      version: version,
      console: con,
      envFile: state.env,
      processEnv: processEnv
    });
    state.runtime = runtime;
    var startedAt = performance.now();

    var intervals = [];
    var proc = {
      env: processEnv,
      argv: ['/usr/local/bin/node', '/project/index.js'],
      version: 'v22.12.0',
      versions: { node: '22.12.0' },
      platform: 'linux',
      pid: 4242,
      cwd: function () { return '/project'; },
      uptime: function () { return (performance.now() - startedAt) / 1000; },
      memoryUsage: function () { return { rss: 48234496, heapTotal: 10485760, heapUsed: 6291456 }; },
      nextTick: function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        Promise.resolve().then(function () { fn.apply(null, args); });
      },
      on: function () { return proc; },
      exit: function (code) {
        var err = new Error('process.exit(' + (code || 0) + ') called');
        err.__exit = true;
        throw err;
      }
    };

    var mod = { exports: {} };
    var requireFn = function (name) { return runtime.resolveModule(name); };
    var timers = {
      setTimeout: function (fn, ms) { return runtime.schedule(fn, ms); },
      clearTimeout: function (id) { clearTimeout(id); },
      setInterval: function (fn, ms) {
        var id = setInterval(fn, Math.max(ms || 0, 50));
        intervals.push(id);
        return id;
      },
      clearInterval: function (id) { clearInterval(id); }
    };
    var origDispose = runtime.dispose;
    runtime.dispose = function () { intervals.forEach(clearInterval); origDispose(); };

    var source = mode === 'esm' ? transformESM(state.code) : state.code;
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    var fn;
    try {
      fn = new AsyncFunction(
        '__require', '__module', 'require', 'module', 'exports', 'process', 'console',
        '__dirname', '__filename', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        '"use strict";\n' + source
      );
    } catch (e) {
      print('error', '/project/index.js\n\n' + window.MiniExpress.formatError(e));
      print('dim', '\nNode.js exited with code 1');
      return;
    }

    var isCjs = mode === 'cjs';
    fn(
      requireFn, mod,
      isCjs ? requireFn : undefined,
      isCjs ? mod : undefined,
      isCjs ? mod.exports : undefined,
      proc, con,
      isCjs ? '/project' : undefined,
      isCjs ? '/project/index.js' : undefined,
      timers.setTimeout, timers.clearTimeout, timers.setInterval, timers.clearInterval
    ).then(function () {
      runtime.schedule(function () {
        if (!runtime.isListening()) {
          print('warn', 'The script finished, but no server is listening. Call app.listen(PORT) so requests can reach your app.');
        }
      }, 60);
    }, function (e) {
      if (e && e.__exit) {
        print('dim', e.message);
        stopServer();
        return;
      }
      print('error', '\n' + window.MiniExpress.formatError(e));
      if (e && /Cannot find module/.test(e.message)) {
        // message already includes the hint
      }
      print('dim', '\nNode.js exited with code 1');
      stopServer();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Requests                                                            */
  /* ------------------------------------------------------------------ */

  function renderQuickRequests(requests) {
    el.quick.textContent = '';
    requests.filter(function (r) { return !r.only || r.only === getModule(); }).forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      var method = document.createElement('span');
      method.className = 'chip-method method-' + r.method.toLowerCase();
      method.textContent = r.method;
      b.appendChild(method);
      b.appendChild(document.createTextNode(' ' + r.path + (r.headers ? ' (with key)' : '') + (r.body && /"name"/.test(r.body) === false ? ' (no name)' : '')));
      b.addEventListener('click', function () {
        fillRequest(r);
        send(r);
      });
      el.quick.appendChild(b);
    });
  }

  function fillRequest(r) {
    el.method.value = r.method;
    el.path.value = r.path;
    el.headers.value = r.headers || '';
    el.body.value = r.body || '';
    updateBodyVisibility();
  }

  function updateBodyVisibility() {
    var hasBody = ['POST', 'PUT', 'PATCH'].indexOf(el.method.value) !== -1;
    el.body.disabled = !hasBody;
    el.body.closest('.pg-panel').classList.toggle('no-body', !hasBody);
  }

  function parseHeaders(text) {
    var out = {};
    text.split('\n').forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  function sendFromForm() {
    send({
      method: el.method.value,
      path: el.path.value.trim() || '/',
      headers: el.headers.value,
      body: el.body.disabled ? '' : el.body.value.trim()
    });
  }

  function send(r) {
    var spec = {
      method: r.method,
      path: r.path,
      headers: parseHeaders(r.headers || ''),
      body: ['POST', 'PUT', 'PATCH'].indexOf(r.method) !== -1 ? (r.body || '').trim() : ''
    };
    if (!state.runtime || !state.runtime.isListening()) {
      renderResponse({ error: 'No server is running. Press Run first, and make sure your code calls app.listen().' }, spec);
      return;
    }
    el.response.innerHTML = '<p class="pg-empty">Waiting for a response\u2026</p>';
    state.runtime.dispatch(spec, REQUEST_TIMEOUT_MS).then(function (result) {
      renderResponse(result, spec);
    });
  }

  function setResponseEmpty() {
    el.response.innerHTML = '<p class="pg-empty">Run your code, then send a request to see the response here.</p>';
  }

  function renderResponse(result, spec) {
    el.response.textContent = '';
    var reqLine = document.createElement('p');
    reqLine.className = 'res-request';
    reqLine.textContent = spec.method + ' ' + spec.path;
    el.response.appendChild(reqLine);

    if (result.error) {
      var err = document.createElement('p');
      err.className = 'res-error';
      err.textContent = result.error;
      el.response.appendChild(err);
      return;
    }

    if (result.hung) {
      var hung = document.createElement('div');
      hung.className = 'res-hung';
      hung.innerHTML = '<strong>No response after ' + (result.ms / 1000) + ' seconds.</strong>' +
        '<p>The request is still open. A real client would keep waiting until it timed out. Every request must end with ' +
        '<code>res.send()</code>, <code>res.json()</code>, <code>res.end()</code>, or be passed on with <code>next()</code>. Check the terminal for errors.</p>';
      el.response.appendChild(hung);
      return;
    }

    var status = document.createElement('p');
    var band = Math.floor(result.status / 100);
    status.className = 'res-status res-' + band + 'xx';
    status.innerHTML = '<span class="res-code"></span> <span class="res-text"></span> <span class="res-time"></span>';
    status.querySelector('.res-code').textContent = result.status;
    status.querySelector('.res-text').textContent = result.statusText;
    status.querySelector('.res-time').textContent = result.ms.toFixed(1) + ' ms';
    el.response.appendChild(status);

    var details = document.createElement('details');
    details.className = 'res-headers';
    var summary = document.createElement('summary');
    summary.textContent = 'Headers (' + Object.keys(result.headers).length + ')';
    details.appendChild(summary);
    var hpre = document.createElement('pre');
    hpre.textContent = Object.keys(result.headers).map(function (k) { return k + ': ' + result.headers[k]; }).join('\n');
    details.appendChild(hpre);
    el.response.appendChild(details);

    var body = document.createElement('pre');
    body.className = 'res-body';
    var ct = result.headers['Content-Type'] || '';
    if (!result.body) {
      body.classList.add('res-body-empty');
      body.textContent = result.status === 204 ? '(204 No Content: empty body, by design)' : '(empty body)';
    } else if (ct.indexOf('json') !== -1) {
      try {
        body.innerHTML = window.Highlight.toHTML(JSON.stringify(JSON.parse(result.body), null, 2), 'json');
      } catch (e) {
        body.textContent = result.body;
      }
    } else {
      body.textContent = result.body;
    }
    el.response.appendChild(body);
  }

  /* ------------------------------------------------------------------ */
  /* StackBlitz                                                          */
  /* ------------------------------------------------------------------ */

  function playgroundFiles() {
    saveEditor();
    var mode = getModule();
    var deps = {
      express: mode === 'esm' ? '^5.1.0' : '^4.21.2'
    };
    var clean = stripComments(state.code);
    if (/['"]dotenv(\/config)?['"]/.test(clean)) deps.dotenv = '^16.4.7';
    if (/['"]cors['"]/.test(clean)) deps.cors = '^2.8.5';
    if (/['"]helmet['"]/.test(clean)) deps.helmet = '^8.0.0';
    if (/['"]morgan['"]/.test(clean)) deps.morgan = '^1.10.0';

    var pkg = {
      name: 'express-playground',
      version: '1.0.0',
      private: true,
      main: 'index.js',
      scripts: { start: 'node index.js' },
      dependencies: deps
    };
    if (mode === 'esm') {
      pkg = {
        name: pkg.name, version: pkg.version, private: true, type: 'module',
        main: pkg.main, scripts: pkg.scripts, dependencies: deps
      };
    }
    return {
      'index.js': state.code,
      'package.json': JSON.stringify(pkg, null, 2) + '\n',
      '.env': state.env
    };
  }

  /* Open a project in StackBlitz using its documented POST API.
     files: { path: contents } */
  function openStackBlitz(files, opts) {
    opts = opts || {};
    var params = new URLSearchParams();
    params.set('file', opts.file || 'index.js');
    params.set('startScript', 'start');
    if (opts.embed) {
      params.set('embed', '1');
      params.set('view', 'both');
      params.set('theme', 'dark');
      params.set('terminalHeight', '40');
    }

    var target = '_blank';
    if (opts.embed) {
      el.sbFrame.hidden = false;
      el.sbFrame.textContent = '';
      var iframe = document.createElement('iframe');
      iframe.name = 'stackblitz-frame';
      iframe.title = 'StackBlitz: live Node.js editor';
      iframe.setAttribute('allow', 'cross-origin-isolated; clipboard-read; clipboard-write');
      el.sbFrame.appendChild(iframe);
      target = iframe.name;
      el.sbEmbed.textContent = 'Reload StackBlitz with current code';
    }

    var form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://stackblitz.com/run?' + params.toString();
    form.target = target;
    form.style.display = 'none';

    function field(name, value) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    field('project[title]', opts.title || 'Express project');
    field('project[description]', opts.description || 'Created from the Node.js and Express tutorial');
    field('project[template]', 'node');
    Object.keys(files).forEach(function (path) {
      field('project[files][' + path + ']', files[path]);
    });

    document.body.appendChild(form);
    form.submit();
    form.remove();

    if (opts.embed) {
      el.sbFrame.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  /* Collect every code block marked data-project="<name>" that is visible
     for the current module style, and open them as one project. */
  function openStackBlitzProject(name) {
    var mode = getModule();
    var files = {};
    var blocks = document.querySelectorAll('pre.code[data-project="' + name + '"]');
    Array.prototype.forEach.call(blocks, function (pre) {
      var variant = pre.closest('.variant');
      if (variant && variant.getAttribute('data-module') !== mode) return;
      files[pre.getAttribute('data-file')] = pre.getAttribute('data-source') || pre.textContent;
    });
    if (files['.env.example'] && !files['.env']) files['.env'] = files['.env.example'];
    openStackBlitz(files, {
      embed: false,
      file: 'src/app.js',
      title: 'my-express-api (' + (mode === 'esm' ? 'Express 5, ES modules' : 'Express 4, CommonJS') + ')',
      description: 'The complete project from the Node.js and Express tutorial'
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  window.Playground = {
    init: init,
    loadPreset: function (name) { loadPreset(name, { scroll: true }); },
    openStackBlitzProject: openStackBlitzProject
  };
})();
