// ============================================
// Profile Page JavaScript
// ============================================

const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    loadProfile();
    loadCoupons();
    activateTabFromHash();
});

// Load profile data
function loadProfile() {
    document.getElementById('profile-name').textContent = currentUser.name || 'User';
    document.getElementById('profile-email').textContent = currentUser.email || 'user@example.com';
    document.getElementById('username-display').textContent = currentUser.name || 'User';
    
    // Fill form fields
    document.getElementById('input-name').value = currentUser.name || '';
    document.getElementById('input-email').value = currentUser.email || '';
    document.getElementById('input-phone').value = currentUser.phone || '';
    
    // Fill address if available
    if (currentUser.address) {
        document.getElementById('input-street').value = currentUser.address.street || '';
        document.getElementById('input-city').value = currentUser.address.city || '';
        document.getElementById('input-state').value = currentUser.address.state || '';
        document.getElementById('input-zip').value = currentUser.address.zipCode || '';
        document.getElementById('input-country').value = currentUser.address.country || '';
    }
    
    // Show admin link if admin
    if (currentUser.role === 'admin') {
        document.getElementById('admin-link').style.display = 'block';
    }
    
    // Setup form handlers
    setupFormHandlers();
}

async function loadCoupons() {
    const listEl = document.getElementById('coupons-list');
    if (!listEl || !currentUser?._id) return;
    listEl.innerHTML = '<p>Loading coupons...</p>';
    try {
        const res = await fetch(`${API_BASE_URL}/customers/${currentUser._id}/coupons`, {
            headers: {
                'x-user-id': currentUser._id
            }
        });
        if (!res.ok) throw new Error('coupons');
        const data = await res.json();
        const coupons = Array.isArray(data.coupons) ? data.coupons : [];
        const activeCoupons = coupons.filter(c => c.status === 'active');

        if (!activeCoupons.length) {
            listEl.innerHTML = '<p>No active coupons yet.</p>';
            return;
        }

        listEl.innerHTML = `<div class="coupons-grid">${activeCoupons
            .map(c => {
                const exp = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN') : 'No expiry';
                return `
                <div class="coupon-card">
                    <h4>₹${Number(c.amount || 0).toLocaleString('en-IN')} OFF</h4>
                    <div><strong>Code:</strong> ${c.code}</div>
                    <div class="coupon-meta">Valid till: ${exp}</div>
                    <div class="coupon-note">${c.note || ''}</div>
                </div>
                `;
            })
            .join('')}</div>`;
    } catch (e) {
        listEl.innerHTML = '<p>Could not load coupons right now.</p>';
    }
}

// Switch tabs
function switchTab(tabId) {
    // Update nav
    document.querySelectorAll('.profile-nav a').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.profile-nav a[href="#${tabId}"]`);
    if (activeLink) activeLink.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
    window.location.hash = tabId;
}

function activateTabFromHash() {
    const hash = (window.location.hash || '').replace('#', '');
    if (hash && document.getElementById(`tab-${hash}`)) {
        switchTab(hash);
    }
}

// Setup form handlers
function setupFormHandlers() {
    // Profile form
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('input-name').value;
        const phone = document.getElementById('input-phone').value;
        
        currentUser.name = name;
        currentUser.phone = phone;
        
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        showToast('Profile updated successfully!');
        document.getElementById('profile-name').textContent = name;
        document.getElementById('username-display').textContent = name;
    });
    
    // Address form
    document.getElementById('address-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const address = {
            street: document.getElementById('input-street').value,
            city: document.getElementById('input-city').value,
            state: document.getElementById('input-state').value,
            zipCode: document.getElementById('input-zip').value,
            country: document.getElementById('input-country').value
        };
        
        currentUser.address = address;
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        showToast('Address updated successfully!');
    });
    
    // Password form
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match!');
            return;
        }
        
        if (newPassword.length < 6) {
            showToast('Password must be at least 6 characters!');
            return;
        }
        
        // In a real app, this would verify the current password
        showToast('Password updated successfully!');
        
        // Clear form
        document.getElementById('password-form').reset();
    });

    // Personal request form
    document.getElementById('personal-request-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser?._id) {
            showToast('Please login again');
            return;
        }

        const payload = {
            title: document.getElementById('request-title').value.trim(),
            author: document.getElementById('request-author').value.trim(),
            category: document.getElementById('request-category').value.trim() || 'Other',
            language: document.getElementById('request-language').value.trim() || 'English',
            quantity: Number(document.getElementById('request-quantity').value || 1),
            notes: document.getElementById('request-notes').value.trim()
        };

        if (!payload.title) {
            showToast('Title is required');
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/books/personal-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': currentUser._id
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Request failed');
            showToast('Personal book request submitted');
            document.getElementById('personal-request-form').reset();
            document.getElementById('request-quantity').value = '1';
        } catch (err) {
            showToast(err.message || 'Could not submit request');
        }
    });
}

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
