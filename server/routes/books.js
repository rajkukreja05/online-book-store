const express = require('express');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const User = require('../models/User');
const PullDemand = require('../models/PullDemand');

const router = express.Router();

const { getMongoCatalog, getFallbackBooksWithIds } = require('../utils/bookCatalog');

/** Goodreads CSV subset (or hand realBooks.js if CSV missing). */
const realBooksCatalog = getMongoCatalog();

/** In-memory fallback when MongoDB has no books (ids gb-1… or rb-1…). */
const fallbackBooks = getFallbackBooksWithIds();

async function requireAdmin(req, res, next) {
    try {
        const id = req.headers['x-admin-user-id'];
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(401).json({ message: 'Valid x-admin-user-id header required' });
        }
        const u = await User.findById(id).select('role');
        if (!u || u.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    } catch (e) {
        res.status(500).json({ message: 'Auth check failed' });
    }
}

// Get low stock books (ERP)
router.get('/low-stock', async (req, res) => {
    try {
        const threshold = parseInt(req.query.threshold) || 10;
        const books = await Book.find({ stock: { $lt: threshold } }).sort({ stock: 1 });
        res.json(books);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all books
router.get('/', async (req, res) => {
    try {
        let books = await Book.find().lean();
        const source = books.length ? books : fallbackBooks;

        const search = (req.query.search || '').toLowerCase();
        const category = req.query.category;
        const trendingOnly = req.query.trending === 'true';
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;

        const filtered = source.filter((book) => {
            if (category && book.category !== category) return false;
            if (search && !(`${book.title} ${book.author}`.toLowerCase().includes(search))) return false;
            if (trendingOnly && !book.isTrending) return false;
            if (maxPrice && Number(book.price || 0) > maxPrice) return false;
            return true;
        });

        res.json(filtered);
    } catch (error) {
        res.json(fallbackBooks);
    }
});

// Get trending books
router.get('/trending', async (req, res) => {
    try {
        let books = await Book.find({ isTrending: true });
        
        if (!books || books.length === 0) {
            books = fallbackBooks.filter(book => book.isTrending === true);
        }
        
        res.json(books);
    } catch (error) {
        res.json(fallbackBooks.filter(book => book.isTrending === true));
    }
});

// Seed generated sample books into MongoDB (utility endpoint)
router.post('/seed-generated', async (req, res) => {
    try {
        const existing = await Book.countDocuments();
        if (existing > 0 && req.query.force !== 'true') {
            return res.status(400).json({ message: 'Books already exist. Use ?force=true to reseed.' });
        }
        if (req.query.force === 'true') {
            await Book.deleteMany({});
        }
        await Book.insertMany(realBooksCatalog.map((b) => ({ ...b })), { ordered: false });
        res.json({ message: 'Seeded real books catalog', count: realBooksCatalog.length });
    } catch (error) {
        res.status(500).json({ message: 'Seed failed', error: error.message });
    }
});

// Customer preorder for an existing SKU (Pull-SCM demand signal)
router.post('/:id/preorder', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ message: 'Valid x-user-id header required' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid book id' });
        }

        const qty = Math.max(1, Number(req.body.quantity) || 1);
        const notes = String(req.body.notes || '');
        const book = await Book.findById(req.params.id).lean();
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }

        const row = await PullDemand.create({
            userId,
            type: 'preorder',
            bookId: book._id,
            title: book.title,
            author: book.author,
            category: book.category || 'Other',
            language: book.category === 'Hindi' ? 'Hindi' : 'English',
            quantity: qty,
            notes
        });

        res.status(201).json({
            message: 'Pre-order request captured',
            requestId: row._id
        });
    } catch (error) {
        res.status(500).json({ message: 'Could not create preorder request' });
    }
});

// Customer request for a not-listed/personalized title
router.post('/personal-request', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({ message: 'Valid x-user-id header required' });
        }

        const title = String(req.body.title || '').trim();
        const author = String(req.body.author || '').trim();
        const category = String(req.body.category || 'Other').trim();
        const language = String(req.body.language || 'English').trim();
        const quantity = Math.max(1, Number(req.body.quantity) || 1);
        const notes = String(req.body.notes || '').trim();

        if (!title) {
            return res.status(400).json({ message: 'title is required' });
        }

        const row = await PullDemand.create({
            userId,
            type: 'personal_request',
            title,
            author,
            category,
            language,
            quantity,
            notes
        });

        res.status(201).json({
            message: 'Personal book request captured',
            requestId: row._id
        });
    } catch (error) {
        res.status(500).json({ message: 'Could not create personal book request' });
    }
});

// Admin: view captured pull-demand requests
router.get('/demand/requests', requireAdmin, async (req, res) => {
    try {
        const { status = 'open', type } = req.query;
        const q = {};
        if (status !== 'all') q.status = status;
        if (type) q.type = type;

        const rows = await PullDemand.find(q)
            .sort({ createdAt: -1 })
            .limit(500)
            .populate('userId', 'name email')
            .populate('bookId', 'title stock')
            .lean();

        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Could not fetch demand requests' });
    }
});

// Admin: mark pull-demand request status
router.put('/demand/requests/:requestId/status', requireAdmin, async (req, res) => {
    try {
        const status = String(req.body.status || '').trim();
        if (!['open', 'fulfilled', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        const row = await PullDemand.findByIdAndUpdate(
            req.params.requestId,
            { status },
            { new: true }
        ).lean();
        if (!row) {
            return res.status(404).json({ message: 'Demand request not found' });
        }
        res.json(row);
    } catch (error) {
        res.status(500).json({ message: 'Could not update demand request status' });
    }
});

// Get single book
router.get('/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            const fallback = fallbackBooks.find((b) => String(b._id) === String(req.params.id));
            if (fallback) {
                return res.json(fallback);
            }
            return res.status(404).json({ message: 'Book not found' });
        }
        
        res.json(book);
    } catch (error) {
        const fallback = fallbackBooks.find((b) => String(b._id) === String(req.params.id));
        if (fallback) {
            return res.json(fallback);
        }
        res.status(404).json({ message: 'Book not found' });
    }
});

// Create book (admin only)
router.post('/', async (req, res) => {
    try {
        const book = new Book(req.body);
        await book.save();
        res.status(201).json(book);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update book (admin only)
router.put('/:id', async (req, res) => {
    try {
        const book = await Book.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }
        
        res.json(book);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete book (admin only)
router.delete('/:id', async (req, res) => {
    try {
        const book = await Book.findByIdAndDelete(req.params.id);
        
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }
        
        res.json({ message: 'Book deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
