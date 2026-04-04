/**
 * Wishlist (localStorage) — shared across pages.
 * Storage: localStorage['wishlist'] = [{ _id, title, author, category, price, coverImage }]
 */
(function () {
    var KEY = 'wishlist';

    function safeJsonParse(s, fallback) {
        try {
            var v = JSON.parse(s);
            return v == null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function getWishlist() {
        var arr = safeJsonParse(localStorage.getItem(KEY) || '[]', []);
        return Array.isArray(arr) ? arr : [];
    }

    function setWishlist(items) {
        localStorage.setItem(KEY, JSON.stringify(items || []));
        updateWishlistCount();
        refreshWishlistButtons();
        try {
            document.dispatchEvent(new CustomEvent('bookhaven-wishlist-updated'));
        } catch (e) {}
    }

    function normalizeBook(b) {
        if (!b) return null;
        var id = b._id != null ? String(b._id) : '';
        if (!id) return null;
        return {
            _id: id,
            title: String(b.title || '').slice(0, 500),
            author: String(b.author || '').slice(0, 200),
            category: String(b.category || ''),
            price: Number(b.price || 0),
            coverImage: String(b.coverImage || '')
        };
    }

    function isWishlisted(bookId) {
        var id = String(bookId || '');
        if (!id) return false;
        return getWishlist().some(function (x) {
            return String(x && x._id) === id;
        });
    }

    function addToWishlist(book, opts) {
        var silent = opts && opts.silent;
        var b = normalizeBook(book);
        if (!b) return false;
        var items = getWishlist();
        if (items.some(function (x) { return String(x._id) === String(b._id); })) return false;
        items.unshift(b);
        setWishlist(items);
        if (!silent) miniToast('Added to wishlist');
        return true;
    }

    function removeFromWishlist(bookId) {
        var id = String(bookId || '');
        if (!id) return;
        var items = getWishlist().filter(function (x) {
            return String(x && x._id) !== id;
        });
        setWishlist(items);
        miniToast('Removed from wishlist');
    }

    function toggleWishlist(book) {
        var b = normalizeBook(book);
        if (!b) return;
        if (isWishlisted(b._id)) {
            removeFromWishlist(b._id);
        } else {
            addToWishlist(b);
        }
    }

    function miniToast(message) {
        // Reuse existing toast component if present.
        var toast = document.getElementById('toast');
        var msg = document.getElementById('toast-message');
        if (toast && msg) {
            msg.textContent = message;
            toast.classList.add('show');
            setTimeout(function () {
                toast.classList.remove('show');
            }, 2200);
            return;
        }
        if (typeof window.showToast === 'function') window.showToast(message);
    }

    function updateWishlistCount() {
        var count = getWishlist().length;
        document.querySelectorAll('.wishlist-count').forEach(function (el) {
            el.textContent = String(count);
        });
    }

    /** Absolute URL to wishlist.html in the same folder as the current page. */
    function getWishlistPageHref() {
        try {
            return new URL('wishlist.html', window.location.href).href.split('#')[0];
        } catch (e) {
            return 'wishlist.html';
        }
    }

    /**
     * Build share link: wishlist.html?ids=id1,id2,...
     * Caps length for very large lists (browser URL limits).
     */
    function buildWishlistShareUrl() {
        var ids = getWishlist()
            .map(function (x) {
                return x && x._id != null ? String(x._id) : '';
            })
            .filter(Boolean);
        var max = 80;
        if (ids.length > max) ids = ids.slice(0, max);
        var url = new URL(getWishlistPageHref());
        url.searchParams.set('ids', ids.join(','));
        return url.toString();
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                resolve();
            } catch (e) {
                reject(e);
            }
            document.body.removeChild(ta);
        });
    }

    function copyWishlistShareLink() {
        var items = getWishlist();
        if (!items.length) {
            miniToast('Your wishlist is empty — add books first');
            return;
        }
        var url = buildWishlistShareUrl();
        copyText(url)
            .then(function () {
                miniToast('Share link copied!');
            })
            .catch(function () {
                miniToast('Could not copy — copy the address bar manually');
            });
    }

    function refreshWishlistButtons() {
        var items = getWishlist();
        var set = Object.create(null);
        items.forEach(function (x) {
            if (x && x._id != null) set[String(x._id)] = true;
        });

        document.querySelectorAll('[data-wishlist-id]').forEach(function (btn) {
            var id = String(btn.getAttribute('data-wishlist-id') || '');
            var on = !!set[id];
            btn.classList.toggle('is-wishlisted', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            var icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-solid', on);
                icon.classList.toggle('fa-regular', !on);
            }
        });
    }

    function bindWishlistButtons() {
        document.addEventListener('click', function (e) {
            var t = e.target;
            var btn = t && t.closest ? t.closest('[data-wishlist-toggle]') : null;
            if (!btn) return;
            e.preventDefault();

            var id = btn.getAttribute('data-wishlist-id');
            var payload = btn.getAttribute('data-wishlist-payload');
            var book = null;

            if (payload) {
                book = safeJsonParse(payload, null);
            } else if (id) {
                // Try to resolve from global book arrays on different pages.
                if (Array.isArray(window.apiBooks)) {
                    book = window.apiBooks.find(function (x) { return String(x && x._id) === String(id); }) || null;
                }
                if (!book && Array.isArray(window.allBooks)) {
                    book = window.allBooks.find(function (x) { return String(x && x._id) === String(id); }) || null;
                }
                if (!book && window.currentBook && String(window.currentBook._id) === String(id)) {
                    book = window.currentBook;
                }
            }

            if (!book) {
                miniToast('Could not add this item to wishlist');
                return;
            }
            toggleWishlist(book);
        });
    }

    function init() {
        updateWishlistCount();
        bindWishlistButtons();
        refreshWishlistButtons();

        // Keep count/buttons in sync across tabs.
        window.addEventListener('storage', function (ev) {
            if (ev && ev.key === KEY) {
                updateWishlistCount();
                refreshWishlistButtons();
                try {
                    document.dispatchEvent(new CustomEvent('bookhaven-wishlist-updated'));
                } catch (e2) {}
            }
        });
    }

    window.BookHavenWishlist = {
        getWishlist: getWishlist,
        setWishlist: setWishlist,
        addToWishlist: addToWishlist,
        removeFromWishlist: removeFromWishlist,
        toggleWishlist: toggleWishlist,
        isWishlisted: isWishlisted,
        updateWishlistCount: updateWishlistCount,
        refreshWishlistButtons: refreshWishlistButtons,
        buildWishlistShareUrl: buildWishlistShareUrl,
        copyWishlistShareLink: copyWishlistShareLink,
        getWishlistPageHref: getWishlistPageHref
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

