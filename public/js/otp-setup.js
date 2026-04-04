const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

function storeLoggedInUser(user, token) {
    localStorage.setItem(
        'user',
        JSON.stringify({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: token || '',
            walletBalance: Number(user.walletBalance || 0),
            activeCouponsCount: Number(user.activeCouponsCount || 0),
            activeCouponsValue: Number(user.activeCouponsValue || 0)
        })
    );
}

function showCouponWelcome(user) {
    const wallet = Number(user?.walletBalance || 0);
    const count = Number(user?.activeCouponsCount || 0);
    if (!wallet && !count) return;
    const key = `wallet-welcome-${user._id}-${wallet}-${count}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    if (wallet > 0) {
        alert(`Wallet balance: ₹${wallet}. You can use this at checkout.`);
        return;
    }
    alert(`You have ${count} active coupon(s). Redeem in checkout to top-up wallet.`);
}

function getSetupToken() {
    const url = new URL(window.location.href);
    return url.searchParams.get('setupToken');
}

function setError(msg) {
    const el = document.getElementById('otp-status');
    if (el) {
        el.style.color = '#c82333';
        el.textContent = msg;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const setupToken = getSetupToken();
    const qrImg = document.getElementById('qr-img');
    const statusEl = document.getElementById('otp-status');
    const enableBtn = document.getElementById('enable-btn');

    if (!setupToken) {
        setError('Missing setupToken in URL.');
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/auth/mfa/setup?token=${encodeURIComponent(setupToken)}`);
        if (!res.ok) throw new Error('Could not load QR');
        const data = await res.json();
        if (qrImg) qrImg.src = data.qrDataUrl;
        if (statusEl) statusEl.style.color = '#555';
        if (statusEl) statusEl.textContent = 'QR loaded. Enter code from your app.';
    } catch (e) {
        setError(e.message || 'Failed to load QR');
        return;
    }

    enableBtn?.addEventListener('click', async function() {
        const otp = document.getElementById('otp').value.trim();
        if (!otp || otp.length < 6) {
            setError('Enter the 6-digit OTP.');
            return;
        }

        enableBtn.disabled = true;
        enableBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        try {
            const res = await fetch(`${API_BASE_URL}/auth/mfa/verify-setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setupToken, otp })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'OTP verification failed');

            storeLoggedInUser(data.user, data.token);
            showCouponWelcome(data.user);
            window.location.href = 'index.html';
        } catch (e) {
            setError(e.message || 'OTP verification failed');
        } finally {
            enableBtn.disabled = false;
            enableBtn.innerHTML = '<i class="fas fa-key"></i> Enable OTP';
        }
    });
});

