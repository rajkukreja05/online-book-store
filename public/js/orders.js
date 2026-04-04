// ============================================
// Orders Page — loads real orders from API
// ============================================

const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

let user = null;
let orders = [];

document.addEventListener('DOMContentLoaded', function() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            const banner = document.getElementById('order-success-banner');
            if (banner) banner.style.display = 'block';
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (e) { /* ignore */ }

    try {
        const userData = localStorage.getItem('user');
        if (userData) user = JSON.parse(userData);
    } catch (e) {
        console.log('Error parsing user:', e);
    }

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    updateAuthUI();
    loadOrders();
});

function updateAuthUI() {
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

async function loadOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    container.innerHTML =
        '<div class="loading-orders"><i class="fas fa-spinner fa-spin"></i><p>Loading your orders…</p></div>';

    orders = [];
    try {
        const url = API_BASE_URL + '/orders?userId=' + encodeURIComponent(user._id);
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) orders = data;
        }
    } catch (error) {
        console.error('Orders API error:', error);
    }

    renderOrders();
}

function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML =
            '<div class="empty-orders">' +
            '<i class="fas fa-shopping-bag"></i>' +
            '<h3>No orders yet</h3>' +
            '<p>Browse books, add them to your cart, then open <strong>Checkout</strong> to pay.</p>' +
            '<p style="margin-top:12px">' +
            '<a href="catalog.html" class="btn-primary" style="margin-right:10px">Browse catalog</a>' +
            '<a href="checkout.html" class="btn-primary" style="background:#1a1a2e">Go to checkout</a>' +
            '</p>' +
            '</div>';
        return;
    }

    let html = '';
    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const date = new Date(order.createdAt);
        const dateStr = date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let itemsHtml = '';
        const items = order.items || [];
        for (let j = 0; j < items.length; j++) {
            const item = items[j];
            itemsHtml +=
                '<div class="order-item">' +
                '<img src="' + (item.coverImage || 'https://via.placeholder.com/80x120') + '" alt="' + (item.title || '') + '">' +
                '<div class="item-details">' +
                '<h4>' + (item.title || '') + '</h4>' +
                '<p class="item-price">₹' + Number(item.price || 0).toLocaleString('en-IN') + '</p>' +
                '<p class="item-quantity">Qty: ' + (item.quantity || 0) + '</p>' +
                '</div></div>';
        }

        const statusKey = (order.status || '').toLowerCase();
        const statusLabel = statusKey ? statusKey.charAt(0).toUpperCase() + statusKey.slice(1) : '';
        const showCancel = statusKey !== 'cancelled' && statusKey !== 'delivered';

        html +=
            '<div class="order-card">' +
            '<div class="order-header">' +
            '<div class="order-info">' +
            '<h3>Order #' + order._id + '</h3>' +
            '<span class="order-date">' + dateStr + '</span>' +
            '</div>' +
            '<div class="order-status ' + statusKey + '">' + statusLabel + '</div>' +
            '</div>' +
            '<div class="order-items">' + itemsHtml + '</div>' +
            '<div class="order-footer">' +
            '<div class="order-total">' +
            '<span>Total:</span>' +
            '<span class="total-price">₹' + Number(order.total || 0).toLocaleString('en-IN') + '</span>' +
            '</div>' +
            (showCancel
                ? '<button type="button" onclick="cancelOrder(\'' + order._id + '\')" class="btn-cancel">Cancel Order</button>'
                : '') +
            '</div></div>';
    }

    container.innerHTML = html;
}

async function cancelOrder(orderId) {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
        const res = await fetch(API_BASE_URL + '/orders/' + encodeURIComponent(orderId) + '/cancel', {
            method: 'PUT'
        });
        if (res.ok) {
            showToast('Order cancelled.');
            await loadOrders();
        } else {
            const err = await res.json().catch(function() { return {}; });
            showToast(err.message || 'Could not cancel order');
        }
    } catch (e) {
        showToast('Network error');
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (toastMessage) toastMessage.textContent = message;
    if (toast) {
        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    }
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('cart');
    window.location.href = 'index.html';
}
