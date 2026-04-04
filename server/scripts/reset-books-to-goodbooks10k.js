/**
 * Deletes every document in the books collection and inserts the full
 * Goodreads 10k catalog from server/data/goodbooks-10k-books.csv (via bookCatalog).
 *
 * Usage: node scripts/reset-books-to-goodbooks10k.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Book = require('../models/Book');
const { getMongoCatalog } = require('../utils/bookCatalog');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bookstore';

async function main() {
    await mongoose.connect(MONGO_URI);
    const deleted = await Book.deleteMany({});
    console.log('Deleted books:', deleted.deletedCount);

    const docs = getMongoCatalog();
    if (!docs.length) {
        console.error('No catalog rows — add server/data/goodbooks-10k-books.csv');
        process.exit(1);
    }

    const BATCH = 2500;
    let inserted = 0;
    for (let i = 0; i < docs.length; i += BATCH) {
        const chunk = docs.slice(i, i + BATCH).map((b) => ({ ...b }));
        const r = await Book.insertMany(chunk, { ordered: false });
        inserted += r.length;
        console.log('Inserted batch… total so far:', inserted);
    }

    console.log('Done. Total inserted:', inserted, '(expected', docs.length, ')');
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
