function catalogApiBase() {
    return typeof window.getBookstoreApiBase === 'function' ? window.getBookstoreApiBase() : '/api';
}

let allBooks = [];
let viewBooks = [];
let activeCategory = '';

// Expose for wishlist resolver
window.allBooks = allBooks;

function formatPrice(price) {
    return '₹' + Number(price || 0).toLocaleString('en-IN');
}

function toast(message) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-message');
    if (!t || !m) return;
    m.textContent = message;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

function updateAuthUI() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const authLinks = document.getElementById('auth-links');
    const userMenu = document.getElementById('user-menu');
    const usernameDisplay = document.getElementById('username-display');
    if (user) {
        if (authLinks) authLinks.style.display = 'none';
        if (userMenu) userMenu.style.display = 'block';
        if (usernameDisplay) usernameDisplay.textContent = user.name;
    } else {
        if (authLinks) authLinks.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';
    }
}

function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCartItems();
}

function updateCartCount() {
    const count = getCart().reduce((s, i) => s + Number(i.quantity || 0), 0);
    const el = document.querySelector('.cart-count');
    if (el) el.textContent = count;
}

function addToCart(bookId) {
    const book = allBooks.find(b => String(b._id) === String(bookId));
    if (!book) return;
    const cart = getCart();
    const existing = cart.find(i => String(i._id) === String(bookId));
    if (existing) existing.quantity += 1;
    else cart.push({ _id: book._id, title: book.title, author: book.author, price: book.price, coverImage: book.coverImage, quantity: 1 });
    saveCart(cart);
    toast('Added to cart');
}

function updateQuantity(bookId, change) {
    let cart = getCart();
    const item = cart.find(i => String(i._id) === String(bookId));
    if (!item) return;
    item.quantity += change;
    if (item.quantity <= 0) cart = cart.filter(i => String(i._id) !== String(bookId));
    saveCart(cart);
}

function removeFromCart(bookId) {
    const cart = getCart().filter(i => String(i._id) !== String(bookId));
    saveCart(cart);
}

function renderCartItems() {
    const cart = getCart();
    const box = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total-price');
    if (!box) return;
    if (!cart.length) {
        box.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Your cart is empty</p><a href="catalog.html" class="btn-primary">Start Shopping</a></div>';
        if (totalEl) totalEl.textContent = '₹0';
        return;
    }
    let total = 0;
    box.innerHTML = cart.map(item => {
        total += item.price * item.quantity;
        return `<div class="cart-item"><div class="cart-item-image"><img src="${item.coverImage || ''}" alt=""></div><div class="cart-item-details"><h4 class="cart-item-title">${item.title}</h4><div class="cart-item-price">${formatPrice(item.price)}</div><div class="cart-item-quantity"><button onclick="updateQuantity('${item._id}',-1)">-</button><span>${item.quantity}</span><button onclick="updateQuantity('${item._id}',1)">+</button></div></div><button class="cart-item-remove" onclick="removeFromCart('${item._id}')"><i class="fas fa-trash"></i></button></div>`;
    }).join('');
    if (totalEl) totalEl.textContent = formatPrice(total);
}

function toggleCart() {
    document.getElementById('cart-sidebar')?.classList.toggle('active');
    document.getElementById('cart-overlay')?.classList.toggle('active');
    renderCartItems();
}

function checkout() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const cart = getCart();
    if (!user) {
        toast('Please login first');
        setTimeout(() => (window.location.href = 'login.html'), 700);
        return;
    }
    if (!cart.length) {
        toast('Cart is empty');
        return;
    }
    window.location.href = 'checkout.html';
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('cart');
    window.location.href = 'index.html';
}

function renderBooks(books) {
    const wrap = document.getElementById('catalog-books');
    const count = document.getElementById('results-count');
    if (!wrap) return;
    if (count) count.textContent = books.length;
    wrap.innerHTML = books.map(book => `
        <article class="book-card">
            <img src="${book.coverImage || 'https://via.placeholder.com/300x400'}" alt="${book.title}">
            <div class="book-info">
                <div style="font-size:12px;color:#764ba2;margin-bottom:4px;">${book.category}</div>
                <h3 class="book-title">${book.title}</h3>
                <div class="book-author">by ${book.author}</div>
                <div class="book-meta"><span class="book-price">${formatPrice(book.price)}</span><span style="font-size:12px;color:#888">⭐ ${book.rating || '-'}</span></div>
                <div class="book-actions">
                    <a class="btn-small btn-view" href="book-details.html?id=${book._id}">Details</a>
                    <button class="btn-small btn-wish" type="button" data-wishlist-toggle data-wishlist-id="${book._id}" aria-label="Toggle wishlist" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>
                    <button class="btn-small btn-cart" onclick="addToCart('${book._id}')"><i class="fas fa-shopping-cart"></i> Add</button>
                </div>
            </div>
        </article>
    `).join('');

    if (window.BookHavenWishlist && typeof window.BookHavenWishlist.refreshWishlistButtons === 'function') {
        window.BookHavenWishlist.refreshWishlistButtons();
    }
}

function updateCategoryCounts() {
    const map = {};
    allBooks.forEach(b => { map[b.category] = (map[b.category] || 0) + 1; });
    document.querySelectorAll('.category-btn').forEach((btn) => {
        const c = btn.dataset.category || '';
        const countEl = btn.querySelector('.category-count');
        if (!countEl) return;
        countEl.textContent = c ? (map[c] || 0) : allBooks.length;
    });
}

function applyFilters() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase();
    const rawPrice = document.getElementById('price-range')?.value;
    let maxPrice = 3000;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
        const n = Number(rawPrice);
        if (Number.isFinite(n) && n > 0) maxPrice = n;
    }
    const sort = document.getElementById('sort-select')?.value || 'default';
    const priceLabel = document.getElementById('price-value');
    if (priceLabel) priceLabel.textContent = formatPrice(maxPrice);

    let filtered = allBooks.filter(b => {
        if (activeCategory && b.category !== activeCategory) return false;
        if (search && !(`${b.title} ${b.author} ${b.category}`.toLowerCase().includes(search))) return false;
        if (Number(b.price || 0) > maxPrice) return false;
        return true;
    });

    if (sort === 'price-low') filtered.sort((a, b) => a.price - b.price);
    else if (sort === 'price-high') filtered.sort((a, b) => b.price - a.price);
    else if (sort === 'title') filtered.sort((a, b) => a.title.localeCompare(b.title));

    viewBooks = filtered;
    renderBooks(viewBooks);
}

function bindFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    const search = params.get('search');
    if (category) activeCategory = category;
    if (search) {
        const s = document.getElementById('search-input');
        if (s) s.value = search;
    }
}

function showCatalogLoadError(message) {
    const el = document.getElementById('catalog-load-error');
    if (!el) return;
    el.hidden = false;
    el.style.display = 'block';
    el.innerHTML =
        '<p><strong>Books did not load.</strong> ' +
        escapeCatalogHtml(message) +
        '</p><p class="catalog-load-hint">Use <code>http://localhost:3001/catalog.html</code> or run <code>npm start</code> in the <code>server</code> folder (MongoDB running). API tried: <code>' +
        escapeCatalogHtml(catalogApiBase()) +
        '</code></p>';
}

function hideCatalogLoadError() {
    const el = document.getElementById('catalog-load-error');
    if (el) {
        el.hidden = true;
        el.style.display = 'none';
        el.innerHTML = '';
    }
}

function escapeCatalogHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

async function loadBooks() {
    hideCatalogLoadError();
    const doFetch = typeof window.fetchBookstore === 'function' ? window.fetchBookstore.bind(window) : null;
    const response = doFetch
        ? await doFetch('/books')
        : await fetch(catalogApiBase() + '/books');
    if (!response.ok) throw new Error('Books HTTP ' + response.status);
    const data = await response.json();
    allBooks = Array.isArray(data) ? data : [];
    window.allBooks = allBooks;
    if (allBooks.length === 0) {
        showCatalogLoadError('The server returned an empty list. Reseed books: in the server folder run <code>node scripts/reset-books-to-goodbooks10k.js</code>.');
    }
    updateCategoryCounts();
    bindFiltersFromURL();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
    updateAuthUI();
    updateCartCount();
    renderCartItems();
    if (window.BookHavenWishlist && typeof window.BookHavenWishlist.updateWishlistCount === 'function') {
        window.BookHavenWishlist.updateWishlistCount();
    }

    document.getElementById('search-input')?.addEventListener('input', applyFilters);
    document.getElementById('sort-select')?.addEventListener('change', applyFilters);
    document.getElementById('price-range')?.addEventListener('input', applyFilters);
    document.querySelectorAll('.category-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            activeCategory = btn.dataset.category || '';
            applyFilters();
        });
    });

    try {
        await loadBooks();
    } catch (e) {
        console.error(e);
        toast('Could not load catalog');
        showCatalogLoadError(e.message || 'Network error — check the browser console (F12).');
    }
});

