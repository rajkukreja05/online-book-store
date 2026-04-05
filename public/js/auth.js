// ============================================
// Authentication JS — Login/Signup + Google OTP (TOTP)
// ============================================

const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
}

function storeLoggedInUser(user, token) {
    // The rest of the app expects localStorage.user with _id + role.
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

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    } else {
        alert(message);
    }

    const errorBox = document.getElementById('error-box');
    if (errorBox) {
        errorBox.style.display = 'block';
        errorBox.textContent = message;
    }
}

async function apiPost(path, body) {
    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
    } catch (netErr) {
        throw new Error(
            'Cannot reach the server. If you are on the live site, check that MONGO_URI is set on Vercel and open /api/health.'
        );
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const parts = [data.message, data.hint].filter(Boolean);
        throw new Error(parts.length ? parts.join(' ') : 'Request failed (' + res.status + ')');
    }
    return data;
}

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

// Signup flow
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!name || !email || !password) {
            showToast('All fields are required');
            return;
        }
        if (!isValidEmail(email)) {
            showToast('Please enter a valid email address');
            return;
        }
        if (password !== confirmPassword) {
            showToast('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            showToast('Password must be at least 6 characters');
            return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.dataset._label = submitBtn.textContent;
            submitBtn.textContent = 'Please wait…';
        }

        try {
            const data = await apiPost('/auth/register', {
                name,
                email,
                password
            });

            // Go to OTP setup page
            const setupToken = data.setupToken;
            if (!setupToken) throw new Error('Missing setup token');
            window.location.href = `otp-setup.html?setupToken=${encodeURIComponent(setupToken)}`;
        } catch (err) {
            showToast(err.message || 'Signup failed');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                if (submitBtn.dataset._label) submitBtn.textContent = submitBtn.dataset._label;
            }
        }
    });
}

// Login flow
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showToast('Email and password are required');
            return;
        }
        if (!isValidEmail(email)) {
            showToast('Please enter a valid email address');
            return;
        }

        const loginBtn = loginForm.querySelector('button[type="submit"]');
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.dataset._label = loginBtn.textContent;
            loginBtn.textContent = 'Please wait…';
        }

        try {
            const data = await apiPost('/auth/login', { email, password });

            // If OTP not enabled yet: user must set up
            if (data.mfaSetupRequired && data.setupToken) {
                window.location.href = `otp-setup.html?setupToken=${encodeURIComponent(data.setupToken)}`;
                return;
            }

            // If OTP enabled: verify OTP during login
            if (data.mfaRequired && data.mfaToken) {
                window.location.href = `otp-login.html?mfaToken=${encodeURIComponent(data.mfaToken)}`;
                return;
            }

            // Fallback if backend returns token directly
            if (data.token && data.user) {
                storeLoggedInUser(data.user, data.token);
                showCouponWelcome(data.user);
                window.location.href = 'index.html';
                return;
            }

            showToast('Unexpected auth response. Please try again.');
        } catch (err) {
            showToast(err.message || 'Login failed');
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                if (loginBtn.dataset._label) loginBtn.textContent = loginBtn.dataset._label;
            }
        }
    });
}

