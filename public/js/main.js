// ============================================
// Online Book Store - Main JavaScript
// ============================================

var apiBooks = [];
// Expose for wishlist resolver
if (typeof window !== 'undefined') {
    window.apiBooks = apiBooks;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

function loadBooksFromApi(callback) {
    var start =
        typeof window.fetchBookstore === 'function'
            ? window.fetchBookstore('/books')
            : fetch(
                  (typeof window.getBookstoreApiBase === 'function' ? window.getBookstoreApiBase() : '/api') +
                      '/books'
              );
    start
        .then(function (r) {
            if (!r.ok) throw new Error('books HTTP ' + r.status);
            return r.json();
        })
        .then(function (books) {
            apiBooks = Array.isArray(books) ? books : [];
            if (typeof window !== 'undefined') window.apiBooks = apiBooks;
            if (callback) callback();
        })
        .catch(function () {
            apiBooks = [];
            if (callback) callback();
        });
}

function renderHomeBookGrids() {
    var t = document.getElementById('trending-books');
    var f = document.getElementById('featured-books');
    if (!t && !f) return;
    if (!apiBooks.length) return;

    var trending = apiBooks.filter(function (b) {
        return b.isTrending;
    });
    if (trending.length < 8) {
        trending = apiBooks.slice(0, 8);
    } else {
        trending = trending.slice(0, 8);
    }

    var featured = apiBooks.filter(function (b) {
        return !b.isTrending;
    });
    if (featured.length < 8) {
        featured = apiBooks.slice(0, 8);
    } else {
        featured = featured.slice(0, 8);
    }

    if (t) t.innerHTML = renderBookCardsHtml(trending);
    if (f) f.innerHTML = renderBookCardsHtml(featured);
}

function renderHomeWishlist() {
    var grid = document.getElementById('home-wishlist-books');
    var empty = document.getElementById('home-wishlist-empty');
    if (!grid) return;

    var wl =
        window.BookHavenWishlist && typeof window.BookHavenWishlist.getWishlist === 'function'
            ? window.BookHavenWishlist.getWishlist()
            : [];

    if (!wl.length) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
    }

    if (empty) empty.hidden = true;
    var slice = wl.slice(0, 8);
    var shaped = slice.map(function (x) {
        return {
            _id: x._id,
            title: x.title,
            author: x.author,
            category: x.category,
            price: x.price,
            coverImage: x.coverImage,
            rating: null
        };
    });
    grid.innerHTML = renderBookCardsHtml(shaped);
    if (window.BookHavenWishlist && typeof window.BookHavenWishlist.refreshWishlistButtons === 'function') {
        window.BookHavenWishlist.refreshWishlistButtons();
    }
}

function renderBookCardsHtml(books) {
    return books
        .map(function (book) {
            var id = String(book._id);
            var img = book.coverImage || '';
            var title = escapeHtml(book.title);
            var author = escapeHtml(book.author);
            var cat = escapeHtml(book.category || '');
            var price = formatPrice(book.price);
            var rating = book.rating != null ? book.rating : '—';
            return (
                '<div class="book-card">' +
                '<div class="book-image">' +
                '<img src="' +
                escapeAttr(img) +
                '" alt="' +
                title +
                '" loading="lazy" onerror="this.src=\'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400\'">' +
                '<div class="book-overlay">' +
                '<a href="book-details.html?id=' +
                encodeURIComponent(id) +
                '"><i class="fas fa-eye"></i></a>' +
                '<button type="button" class="btn-wishlist" data-wishlist-toggle data-wishlist-id="' +
                escapeAttr(id) +
                '" aria-label="Toggle wishlist" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>' +
                '<button type="button" onclick="addToCart(\'' +
                id +
                '\')"><i class="fas fa-shopping-cart"></i></button>' +
                '</div>' +
                '</div>' +
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
                '</div>' +
                '</div>'
            );
        })
        .join('');
}

// Cart state
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let user = JSON.parse(localStorage.getItem('user')) || null;

document.addEventListener('DOMContentLoaded', function() {
    updateCartCount();
    if (window.BookHavenWishlist && typeof window.BookHavenWishlist.updateWishlistCount === 'function') {
        window.BookHavenWishlist.updateWishlistCount();
    }
    updateAuthUI();
    document.addEventListener('bookhaven-wishlist-updated', function () {
        renderHomeWishlist();
    });
    var btnShare = document.getElementById('btn-home-copy-wishlist-share');
    if (btnShare) {
        btnShare.addEventListener('click', function () {
            if (window.BookHavenWishlist && typeof window.BookHavenWishlist.copyWishlistShareLink === 'function') {
                window.BookHavenWishlist.copyWishlistShareLink();
            }
        });
    }
    loadBooksFromApi(function () {
        renderHomeBookGrids();
        if (window.BookHavenWishlist && typeof window.BookHavenWishlist.refreshWishlistButtons === 'function') {
            window.BookHavenWishlist.refreshWishlistButtons();
        }
        renderHomeWishlist();
    });
});

// Format price in INR
function formatPrice(price) {
    return '₹' + price.toLocaleString('en-IN');
}

// Update cart count in navbar
function updateCartCount() {
    const cartCount = document.querySelector('.cart-count');
    if (cartCount) {
        const totalItems = cart.reduce(function(sum, item) { return sum + item.quantity; }, 0);
        cartCount.textContent = totalItems;
    }
}

// Update authentication UI
function updateAuthUI() {
    var authLinks = document.getElementById('auth-links');
    var userMenu = document.getElementById('user-menu');
    var usernameDisplay = document.getElementById('username-display');

    if (user) {
        if (authLinks) authLinks.style.display = 'none';
        if (userMenu) userMenu.style.display = 'block';
        if (usernameDisplay) usernameDisplay.textContent = user.name;
    } else {
        if (authLinks) authLinks.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';
    }
}

// Cart toggle
function toggleCart() {
    var cartSidebar = document.getElementById('cart-sidebar');
    var cartOverlay = document.getElementById('cart-overlay');
    if (cartSidebar && cartOverlay) {
        cartSidebar.classList.toggle('active');
        cartOverlay.classList.toggle('active');
        renderCartItems();
    }
}

// Render cart items
function renderCartItems() {
    var cartItemsContainer = document.getElementById('cart-items');
    var cartTotalPrice = document.getElementById('cart-total-price');
    
    if (!cartItemsContainer || !cartTotalPrice) return;
    
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Your cart is empty</p><a href="catalog.html">Start Shopping</a></div>';
        cartTotalPrice.textContent = '₹0';
        return;
    }

    var total = 0;
    cartItemsContainer.innerHTML = cart.map(function(item) {
        total += item.price * item.quantity;
        return '<div class="cart-item"><div class="cart-item-image"><img src="' + (item.coverImage || '') + '" alt="' + item.title + '"></div><div class="cart-item-details"><h4 class="cart-item-title">' + item.title + '</h4><div class="cart-item-price">' + formatPrice(item.price) + '</div><div class="cart-item-quantity"><button onclick="updateQuantity(\'' + item._id + '\', -1)">-</button><span>' + item.quantity + '</span><button onclick="updateQuantity(\'' + item._id + '\', 1)">+</button></div><button class="cart-item-remove" onclick="removeFromCart(\'' + item._id + '\')"><i class="fas fa-trash"></i></button></div>';
    }).join('');

    cartTotalPrice.textContent = formatPrice(total);
}

// Add to cart
function addToCart(bookId) {
    var book = apiBooks.find(function (b) {
        return String(b._id) === String(bookId);
    });
    if (book) {
        var existingItem = cart.find(function(item) { return item._id === bookId; });
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({ _id: book._id, title: book.title, author: book.author, price: book.price, coverImage: book.coverImage, quantity: 1 });
        }
        saveCart();
        showToast('Item added to cart!');
    }
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}

// Update item quantity
function updateQuantity(bookId, change) {
    var item = cart.find(function(item) { return item._id === bookId; });
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(bookId);
        } else {
            saveCart();
            renderCartItems();
        }
    }
}

// Remove from cart
function removeFromCart(bookId) {
    cart = cart.filter(function(item) { return item._id !== bookId; });
    saveCart();
    renderCartItems();
}

// Checkout: use full checkout page for address + Razorpay (keys on server)
function checkout() {
    try {
        var u = localStorage.getItem('user');
        user = u ? JSON.parse(u) : null;
        var c = localStorage.getItem('cart');
        cart = c ? JSON.parse(c) : [];
    } catch (e) {
        user = null;
        cart = [];
    }
    if (!user) {
        showToast('Please login to checkout');
        setTimeout(function() { window.location.href = 'login.html'; }, 1500);
        return;
    }
    if (!cart || cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }
    window.location.href = 'checkout.html';
}

// Show toast notification
function showToast(message) {
    var toast = document.getElementById('toast');
    var toastMessage = document.getElementById('toast-message');
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Logout
function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('cart');
    user = null;
    cart = [];
    updateAuthUI();
    updateCartCount();
    showToast('Logged out successfully');
    setTimeout(function() {
        window.location.href = 'index.html';
    }, 1000);
}

// Search functionality
function searchBooks(query) {
    window.location.href = 'catalog.html?search=' + encodeURIComponent(query);
}

// Filter books
function filterBooks(category) {
    window.location.href = 'catalog.html?category=' + encodeURIComponent(category);
}
