/*
 * mini-express.js
 * A teaching simulation of Express that runs entirely in the browser.
 *
 * It models the parts of Express that students practise in this tutorial:
 * routing (methods, params, query strings, routers), the middleware pipeline
 * (next(), ordering, path-scoped middleware), body parsing, error-handling
 * middleware, and the behavioural differences between Express 4 and 5
 * (async error forwarding, path syntax, req.body defaults, status checks).
 *
 * It is NOT Node.js. No sockets, file system, or streams.
 *
 * Exposes window.MiniExpress.createRuntime(options) -> runtime
 */
(function () {
  'use strict';

  var METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'];

  var STATUS_TEXT = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
    405: 'Method Not Allowed', 409: 'Conflict', 415: 'Unsupported Media Type',
    422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable'
  };

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

  function typeName(v) {
    if (v === null) return 'Null';
    if (v === undefined) return 'Undefined';
    return Object.prototype.toString.call(v).slice(8, -1);
  }

  /* ------------------------------------------------------------------ */
  /* Path compilation (Express 4 vs Express 5 syntax)                    */
  /* ------------------------------------------------------------------ */

  function compileSegment(path, version, keys, offset) {
    var re = '';
    var i = 0;
    while (i < path.length) {
      var c = path[i];
      var rest = path.slice(i);

      if (c === ':') {
        var m = /^:([A-Za-z_$][\w$]*)/.exec(rest);
        if (!m) throw new TypeError('Missing parameter name at index ' + (offset + i) + ': ' + path);
        var name = m[1];
        i += m[0].length;
        if (path[i] === '?') {
          if (version >= 5) {
            throw new TypeError('Unexpected ? at index ' + (offset + i) + ': "' + path +
              '". Express 5 removed "?" optional parameters; use {/:' + name + '} instead.');
          }
          // Express 4 optional param: the preceding slash is optional too
          if (re.slice(-2) === '\\/') re = re.slice(0, -2);
          re += '(?:\\/([^\\/]+?))?';
          keys.push({ name: name });
          i += 1;
        } else {
          re += '([^\\/]+?)';
          keys.push({ name: name });
        }
        continue;
      }

      if (c === '*') {
        var w = /^\*([A-Za-z_$][\w$]*)/.exec(rest);
        if (version >= 5) {
          if (!w) {
            throw new TypeError('Missing parameter name at index ' + (offset + i) + ': "' + path +
              '". Express 5 wildcards need a name, for example /*splat.');
          }
          re += '(.+)';
          keys.push({ name: w[1], splat: true });
          i += w[0].length;
        } else {
          re += '(.*)';
          keys.push({ name: String(keys.filter(function (k) { return /^\d+$/.test(k.name); }).length) });
          i += 1;
        }
        continue;
      }

      if (c === '{' && version >= 5) {
        var depth = 1;
        var j = i + 1;
        while (j < path.length && depth > 0) {
          if (path[j] === '{') depth++;
          if (path[j] === '}') depth--;
          j++;
        }
        if (depth !== 0) throw new TypeError('Unterminated "{" at index ' + (offset + i) + ': ' + path);
        var inner = compileSegment(path.slice(i + 1, j - 1), version, keys, offset + i + 1);
        re += '(?:' + inner + ')?';
        i = j;
        continue;
      }

      if (version >= 5 && (c === '(' || c === ')' || c === '?' || c === '+')) {
        throw new TypeError('Unexpected ' + c + ' at index ' + (offset + i) + ': "' + path +
          '". Express 5 does not support regular-expression characters in string paths.');
      }

      re += escapeRe(c);
      i += 1;
    }
    return re;
  }

  function compilePath(path, opts, version) {
    var keys = [];
    if (path === '/' && !opts.end) {
      return { re: /^(?=\/|$)/i, keys: keys, matchesAll: true };
    }
    var body = compileSegment(path.replace(/\/$/, '') || '/', version, keys, 0);
    var src = '^' + body + (opts.end ? '\\/?$' : '(?=\\/|$)');
    return { re: new RegExp(src, 'i'), keys: keys };
  }

  function extractParams(match, keys) {
    var params = {};
    keys.forEach(function (key, idx) {
      var raw = match[idx + 1];
      if (raw === undefined) return;
      var val;
      try { val = decodeURIComponent(raw); } catch (e) { val = raw; }
      params[key.name] = key.splat ? val.split('/') : val;
    });
    return params;
  }

  /* ------------------------------------------------------------------ */
  /* Runtime                                                             */
  /* ------------------------------------------------------------------ */

  function createRuntime(options) {
    var version = options.version;          // 4 or 5
    var log = options.console;              // { log, info, warn, error }
    var envFile = options.envFile || '';
    var processEnv = options.processEnv;    // shared object
    var listeningApp = null;
    var pendingTimers = [];
    var warnedStatic = false;

    /* ---------------- Router ---------------- */

    function createRouter() {
      var stack = [];

      function router(req, res, next) { router.handle(req, res, next); }
      router.__isRouter = true;
      router.stack = stack;

      router.use = function () {
        var args = Array.prototype.slice.call(arguments);
        var path = '/';
        if (typeof args[0] === 'string') path = args.shift();
        args = flatten(args);
        if (args.length === 0) throw new TypeError('app.use() requires a middleware function');
        args.forEach(function (fn) {
          if (typeof fn !== 'function') {
            throw new TypeError('app.use() requires a middleware function but got a ' + typeName(fn));
          }
          stack.push({ kind: 'use', path: path, matcher: compilePath(path, { end: false }, version), fn: fn });
        });
        return router;
      };

      METHODS.forEach(function (method) {
        router[method] = function (path) {
          var handlers = flatten(Array.prototype.slice.call(arguments, 1));
          if (typeof path !== 'string') {
            throw new TypeError('Route path must be a string (the playground does not support regular-expression paths)');
          }
          if (handlers.length === 0) {
            throw new TypeError('Route.' + method + '() requires a callback function but got a [object Undefined]');
          }
          handlers.forEach(function (fn) {
            if (typeof fn !== 'function') {
              throw new TypeError('Route.' + method + '() requires a callback function but got a [object ' + typeName(fn) + ']');
            }
          });
          stack.push({
            kind: 'route',
            method: method === 'all' ? '*' : method.toUpperCase(),
            path: path,
            matcher: compilePath(path, { end: true }, version),
            handlers: handlers
          });
          return router;
        };
      });

      router.route = function (path) {
        var chain = {};
        METHODS.forEach(function (m) {
          chain[m] = function () {
            router[m].apply(null, [path].concat(Array.prototype.slice.call(arguments)));
            return chain;
          };
        });
        return chain;
      };

      router.handle = function (req, res, out) {
        var idx = 0;

        function next(err) {
          if (err === 'router') { return out(); }
          if (err === 'route') err = undefined;
          if (res.__finished) return;

          var layer = stack[idx++];
          if (!layer) return out(err);

          var path = req.path;
          var match = layer.matcher.re.exec(path);
          if (!match) return next(err);

          if (layer.kind === 'route') {
            var methodOk = layer.method === '*' || layer.method === req.method ||
              (layer.method === 'GET' && req.method === 'HEAD');
            if (!methodOk) return next(err);
            req.params = extractParams(match, layer.matcher.keys);
            req.route = { path: layer.path };
            runRoute(layer.handlers, err, req, res, next);
            return;
          }

          // Path-scoped middleware or a mounted router: strip the prefix
          var matched = layer.matcher.matchesAll ? '' : match[0];
          var savedPath = req.path;
          var savedBase = req.baseUrl;
          var params = extractParams(match, layer.matcher.keys);
          var stripped = path.slice(matched.length);
          if (!stripped || stripped[0] !== '/') stripped = '/' + stripped;

          req.baseUrl = savedBase + matched;
          req.path = stripped;
          req.url = stripped + (req.__search || '');
          if (Object.keys(params).length) req.params = params;

          var restore = function (e) {
            req.baseUrl = savedBase;
            req.path = savedPath;
            req.url = savedPath + (req.__search || '');
            next(e);
          };

          if (layer.fn.__isRouter) {
            layer.fn.handle(req, res, restore);
          } else {
            invoke(layer.fn, err, req, res, restore);
          }
        }

        next();
      };

      return router;
    }

    function runRoute(handlers, err, req, res, done) {
      var i = 0;
      function step(e) {
        if (e === 'route') return done();
        if (res.__finished) return;
        var fn = handlers[i++];
        if (!fn) return done(e);
        invoke(fn, e, req, res, step);
      }
      step(err);
    }

    /* Call a handler or middleware, respecting error arity and
       Express 4 vs 5 promise handling. */
    function invoke(fn, err, req, res, next) {
      var isErrorHandler = fn.length === 4;
      if (err && !isErrorHandler) return next(err);
      if (!err && isErrorHandler) return next();

      var called = false;
      var guardedNext = function (e) {
        if (called) {
          log.warn('Warning: next() was called more than once in the same middleware.');
        }
        called = true;
        next(e);
      };

      var result;
      try {
        result = err ? fn(err, req, res, guardedNext) : fn(req, res, guardedNext);
      } catch (thrown) {
        if (res.__finished) {
          log.error(formatError(thrown));
          return;
        }
        return next(thrown);
      }

      if (result && typeof result.then === 'function') {
        result.then(null, function (rejected) {
          if (version >= 5) {
            if (res.__finished) { log.error(formatError(rejected)); return; }
            next(rejected || new Error('Rejected promise'));
          } else {
            log.error('(node) UnhandledPromiseRejection: ' + formatError(rejected));
            log.warn('Express 4 does not catch errors from async handlers. The error handler never ran, ' +
              'so this request will hang until the client gives up. Wrap the handler body in try/catch and call next(err).');
          }
        });
      }
    }

    /* ---------------- Application ---------------- */

    function createApplication() {
      var app = createRouter();
      var settings = { env: processEnv.NODE_ENV || 'development', 'x-powered-by': true };
      app.locals = {};
      app.settings = settings;

      var routeGet = app.get;
      app.get = function (name) {
        if (arguments.length === 1 && typeof name === 'string') return settings[name];
        return routeGet.apply(app, arguments);
      };
      app.set = function (name, value) {
        if (arguments.length === 1) return settings[name];
        settings[name] = value;
        return app;
      };
      app.enable = function (name) { settings[name] = true; return app; };
      app.disable = function (name) { settings[name] = false; return app; };
      app.enabled = function (name) { return Boolean(settings[name]); };
      app.disabled = function (name) { return !settings[name]; };
      if (version < 5) {
        app.del = function () {
          log.warn('express deprecated app.del: Use app.delete instead');
          return app.delete.apply(app, arguments);
        };
      }

      app.listen = function () {
        var args = Array.prototype.slice.call(arguments);
        var cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        var port = args[0] === undefined ? 0 : args[0];
        listeningApp = app;
        app.__port = port;
        var server = {
          close: function (done) { listeningApp = null; if (done) done(); },
          address: function () { return { port: Number(port) || 3000, address: '::', family: 'IPv6' }; },
          on: function () { return server; }
        };
        schedule(function () { if (cb) cb(); }, 0);
        return server;
      };

      return app;
    }

    function express() { return createApplication(); }

    express.Router = function () { return createRouter(); };

    express.json = function () {
      return function jsonParser(req, res, next) {
        var ct = (req.get('content-type') || '').toLowerCase();
        if (req.__rawBody && ct.indexOf('json') !== -1) {
          try {
            req.body = JSON.parse(req.__rawBody);
          } catch (e) {
            var err = new SyntaxError(e.message);
            err.status = 400;
            err.statusCode = 400;
            err.type = 'entity.parse.failed';
            err.body = req.__rawBody;
            return next(err);
          }
        } else if (version < 5 && req.body === undefined) {
          req.body = {};
        }
        next();
      };
    };

    express.urlencoded = function () {
      return function urlencodedParser(req, res, next) {
        var ct = (req.get('content-type') || '').toLowerCase();
        if (req.__rawBody && ct.indexOf('x-www-form-urlencoded') !== -1) {
          req.body = parseQuery(req.__rawBody);
        } else if (version < 5 && req.body === undefined) {
          req.body = {};
        }
        next();
      };
    };

    express.static = function (root) {
      return function serveStatic(req, res, next) {
        if (!warnedStatic) {
          log.info('Note: express.static("' + root + '") is registered, but the playground has no file system, so it serves nothing.');
          warnedStatic = true;
        }
        next();
      };
    };

    /* ---------------- Simplified third-party middleware ---------------- */

    function cors(opts) {
      opts = opts || {};
      return function corsMiddleware(req, res, next) {
        res.set('Access-Control-Allow-Origin', opts.origin || '*');
        if (req.method === 'OPTIONS') {
          res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
          return res.sendStatus(204);
        }
        next();
      };
    }

    function helmet() {
      return function helmetMiddleware(req, res, next) {
        res.__noPoweredBy = true;
        res.set('Content-Security-Policy', "default-src 'self'");
        res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'SAMEORIGIN');
        next();
      };
    }

    function morgan(format) {
      return function morganMiddleware(req, res, next) {
        var start = performance.now();
        res.on('finish', function () {
          var ms = (performance.now() - start).toFixed(3);
          var len = res.get('Content-Length') || '-';
          if (format === 'tiny') {
            log.log(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + len + ' - ' + ms + ' ms');
          } else {
            log.log(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + ms + ' ms - ' + len);
          }
        });
        next();
      };
    }

    /* ---------------- dotenv ---------------- */

    function parseEnv(text) {
      var parsed = {};
      text.split(/\r?\n/).forEach(function (line) {
        var m = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
        if (!m || /^\s*#/.test(line)) return;
        var value = (m[2] || '').trim();
        if (/^(['"`]).*\1$/.test(value)) {
          value = value.slice(1, -1);
        } else {
          value = value.replace(/\s+#.*$/, '');
        }
        parsed[m[1]] = value;
      });
      return parsed;
    }

    var dotenv = {
      config: function (opts) {
        opts = opts || {};
        if (!envFile.trim()) {
          var err = new Error("ENOENT: no such file or directory, open '/project/.env'");
          err.code = 'ENOENT';
          return { error: err };
        }
        var parsed = parseEnv(envFile);
        Object.keys(parsed).forEach(function (key) {
          if (!(key in processEnv) || opts.override) processEnv[key] = parsed[key];
        });
        return { parsed: parsed };
      },
      parse: parseEnv
    };

    /* ---------------- Request dispatch ---------------- */

    function createRequest(spec) {
      var urlObj = new URL(spec.path.charAt(0) === '/' ? spec.path : '/' + spec.path, 'http://localhost');
      var headers = {};
      Object.keys(spec.headers || {}).forEach(function (k) { headers[k.toLowerCase()] = spec.headers[k]; });
      if (spec.body && !headers['content-type']) headers['content-type'] = 'application/json';
      headers.host = headers.host || 'localhost:' + (listeningApp && listeningApp.__port || 3000);

      var req = {
        method: spec.method.toUpperCase(),
        url: urlObj.pathname + urlObj.search,
        originalUrl: urlObj.pathname + urlObj.search,
        path: urlObj.pathname,
        baseUrl: '',
        hostname: 'localhost',
        ip: '::1',
        protocol: 'http',
        secure: false,
        headers: headers,
        query: parseQuery(urlObj.search.slice(1)),
        params: {},
        body: undefined,
        __rawBody: spec.body || '',
        __search: urlObj.search,
        get: function (name) { return headers[String(name).toLowerCase()]; },
        header: function (name) { return headers[String(name).toLowerCase()]; },
        is: function (type) {
          var ct = headers['content-type'] || '';
          return ct.indexOf(type.replace('*', '')) !== -1 ? type : false;
        }
      };
      if (version < 5) {
        req.param = function (name) {
          log.warn('express deprecated req.param(name): Use req.params, req.body, or req.query instead');
          return req.params[name] !== undefined ? req.params[name] :
            (req.body && req.body[name] !== undefined ? req.body[name] : req.query[name]);
        };
      }
      return req;
    }

    function createResponse(app, onFinish) {
      var listeners = { finish: [] };
      var res = {
        statusCode: 200,
        locals: {},
        headersSent: false,
        __finished: false,
        __headers: {},
        __body: ''
      };

      function finish(body) {
        if (res.__finished) {
          var err = new Error('Cannot set headers after they are sent to the client');
          err.code = 'ERR_HTTP_HEADERS_SENT';
          throw err;
        }
        res.__finished = true;
        res.headersSent = true;
        res.__body = body === undefined ? '' : String(body);
        if (!res.__noPoweredBy && app.settings['x-powered-by']) res.__headers['X-Powered-By'] = 'Express';
        if (res.__body && !res.__headers['Content-Length']) {
          res.__headers['Content-Length'] = String(new Blob([res.__body]).size);
        }
        schedule(function () {
          listeners.finish.forEach(function (fn) { try { fn(); } catch (e) { log.error(formatError(e)); } });
          onFinish(res);
        }, 0);
        return res;
      }

      res.status = function (code) {
        if (version >= 5 && (!Number.isInteger(code) || code < 100 || code > 999)) {
          throw new RangeError('Invalid status code: ' + JSON.stringify(code) +
            '. Status code must be an integer greater than 99 and less than 1000.');
        }
        res.statusCode = code;
        return res;
      };
      res.set = res.header = function (name, value) {
        if (typeof name === 'object') {
          Object.keys(name).forEach(function (k) { res.__headers[canon(k)] = String(name[k]); });
        } else {
          res.__headers[canon(name)] = String(value);
        }
        return res;
      };
      res.setHeader = function (n, v) { res.set(n, v); };
      res.get = res.getHeader = function (name) { return res.__headers[canon(name)]; };
      res.removeHeader = function (name) { delete res.__headers[canon(name)]; };
      res.type = function (t) {
        var map = { json: 'application/json', html: 'text/html', text: 'text/plain', txt: 'text/plain' };
        res.set('Content-Type', (map[t] || t) + (/^text\/|json/.test(map[t] || t) ? '; charset=utf-8' : ''));
        return res;
      };
      res.json = function (obj) {
        if (!res.get('Content-Type')) res.set('Content-Type', 'application/json; charset=utf-8');
        return finish(JSON.stringify(obj));
      };
      res.send = function (body) {
        if (typeof body === 'number' && arguments.length === 1) {
          if (version < 5) {
            log.warn('express deprecated res.send(status): Use res.sendStatus(status) instead');
            return res.sendStatus(body);
          }
          log.warn('res.send(status) was removed in Express 5. The number is sent as the body; use res.sendStatus(' + body + ').');
          body = String(body);
        }
        if (body !== null && typeof body === 'object') return res.json(body);
        if (!res.get('Content-Type')) res.set('Content-Type', 'text/html; charset=utf-8');
        return finish(body === undefined ? '' : body);
      };
      res.sendStatus = function (code) {
        res.status(code);
        if (!res.get('Content-Type')) res.set('Content-Type', 'text/plain; charset=utf-8');
        return finish(STATUS_TEXT[code] || String(code));
      };
      res.end = function (data) { return finish(data); };
      res.redirect = function (a, b) {
        var status = typeof a === 'number' ? a : 302;
        var url = typeof a === 'number' ? b : a;
        res.status(status).set('Location', url);
        return finish('Redirecting to ' + url);
      };
      res.cookie = function (name, value) {
        res.set('Set-Cookie', name + '=' + encodeURIComponent(value) + '; Path=/');
        return res;
      };
      res.clearCookie = function (name) {
        res.set('Set-Cookie', name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        return res;
      };
      res.render = function () {
        throw new Error('res.render() needs a view engine and template files, which the playground does not have. Try this in StackBlitz.');
      };
      res.sendFile = function () {
        throw new Error('res.sendFile() needs a file system, which the playground does not have. Try this in StackBlitz.');
      };
      res.on = res.once = function (event, fn) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
        return res;
      };
      return res;
    }

    function finalHandler(req, res, err) {
      if (res.__finished) {
        if (err) log.error(formatError(err));
        return;
      }
      try {
        if (err) {
          var status = err.status || err.statusCode;
          if (!status || status < 400 || status > 599) status = 500;
          log.error(formatError(err));
          res.statusCode = status;
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set('Content-Security-Policy', "default-src 'none'");
          // Express prints the stack trace outside production. Browser stack
          // frames would be meaningless here, so we show the error line only.
          var message = processEnv.NODE_ENV === 'production'
            ? (STATUS_TEXT[status] || 'Error')
            : formatError(err).replace(/&/g, '&amp;').replace(/</g, '&lt;');
          res.end('<!DOCTYPE html>\n<pre>' + message + '</pre>');
        } else {
          res.statusCode = 404;
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set('Content-Security-Policy', "default-src 'none'");
          res.end('<!DOCTYPE html>\n<pre>Cannot ' + req.method + ' ' + req.originalUrl.split('?')[0] + '</pre>');
        }
      } catch (e) {
        log.error(formatError(e));
      }
    }

    function dispatch(spec, timeoutMs) {
      return new Promise(function (resolve) {
        if (!listeningApp) {
          resolve({ error: 'connect ECONNREFUSED 127.0.0.1:3000. No server is listening. Run your code, and make sure it calls app.listen().' });
          return;
        }
        var app = listeningApp;
        var started = performance.now();
        var settled = false;

        var res = createResponse(app, function (r) {
          if (settled) return;
          settled = true;
          resolve({
            status: r.statusCode,
            statusText: STATUS_TEXT[r.statusCode] || '',
            headers: r.__headers,
            body: r.__body,
            ms: performance.now() - started
          });
        });

        var req = createRequest(spec);
        req.res = res;
        res.req = req;

        schedule(function () {
          if (settled) return;
          settled = true;
          resolve({
            hung: true,
            ms: timeoutMs
          });
        }, timeoutMs);

        try {
          app.handle(req, res, function (err) { finalHandler(req, res, err); });
        } catch (e) {
          finalHandler(req, res, e);
        }
      });
    }

    function schedule(fn, ms) {
      var id = setTimeout(fn, ms);
      pendingTimers.push(id);
      return id;
    }

    function dispose() {
      pendingTimers.forEach(clearTimeout);
      pendingTimers = [];
      listeningApp = null;
    }

    var modules = {
      express: express,
      dotenv: dotenv,
      'dotenv/config': { __sideEffect: function () { dotenv.config(); } },
      cors: cors,
      helmet: helmet,
      morgan: morgan
    };

    function resolveModule(name) {
      var bare = name.replace(/^node:/, '');
      if (Object.prototype.hasOwnProperty.call(modules, bare)) {
        var mod = modules[bare];
        if (mod && mod.__sideEffect) { mod.__sideEffect(); return {}; }
        return mod;
      }
      var err = new Error("Cannot find module '" + name + "'\n" +
        'The playground only simulates express, dotenv, cors, helmet, and morgan. ' +
        'Local files and other packages need real Node: use the StackBlitz button below.');
      err.code = 'MODULE_NOT_FOUND';
      throw err;
    }

    return {
      resolveModule: resolveModule,
      dispatch: dispatch,
      dispose: dispose,
      schedule: schedule,
      isListening: function () { return Boolean(listeningApp); },
      port: function () { return listeningApp ? listeningApp.__port : null; }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  function flatten(arr) {
    return arr.reduce(function (acc, v) { return acc.concat(Array.isArray(v) ? flatten(v) : [v]); }, []);
  }

  function canon(name) {
    return String(name).split('-').map(function (p) {
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }).join('-');
  }

  function parseQuery(search) {
    var out = {};
    if (!search) return out;
    new URLSearchParams(search).forEach(function (value, key) {
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = [].concat(out[key], value);
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  function formatError(err) {
    if (!err) return String(err);
    if (err instanceof Error) {
      var name = err.name || 'Error';
      var head = name + ': ' + err.message;
      if (err.code) head += ' (' + err.code + ')';
      return head;
    }
    return String(err);
  }

  window.MiniExpress = { createRuntime: createRuntime, formatError: formatError };
})();
