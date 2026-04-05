/**
 * API base URL for static HTML.
 *
 * - Open the site from the SAME Node app that serves /api → always use relative "/api"
 *   (works for ANY port: 3001, 3002, 8080, etc.).
 * - Open from file:// → default http://127.0.0.1:3001/api (change via meta or BOOKSTORE_API_BASE).
 * - Live Server / other dev server: "/api" fails → fetchBookstore() retries 127.0.0.1:3001, localhost, etc.
 *
 * Override (in order): js/site-config.js → window.BOOKSTORE_API_BASE
 * Or: <meta name="bookstore-api-base" content="http://localhost:YOUR_PORT/api">
 */
(function (global) {
    function getBookstoreApiBase() {
        if (typeof global.BOOKSTORE_API_BASE === 'string' && global.BOOKSTORE_API_BASE.trim()) {
            return global.BOOKSTORE_API_BASE.replace(/\/$/, '');
        }
        var doc = global.document;
        if (doc) {
            var meta = doc.querySelector('meta[name="bookstore-api-base"]');
            var mc = meta && meta.getAttribute('content');
            if (mc && String(mc).trim()) return String(mc).trim().replace(/\/$/, '');
        }
        var loc = global.location || {};
        if (loc.protocol === 'file:') {
            return 'http://127.0.0.1:3001/api';
        }
        return '/api';
    }

    function defaultPortBases(loc) {
        var host = loc.hostname || '127.0.0.1';
        var out = [];
        // Only try alternate ports on real localhost — never :3001 on Vercel/production hosts.
        if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
            out.push('http://127.0.0.1:3001/api');
            out.push('http://localhost:3001/api');
        }
        return out;
    }

    /**
     * GET (and HEAD) — try same-origin /api first, then common localhost fallbacks for Live Server.
     */
    function fetchBookstore(relativePath, init) {
        var p = relativePath.charAt(0) === '/' ? relativePath : '/' + relativePath;
        var method = (init && init.method && String(init.method).toUpperCase()) || 'GET';
        if (method !== 'GET' && method !== 'HEAD') {
            return fetch(getBookstoreApiBase().replace(/\/$/, '') + p, init || {});
        }
        var loc = global.location || {};
        var bases = [];
        try {
            bases.push(getBookstoreApiBase().replace(/\/$/, ''));
        } catch (e) {}
        if (loc.protocol !== 'file:') {
            defaultPortBases(loc).forEach(function (b) {
                if (bases.indexOf(b) < 0) bases.push(b);
            });
        }
        bases.push('/api');

        var seen = Object.create(null);
        var ordered = [];
        for (var i = 0; i < bases.length; i++) {
            var b = bases[i].replace(/\/$/, '');
            if (!seen[b]) {
                seen[b] = true;
                ordered.push(b);
            }
        }

        var attempt = function (idx) {
            if (idx >= ordered.length) {
                return Promise.reject(
                    new Error(
                        'Bookstore API unreachable. Start MongoDB, then in the /server folder run: npm start'
                    )
                );
            }
            var url = ordered[idx] + p;
            return fetch(url, init || {}).then(
                function (res) {
                    if (res.ok) return res;
                    return attempt(idx + 1);
                },
                function () {
                    return attempt(idx + 1);
                }
            );
        };
        return attempt(0);
    }

    global.getBookstoreApiBase = getBookstoreApiBase;
    global.fetchBookstore = fetchBookstore;
})(typeof window !== 'undefined' ? window : globalThis);
