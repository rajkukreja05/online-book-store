const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';
let currentBook = null;
let selectedQuantity = 1;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get('id');
    
    if (bookId) {
        loadBookDetails(bookId);
    } else {
        showError();
    }
});

// Load book details
async function loadBookDetails(bookId) {
    const container = document.getElementById('book-details');
    
    try {
        const fetchFn = typeof window.fetchBookstore === 'function' ? window.fetchBookstore : null;
        const response = fetchFn
            ? await fetchFn('/books/' + encodeURIComponent(bookId))
            : await fetch(`${API_BASE_URL}/books/${encodeURIComponent(bookId)}`);
        currentBook = await response.json();
        
        if (!currentBook || currentBook.message) currentBook = null;
    } catch (error) {
        currentBook = null;
    }
    
    if (!currentBook) {
        showError();
        return;
    }
    
    renderBookDetails(currentBook, container);
}

// Render book details
function renderBookDetails(book, container) {
    const stars = renderStars(book.rating);
    const stockStatus = getStockStatus(book.stock);
    
    container.innerHTML = `
        <div class="book-image-large">
            <div class="image-container">
                <img src="${book.coverImage || 'https://via.placeholder.com/400x600'}" alt="${book.title}">
            </div>
            <div class="book-actions">
                <button class="btn-add-cart" onclick="addToCart('${book._id}')">
                    <i class="fas fa-shopping-cart"></i> Add to Cart
                </button>
                <button class="btn-preorder" onclick="preOrderBook('${book._id}')">
                    <i class="fas fa-box-open"></i> Pre-Order
                </button>
                <button class="btn-wishlist" onclick="addToWishlist('${book._id}')">
                    <i class="fas fa-heart"></i> Wishlist
                </button>
            </div>
        </div>
        
        <div class="book-info-main">
            <div class="book-category">${book.category}</div>
            <h1 class="book-title-large">${book.title}</h1>
            <p class="book-author-large">by <span>${book.author}</span></p>
            
            <div class="book-rating">
                <div class="stars">${stars}</div>
                <span class="rating-text">${book.rating} rating</span>
            </div>
            
            <div class="book-price-large">
                ₹${Number(book.price || 0).toLocaleString('en-IN')}
            </div>
            
            <div class="stock-status ${stockStatus.class}">
                <i class="fas fa-${stockStatus.icon}"></i>
                <span>${stockStatus.text}</span>
            </div>
            
            <div class="quantity-selector">
                <label>Quantity:</label>
                <div class="quantity-controls">
                    <button onclick="updateQuantity(-1)">-</button>
                    <span id="quantity-value">${selectedQuantity}</span>
                    <button onclick="updateQuantity(1)">+</button>
                </div>
            </div>
            
            <div class="book-description">
                <h3>Description</h3>
                <p>${book.description}</p>
            </div>
            
            <div class="book-details-list">
                <h3>Book Details</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <i class="fas fa-barcode"></i>
                        <div>
                            <div class="label">ISBN</div>
                            <div class="value">${book.isbn || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-calendar"></i>
                        <div>
                            <div class="label">Published</div>
                            <div class="value">${book.publishedYear || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-folder"></i>
                        <div>
                            <div class="label">Category</div>
                            <div class="value">${book.category}</div>
                        </div>
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-box"></i>
                        <div>
                            <div class="label">Availability</div>
                            <div class="value">${book.stock} in stock</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Update page title
    document.title = `${book.title} - Online Book Store`;
}

// Render stars
function renderStars(rating) {
    let stars = '';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star"></i>';
    }
    
    if (hasHalfStar) {
        stars += '<i class="fas fa-star-half-alt"></i>';
    }
    
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star"></i>';
    }
    
    return stars;
}

// Get stock status
function getStockStatus(stock) {
    if (stock === 0) {
        return { class: 'out-of-stock', icon: 'times-circle', text: 'Out of Stock' };
    } else if (stock < 10) {
        return { class: 'low-stock', icon: 'exclamation-circle', text: `Only ${stock} left in stock` };
    } else {
        return { class: 'in-stock', icon: 'check-circle', text: 'In Stock' };
    }
}

// Update quantity
function updateQuantity(change) {
    selectedQuantity += change;
    if (selectedQuantity < 1) selectedQuantity = 1;
    if (currentBook && selectedQuantity > currentBook.stock) selectedQuantity = currentBook.stock;
    
    document.getElementById('quantity-value').textContent = selectedQuantity;
}

// Add to cart
function addToCart(bookId) {
    const existingItem = cart.find(item => item._id === bookId);
    if (existingItem) {
        existingItem.quantity += selectedQuantity;
    } else {
        cart.push({ ...currentBook, quantity: selectedQuantity });
    }
    saveCart();
    showToast(`${selectedQuantity} item(s) added to cart!`);
    selectedQuantity = 1;
    document.getElementById('quantity-value').textContent = selectedQuantity;
}

// Add to wishlist
function addToWishlist(bookId) {
    showToast('Added to wishlist!');
}

async function preOrderBook(bookId) {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || !user._id) {
        showToast('Please login to place pre-order');
        setTimeout(() => (window.location.href = 'login.html'), 700);
        return;
    }
    try {
        const res = await fetch(`${API_BASE_URL}/books/${bookId}/preorder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user._id
            },
            body: JSON.stringify({
                quantity: selectedQuantity,
                notes: 'Requested from website book details page'
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Pre-order failed');
        showToast('Pre-order request submitted');
    } catch (e) {
        showToast(e.message || 'Could not place pre-order');
    }
}

// Show error
function showError() {
    const container = document.getElementById('book-details');
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Book not found</h3>
            <p>The book you're looking for doesn't exist.</p>
            <a href="catalog.html" class="btn-primary">Browse Catalog</a>
        </div>
    `;
}
