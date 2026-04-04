const express = require('express');

const router = express.Router();

// In-memory cart storage (in production, this would be in database)
let carts = {};

// Get cart
router.get('/', (req, res) => {
    const userId = req.headers['user-id'];
    
    if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
    }
    
    const cart = carts[userId] || [];
    res.json(cart);
});

// Add to cart
router.post('/', (req, res) => {
    const userId = req.headers['user-id'];
    const { bookId, quantity } = req.body;
    
    if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
    }
    
    if (!carts[userId]) {
        carts[userId] = [];
    }
    
    const existingItem = carts[userId].find(item => item.bookId === bookId);
    
    if (existingItem) {
        existingItem.quantity += quantity || 1;
    } else {
        carts[userId].push({
            bookId,
            quantity: quantity || 1
        });
    }
    
    res.json(carts[userId]);
});

// Update cart item
router.put('/:bookId', (req, res) => {
    const userId = req.headers['user-id'];
    const { quantity } = req.body;
    
    if (!userId || !carts[userId]) {
        return res.status(404).json({ message: 'Cart not found' });
    }
    
    const item = carts[userId].find(item => item.bookId === req.params.bookId);
    
    if (!item) {
        return res.status(404).json({ message: 'Item not found' });
    }
    
    if (quantity <= 0) {
        carts[userId] = carts[userId].filter(item => item.bookId !== req.params.bookId);
    } else {
        item.quantity = quantity;
    }
    
    res.json(carts[userId]);
});

// Remove from cart
router.delete('/:bookId', (req, res) => {
    const userId = req.headers['user-id'];
    
    if (!userId || !carts[userId]) {
        return res.status(404).json({ message: 'Cart not found' });
    }
    
    carts[userId] = carts[userId].filter(item => item.bookId !== req.params.bookId);
    
    res.json(carts[userId]);
});

// Clear cart
router.delete('/', (req, res) => {
    const userId = req.headers['user-id'];
    
    if (userId) {
        carts[userId] = [];
    }
    
    res.json({ message: 'Cart cleared' });
});

module.exports = router;
