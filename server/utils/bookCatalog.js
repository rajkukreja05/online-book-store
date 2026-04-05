/**
 * Loads a subset of the Goodreads 10k dataset (goodbooks-10k / Kaggle-style notebooks).
 * CSV source: https://github.com/zygmuntz/goodbooks-10k — books.csv
 * Only the first MAX_CATALOG_BOOKS rows are used so API responses stay faster.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

/** Rotating labels for English / non-Hindi rows only — Hindi is never assigned by modulo. */
const NON_HINDI_CATEGORIES = ['Fiction', 'Science', 'Technology', 'History', 'Biography', 'Self-Help', 'Other'];

function hasDevanagari(text) {
    if (text == null || text === '') return false;
    return /[\u0900-\u097F]/.test(String(text));
}

const CSV_NAME = 'goodbooks-10k-books.csv';

/** Cap CSV rows (full file ~10k). Lower = faster /books and seeding. */
const MAX_CATALOG_BOOKS = 4000;

let cachedMongoDocs = null;
let cachedFallback = null;

function normalizeIsbn(row) {
    const raw = row.isbn13 != null && String(row.isbn13).trim() !== '' ? row.isbn13 : row.isbn;
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    if (/^[\d.eE+-]+$/.test(s)) {
        const n = parseFloat(s);
        if (Number.isFinite(n) && n > 1e9) return String(Math.round(n));
    }
    return s.replace(/\.0+$/, '');
}

function rowToBook(row) {
    const bookId = parseInt(row.book_id, 10);
    if (!Number.isFinite(bookId)) return null;

    const authors = String(row.authors || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const author = (authors[0] || 'Unknown').slice(0, 200);

    const fullTitle = String(row.title || '').trim();
    const orig = String(row.original_title || '').trim();
    const title = (fullTitle || orig).slice(0, 500);

    const yearRaw = row.original_publication_year;
    let publishedYear;
    if (yearRaw != null && String(yearRaw).trim() !== '') {
        const y = Math.floor(parseFloat(yearRaw));
        if (Number.isFinite(y) && y > 1000 && y < 2100) publishedYear = y;
    }

    const avg = parseFloat(row.average_rating);
    const rating = Number.isFinite(avg) ? Math.round(Math.min(5, Math.max(0, avg)) * 10) / 10 : 4;

    const ratingsCount = parseInt(String(row.ratings_count || '0').replace(/,/g, ''), 10) || 0;
    const image = String(row.image_url || '').trim();

    const category =
        hasDevanagari(title) || hasDevanagari(author)
            ? 'Hindi'
            : NON_HINDI_CATEGORIES[bookId % NON_HINDI_CATEGORIES.length];
    const price = Math.min(1999, Math.max(149, Math.round(199 + (bookId % 37) * 11 + (Number.isFinite(avg) ? avg : 4) * 38)));
    const stock = 5 + (bookId % 120);

    const isTrending = bookId <= 150 || (Number.isFinite(avg) && avg >= 4.35 && ratingsCount > 800000);

    const description = [
        `Goodreads 10k dataset · ${Number.isFinite(avg) ? avg.toFixed(2) : '—'} avg rating`,
        ratingsCount ? `· ${ratingsCount.toLocaleString('en-IN')} ratings` : '',
        publishedYear ? `· First published ${publishedYear}` : ''
    ]
        .join(' ')
        .trim();

    return {
        bookId,
        title,
        author,
        category,
        price,
        description,
        coverImage: image || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400',
        rating,
        stock,
        isbn: normalizeIsbn(row).slice(0, 32),
        publishedYear,
        isTrending
    };
}

function loadFromCsv() {
    const csvPath = path.join(__dirname, '..', 'data', CSV_NAME);
    if (!fs.existsSync(csvPath)) {
        return null;
    }
    const raw = fs.readFileSync(csvPath, 'utf8');
    const records = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true
    });
    const out = [];
    for (const row of records) {
        const b = rowToBook(row);
        if (b) out.push(b);
        if (out.length >= MAX_CATALOG_BOOKS) break;
    }
    return out;
}

/**
 * Append curated Hindi titles from realBooks.js so "Hindi" category always has real literature,
 * and dedupe by ISBN / title+author vs CSV rows.
 */
function mergeCuratedHindiRows(rowsSansBookId) {
    const manual = require('../data/realBooks');
    const hindiCurated = manual.filter((b) => b.category === 'Hindi');
    const seenIsbn = new Set();
    const seenTitleAuthor = new Set();
    for (const r of rowsSansBookId) {
        const isbn = String(r.isbn || '').trim();
        if (isbn) seenIsbn.add(isbn);
        seenTitleAuthor.add(`${String(r.title || '').toLowerCase()}||${String(r.author || '').toLowerCase()}`);
    }
    const extras = [];
    for (const h of hindiCurated) {
        const isbn = String(h.isbn || '').trim();
        if (isbn && seenIsbn.has(isbn)) continue;
        const ta = `${String(h.title || '').toLowerCase()}||${String(h.author || '').toLowerCase()}`;
        if (seenTitleAuthor.has(ta)) continue;
        extras.push({ ...h });
        if (isbn) seenIsbn.add(isbn);
        seenTitleAuthor.add(ta);
    }
    return rowsSansBookId.concat(extras);
}

function mergeCuratedHindiFallback(baseWithIds) {
    const manual = require('../data/realBooks');
    const hindiCurated = manual.filter((b) => b.category === 'Hindi');
    const seenIsbn = new Set();
    const seenTitleAuthor = new Set();
    for (const r of baseWithIds) {
        const isbn = String(r.isbn || '').trim();
        if (isbn) seenIsbn.add(isbn);
        seenTitleAuthor.add(`${String(r.title || '').toLowerCase()}||${String(r.author || '').toLowerCase()}`);
    }
    const extras = [];
    for (const h of hindiCurated) {
        const isbn = String(h.isbn || '').trim();
        if (isbn && seenIsbn.has(isbn)) continue;
        const ta = `${String(h.title || '').toLowerCase()}||${String(h.author || '').toLowerCase()}`;
        if (seenTitleAuthor.has(ta)) continue;
        const safe = (isbn || `x${extras.length}`).replace(/[^a-zA-Z0-9]/g, '');
        extras.push({ ...h, _id: `rb-h-${safe}` });
        if (isbn) seenIsbn.add(isbn);
        seenTitleAuthor.add(ta);
    }
    return baseWithIds.concat(extras);
}

/**
 * Documents for MongoDB (no _id).
 */
function getMongoCatalog() {
    if (cachedMongoDocs) return cachedMongoDocs;
    const fromCsv = loadFromCsv();
    if (fromCsv && fromCsv.length) {
        const stripped = fromCsv.map(({ bookId, ...rest }) => rest);
        cachedMongoDocs = mergeCuratedHindiRows(stripped);
        return cachedMongoDocs;
    }
    const manual = require('../data/realBooks');
    cachedMongoDocs = manual.map(({ bookId, ...rest }) => rest);
    return cachedMongoDocs;
}

/**
 * Fallback rows when Mongo is empty: stable string ids gb-{book_id} or rb-{i} for manual.
 */
function getFallbackBooksWithIds() {
    if (cachedFallback) return cachedFallback;
    const fromCsv = loadFromCsv();
    if (fromCsv && fromCsv.length) {
        const base = fromCsv.map((b) => {
            const { bookId, ...rest } = b;
            return { ...rest, _id: `gb-${bookId}` };
        });
        cachedFallback = mergeCuratedHindiFallback(base);
        return cachedFallback;
    }
    const manual = require('../data/realBooks');
    cachedFallback = manual.map((b, i) => ({ ...b, _id: `rb-${i + 1}` }));
    return cachedFallback;
}

function getCatalogLength() {
    const fromCsv = loadFromCsv();
    if (fromCsv && fromCsv.length) return fromCsv.length;
    return require('../data/realBooks').length;
}

module.exports = {
    getMongoCatalog,
    getFallbackBooksWithIds,
    getCatalogLength,
    CSV_NAME,
    MAX_CATALOG_BOOKS
};
