const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('feedback-form');
    const ok = document.getElementById('ok');
    const err = document.getElementById('err');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (user) {
        document.getElementById('name').value = user.name || '';
        document.getElementById('email').value = user.email || '';
    }

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        ok.style.display = 'none';
        err.style.display = 'none';

        const payload = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            category: document.getElementById('category').value,
            rating: Number(document.getElementById('rating').value),
            subject: document.getElementById('subject').value.trim(),
            message: document.getElementById('message').value.trim(),
            userId: user?._id || null
        };

        try {
            const res = await fetch(`${API_BASE_URL}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Submit failed');
            ok.style.display = 'block';
            form.reset();
            if (user) {
                document.getElementById('name').value = user.name || '';
                document.getElementById('email').value = user.email || '';
            }
        } catch (e2) {
            err.textContent = e2.message;
            err.style.display = 'block';
        }
    });
});

