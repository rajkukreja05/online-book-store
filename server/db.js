/**
 * Cached MongoDB connection for serverless (Vercel): reuse across invocations.
 */
const mongoose = require('mongoose');

function getMongoUri() {
    // Vercel/Atlas docs often use MONGODB_URI; we accept both.
    return (
        process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        'mongodb://localhost:27017/bookstore'
    );
}

let cached = global.__bookhavenMongoose;
if (!cached) {
    cached = global.__bookhavenMongoose = { promise: null };
}

async function connectDb() {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }
    if (!cached.promise) {
        const uri = getMongoUri();
        const opts = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 20000
        };
        cached.promise = mongoose.connect(uri, opts);
    }
    await cached.promise;
    return mongoose.connection;
}

module.exports = { connectDb, mongoose };
