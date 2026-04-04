/**
 * Express app (shared): local server and Vercel serverless.
 * DB connects on first /api request (or eagerly from server.js before listen).
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const { connectDb, mongoose } = require('./db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let initPromise = null;

async function runSeeds() {
    try {
        if (process.env.SEED_DEMO_USERS !== 'false') {
            const User = require('./models/User');
            const existingAdmin = await User.findOne({ email: 'admin@bookhaven.com' });
            if (!existingAdmin) {
                await User.create({
                    name: 'Admin User',
                    email: 'admin@bookhaven.com',
                    password: 'admin123',
                    role: 'admin'
                });
            }
            const existingJohn = await User.findOne({ email: 'john@example.com' });
            if (!existingJohn) {
                await User.create({
                    name: 'John Doe',
                    email: 'john@example.com',
                    password: 'password123',
                    role: 'user'
                });
            }
        }
    } catch (e) {
        console.error('Seed users error:', e);
    }
    try {
        if (process.env.SEED_REAL_BOOKS === 'false') return;
        if (process.env.SKIP_BOOK_SEED === 'true' || process.env.SKIP_BOOK_SEED === '1') return;
        const Book = require('./models/Book');
        const { getMongoCatalog } = require('./utils/bookCatalog');
        const realBooks = getMongoCatalog();
        const bookCount = await Book.countDocuments();
        if (bookCount === 0) {
            await Book.insertMany(realBooks.map((b) => ({ ...b })));
            console.log(`Seeded ${realBooks.length} books (Goodreads 10k CSV or fallback list)`);
        }
    } catch (e) {
        console.error('Seed books error:', e);
    }
}

function ensureInitialized() {
    if (!initPromise) {
        initPromise = (async () => {
            await connectDb();
            console.log('MongoDB Connected');
            await runSeeds();
        })();
    }
    return initPromise;
}

app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api')) {
        return next();
    }
    try {
        await ensureInitialized();
        next();
    } catch (err) {
        console.error('DB init error:', err);
        next(err);
    }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/demo-payment', require('./routes/demo-payment'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/feedback', require('./routes/feedback'));

const PORT = process.env.PORT || 3001;

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        port: Number(PORT),
        mongoState: mongoose.connection.readyState,
        mongoConnected: mongoose.connection.readyState === 1,
        vercel: process.env.VERCEL === '1'
    });
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

module.exports = { app, ensureInitialized };
