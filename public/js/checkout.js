// Checkout — Razorpay (production) or demo API order when ENABLE_DEMO_PAYMENT=true
const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

let cartItems = [];
let totalAmount = 0;
let user = null;
let payConfig = { razorpay: false, keyId: null, demo: false };
let walletBalance = 0;
let walletUsed = 0;
let lastRedeemedCouponCode = '';

function resetPayButton(payButton) {
    payButton.disabled = false;
    payButton.innerHTML = '<i class="fas fa-lock"></i> Pay with Razorpay - Secure Payment';
}

async function fetchPaymentConfig() {
    try {
        const res = await fetch(`${API_BASE_URL}/orders/payment-config`);
        if (res.ok) {
            payConfig = await res.json();
        }
    } catch (e) {
        console.error('payment-config', e);
    }
}

async function clearServerCart() {
    try {
        await fetch(`${API_BASE_URL}/cart`, {
            method: 'DELETE',
            headers: { 'user-id': user._id }
        });
    } catch (e) {
        console.error('clear cart', e);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const userData = localStorage.getItem('user');
    if (userData) {
        user = JSON.parse(userData);
    } else {
        window.location.href = 'login.html';
        return;
    }

    await fetchPaymentConfig();

    const cartData = localStorage.getItem('cart');
    if (cartData) {
        cartItems = JSON.parse(cartData);
    } else {
        await loadCartFromAPI();
    }

    renderCart();
    await loadWallet();
    updateTotal();

    const payButton = document.getElementById('pay-button');
    if (payConfig.razorpay) {
        payButton.innerHTML = '<i class="fas fa-lock"></i> Pay with Razorpay - Secure Payment';
    } else if (payConfig.demo) {
        payButton.innerHTML = '<i class="fas fa-flask"></i> Place test order (demo mode)';
    } else {
        payButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Payment not configured';
    }

    payButton.disabled = cartItems.length === 0;
    payButton.addEventListener('click', handlePayment);
    document.getElementById('use-wallet')?.addEventListener('change', updateTotal);
    document.getElementById('apply-coupon-btn')?.addEventListener('click', applyCouponCode);
});

async function loadCartFromAPI() {
    try {
        const headers = { 'user-id': user._id };
        const response = await fetch(`${API_BASE_URL}/cart`, { headers });
        if (response.ok) {
            const apiCart = await response.json();
            cartItems = await Promise.all(apiCart.map(async (item) => {
                const bookResponse = await fetch(`${API_BASE_URL}/books/${item.bookId}`);
                const book = await bookResponse.json();
                return {
                    _id: item.bookId,
                    title: book.title,
                    author: book.author,
                    price: book.price,
                    quantity: item.quantity,
                    coverImage: book.coverImage
                };
            }));
            localStorage.setItem('cart', JSON.stringify(cartItems));
        }
    } catch (error) {
        console.error('Error loading cart:', error);
    }
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (cartItems.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>Your cart is empty</p>
                <a href="catalog.html" class="back-btn">Continue Shopping</a>
            </div>
        `;
        return;
    }

    let html = '';
    cartItems.forEach(item => {
        html += `
            <div class="cart-item">
                <img src="${item.coverImage || 'https://via.placeholder.com/80x110?text=Book'}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/80x110?text=Book'">
                <div class="item-details">
                    <h4>${item.title}</h4>
                    <p>${item.author}</p>
                    <div class="item-price">₹${(item.price * item.quantity).toLocaleString('en-IN')}</div>
                    <small>Qty: ${item.quantity}</small>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function updateTotal() {
    totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('total-amount').textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
    const useWallet = !!document.getElementById('use-wallet')?.checked;
    walletUsed = useWallet ? Math.min(walletBalance, totalAmount) : 0;
    const payable = Math.max(0, totalAmount - walletUsed);
    const wb = document.getElementById('wallet-balance');
    const wu = document.getElementById('wallet-used');
    const pa = document.getElementById('payable-amount');
    if (wb) wb.textContent = `₹${Number(walletBalance || 0).toLocaleString('en-IN')}`;
    if (wu) wu.textContent = `₹${Number(walletUsed || 0).toLocaleString('en-IN')}`;
    if (pa) pa.textContent = `₹${Number(payable || 0).toLocaleString('en-IN')}`;
}

function buildOrderPayload(address) {
    const payable = Math.max(0, totalAmount - walletUsed);
    return {
        userId: user._id,
        items: cartItems.map(item => ({
            _id: item._id,
            title: item.title,
            author: item.author,
            price: item.price,
            quantity: item.quantity,
            coverImage: item.coverImage
        })),
        total: payable,
        subtotal: totalAmount,
        walletUsed,
        couponCode: lastRedeemedCouponCode,
        shippingAddress: address
    };
}

async function loadWallet() {
    if (!user?._id) return;
    try {
        const res = await fetch(`${API_BASE_URL}/customers/${user._id}/wallet`, {
            headers: { 'x-user-id': user._id }
        });
        if (!res.ok) return;
        const data = await res.json();
        walletBalance = Number(data.walletBalance || 0);
    } catch (e) {
        console.error('wallet load', e);
    }
}

async function applyCouponCode() {
    const codeEl = document.getElementById('coupon-code');
    const statusEl = document.getElementById('coupon-status');
    const btn = document.getElementById('apply-coupon-btn');
    const code = String(codeEl?.value || '').trim();
    if (!code) {
        if (statusEl) statusEl.textContent = 'Enter coupon code first.';
        return;
    }
    try {
        btn.disabled = true;
        const res = await fetch(`${API_BASE_URL}/customers/${user._id}/redeem-coupon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': user._id },
            body: JSON.stringify({ code })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (statusEl) statusEl.textContent = data.message || 'Coupon code failed';
            return;
        }
        lastRedeemedCouponCode = code.toUpperCase();
        walletBalance = Number(data.walletBalance || walletBalance);
        if (statusEl) statusEl.textContent = data.message || 'Coupon applied';
        if (codeEl) codeEl.value = '';
        const useWalletEl = document.getElementById('use-wallet');
        if (useWalletEl) useWalletEl.checked = true;
        updateTotal();
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Coupon code failed';
    } finally {
        btn.disabled = false;
    }
}

async function handleDemoPayment(payButton, address, headers) {
    const payable = Math.max(0, totalAmount - walletUsed);
    const orderResponse = await fetch(`${API_BASE_URL}/demo-payment/create-demo-order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ amount: payable, currency: 'INR', userId: user._id })
    });
    const demoOrder = await orderResponse.json();
    if (!orderResponse.ok || !demoOrder.id) {
        throw new Error(demoOrder.message || 'Demo order failed');
    }

    const verifyResponse = await fetch(`${API_BASE_URL}/demo-payment/verify-demo-payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            demo_order_id: demoOrder.id,
            demo_payment_id: `demo_pay_${Date.now()}`,
            orderData: buildOrderPayload(address)
        })
    });
    const result = await verifyResponse.json();
    if (result.status === 'success') {
        localStorage.removeItem('cart');
        await clearServerCart();
        window.location.href = 'orders.html?success=true';
    } else {
        alert(result.message || 'Demo verification failed');
        resetPayButton(payButton);
    }
}

async function handlePayment() {
    const payButton = document.getElementById('pay-button');
    if (!payConfig.razorpay && !payConfig.demo) {
        alert('Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env, or set ENABLE_DEMO_PAYMENT=true for local test orders.');
        return;
    }

    const name = document.getElementById('name').value.trim();
    const street = document.getElementById('street').value.trim();
    const city = document.getElementById('city').value.trim();
    const phone = document.getElementById('phone').value.trim();
    if (!name || !street || !city || !phone) {
        alert('Please fill in all delivery fields.');
        return;
    }

    const address = { name, street, city, phone };
    const headers = {
        'Content-Type': 'application/json',
        'user-id': user._id
    };

    payButton.disabled = true;
    payButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const payable = Math.max(0, totalAmount - walletUsed);
        if (payable === 0) {
            const walletRes = await fetch(`${API_BASE_URL}/orders/wallet-checkout`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ orderData: buildOrderPayload(address) })
            });
            const walletData = await walletRes.json().catch(() => ({}));
            if (!walletRes.ok || walletData.status !== 'success') {
                throw new Error(walletData.message || 'Wallet checkout failed');
            }
            localStorage.removeItem('cart');
            await clearServerCart();
            window.location.href = 'orders.html?success=true';
            return;
        }

        if (!payConfig.razorpay && payConfig.demo) {
            await handleDemoPayment(payButton, address, headers);
            return;
        }

        const orderResponse = await fetch(`${API_BASE_URL}/orders/create-razorpay-order`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                amount: payable,
                currency: 'INR',
                userId: user._id
            })
        });

        const razorpayOrder = await orderResponse.json();
        if (!orderResponse.ok || !razorpayOrder.id) {
            throw new Error(razorpayOrder.message || 'Could not start payment');
        }

        const key = razorpayOrder.key || payConfig.keyId;
        if (!key) {
            throw new Error('Missing Razorpay Key ID');
        }

        const options = {
            key,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            name: 'BookHaven',
            description: `Order for ${cartItems.length} book(s)`,
            order_id: razorpayOrder.id,
            handler: async function(response) {
                const verifyData = {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    orderData: buildOrderPayload(address)
                };

                const verifyResponse = await fetch(`${API_BASE_URL}/orders/verify-payment`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(verifyData)
                });
                const result = await verifyResponse.json();

                if (result.status === 'success') {
                    localStorage.removeItem('cart');
                    await clearServerCart();
                    window.location.href = 'orders.html?success=true';
                } else {
                    alert(result.message || 'Payment verification failed.');
                    resetPayButton(payButton);
                }
            },
            prefill: {
                name: name,
                contact: phone
            },
            theme: { color: '#e94560' },
            modal: {
                ondismiss: function() {
                    resetPayButton(payButton);
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function(res) {
            const msg = (res.error && res.error.description) || 'Payment failed';
            alert(msg);
            resetPayButton(payButton);
        });
        rzp.open();
    } catch (error) {
        console.error('Payment error:', error);
        alert(error.message || 'Payment initialization failed. Please try again.');
        resetPayButton(payButton);
    }
}
