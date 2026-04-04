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

function getMfaToken() {
    const url = new URL(window.location.href);
    return url.searchParams.get('mfaToken');
}

function setError(msg) {
    const el = document.getElementById('error-box');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function() {
    const mfaToken = getMfaToken();
    const otpInput = document.getElementById('otp');
    const verifyBtn = document.getElementById('verify-btn');

    if (!mfaToken) {
        setError('Missing mfaToken in URL.');
        return;
    }

    verifyBtn?.addEventListener('click', async function() {
        const otp = otpInput?.value.trim() || '';
        if (!otp || otp.length < 6) {
            setError('Enter the 6-digit OTP.');
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        try {
            const res = await fetch(`${API_BASE_URL}/auth/mfa/verify-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mfaToken, otp })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'OTP verification failed');

            storeLoggedInUser(data.user, data.token);
            showCouponWelcome(data.user);
            window.location.href = 'index.html';
        } catch (e) {
            setError(e.message || 'OTP verification failed');
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = '<i class="fas fa-check"></i> Verify & Login';
        }
    });
});

