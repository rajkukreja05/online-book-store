(function () {
    'use strict';

    function fetchBookById(id) {
        var path = '/books/' + encodeURIComponent(id);
        if (typeof window.fetchBookstore === 'function') {
            return window.fetchBookstore(path).then(function (r) {
                if (!r.ok) throw new Error('not found');
                return r.json();
            });
        }
        var base = typeof window.getBookstoreApiBase === 'function' ? window.getBookstoreApiBase() : '/api';
        var url = base.replace(/\/$/, '') + path;
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('not found');
            return r.json();
        });
    }

    function parseSharedIds() {
        var params = new URLSearchParams(window.location.search);
        var raw = params.get('ids');
        if (!raw || !String(raw).trim()) return [];
        return String(raw)
            .split(',')
            .map(function (s) {
                try {
                    return decodeURIComponent(s.trim());
                } catch (e) {
                    return s.trim();
                }
            })
            .filter(Boolean);
    }

    /** Match home page cards + wishlist.js: data-wishlist-toggle + payload. Uses escapeHtml/escapeAttr/formatPrice from main.js. */
    function renderCardGrid(books, gridEl, emptyMessage) {
        if (!gridEl) return;
        if (!books.length) {
            gridEl.innerHTML =
                '<p class="wishlist-shared-empty">' +
                (emptyMessage || 'No books could be loaded from this link.') +
                '</p>';
            return;
        }
        gridEl.innerHTML = books
            .map(function (book) {
                var id = String(book._id != null ? book._id : book.id || '');
                var img = book.coverImage || book.image || '';
                var title = typeof escapeHtml === 'function' ? escapeHtml(book.title) : String(book.title || 'Untitled');
                var author = typeof escapeHtml === 'function' ? escapeHtml(book.author) : String(book.author || '');
                var cat = typeof escapeHtml === 'function' ? escapeHtml(book.category || '') : String(book.category || '');
                var price =
                    typeof formatPrice === 'function'
                        ? formatPrice(Number(book.price || 0))
                        : '₹' + Number(book.price || 0).toLocaleString('en-IN');
                var rating = book.rating != null ? book.rating : '—';
                var payloadObj = {
                    _id: id,
                    title: String(book.title || ''),
                    author: String(book.author || ''),
                    category: String(book.category || ''),
                    price: Number(book.price || 0),
                    coverImage: String(book.coverImage || book.image || '')
                };
                var payloadAttr =
                    typeof escapeAttr === 'function'
                        ? escapeAttr(JSON.stringify(payloadObj))
                        : JSON.stringify(payloadObj).replace(/"/g, '&quot;');
                return (
                    '<div class="book-card">' +
                    '<div class="book-image">' +
                    '<img src="' +
                    (typeof escapeAttr === 'function' ? escapeAttr(img) : String(img).replace(/"/g, '&quot;')) +
                    '" alt="' +
                    title +
                    '" loading="lazy" onerror="this.src=\'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400\'">' +
                    '<div class="book-overlay">' +
                    '<a href="book-details.html?id=' +
                    encodeURIComponent(id) +
                    '"><i class="fas fa-eye"></i></a>' +
                    '<button type="button" class="btn-wishlist" data-wishlist-toggle data-wishlist-id="' +
                    (typeof escapeAttr === 'function' ? escapeAttr(id) : id.replace(/"/g, '&quot;')) +
                    '" data-wishlist-payload="' +
                    payloadAttr +
                    '" aria-label="Toggle wishlist" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>' +
                    '<button type="button" onclick="addToCart(\'' +
                    id.replace(/\\/g, '\\\\').replace(/'/g, "\\'") +
                    '\')"><i class="fas fa-shopping-cart"></i></button>' +
                    '</div></div>' +
                    '<div class="book-info">' +
                    '<div class="book-category">' +
                    cat +
                    '</div>' +
                    '<h3 class="book-title">' +
                    title +
                    '</h3>' +
                    '<p class="book-author">by ' +
                    author +
                    '</p>' +
                    '<div class="book-price">' +
                    price +
                    ' <span style="font-size:0.85rem;color:var(--text-secondary);">⭐ ' +
                    rating +
                    '</span></div>' +
                    '</div></div>'
                );
            })
            .join('');
    }

    function toastMsg(msg) {
        if (typeof showToast === 'function') showToast(msg);
        else if (typeof window.showToast === 'function') window.showToast(msg);
        else alert(msg);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var emptyEl = document.getElementById('wishlist-empty');
        var gridEl = document.getElementById('wishlist-grid');
        var sharedWrap = document.getElementById('wishlist-shared-wrap');
        var sharedGrid = document.getElementById('wishlist-shared-grid');
        var btnSaveShared = document.getElementById('btn-save-shared-wishlist');
        var btnCopy = document.getElementById('btn-copy-wishlist-share');

        var sharedIds = parseSharedIds();
        var sharedBooks = [];

        if (btnCopy && window.BookHavenWishlist && typeof window.BookHavenWishlist.copyWishlistShareLink === 'function') {
            btnCopy.addEventListener('click', function () {
                window.BookHavenWishlist.copyWishlistShareLink();
            });
        }

        function renderLocalWishlist() {
            var items = window.BookHavenWishlist ? window.BookHavenWishlist.getWishlist() : [];
            if (!items.length) {
                if (emptyEl) emptyEl.style.display = 'block';
                if (gridEl) gridEl.innerHTML = '';
                return;
            }
            if (emptyEl) emptyEl.style.display = 'none';
            renderCardGrid(items, gridEl);
            if (window.BookHavenWishlist && typeof window.BookHavenWishlist.refreshWishlistButtons === 'function') {
                window.BookHavenWishlist.refreshWishlistButtons();
            }
        }

        function loadShared() {
            if (!sharedIds.length) {
                if (sharedWrap) sharedWrap.style.display = 'none';
                renderLocalWishlist();
                return;
            }
            if (sharedWrap) sharedWrap.style.display = 'block';
            if (sharedGrid) sharedGrid.innerHTML = '<p class="wishlist-loading">Loading shared picks…</p>';
            renderLocalWishlist();

            Promise.all(
                sharedIds.map(function (id) {
                    return fetchBookById(id).catch(function () {
                        return null;
                    });
                })
            ).then(function (results) {
                sharedBooks = results.filter(function (b) {
                    return b && (b.title || b._id);
                });
                renderCardGrid(sharedBooks, sharedGrid);
                if (window.BookHavenWishlist && typeof window.BookHavenWishlist.refreshWishlistButtons === 'function') {
                    window.BookHavenWishlist.refreshWishlistButtons();
                }
                renderLocalWishlist();
            });
        }

        if (btnSaveShared) {
            btnSaveShared.addEventListener('click', function () {
                if (!window.BookHavenWishlist || typeof window.BookHavenWishlist.addToWishlist !== 'function') return;
                var n = 0;
                sharedBooks.forEach(function (b) {
                    if (window.BookHavenWishlist.addToWishlist(b, { silent: true })) n += 1;
                });
                if (n) toastMsg('Saved ' + n + ' book' + (n === 1 ? '' : 's') + ' to your wishlist');
                else toastMsg('Already in your wishlist or nothing to add');
                renderLocalWishlist();
            });
        }

        document.addEventListener('bookhaven-wishlist-updated', function () {
            renderLocalWishlist();
        });

        loadShared();
    });
})();
