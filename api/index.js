/**
 * Vercel serverless entry: all traffic is routed here via vercel.json rewrites.
 */
const serverless = require('serverless-http');
const { app, ensureInitialized } = require('../server/app');

const handler = serverless(app);

module.exports = async (req, res) => {
    try {
        await ensureInitialized();
        return handler(req, res);
    } catch (err) {
        console.error('Vercel handler error:', err);
        if (!res.headersSent) {
            res.status(503).json({
                message: 'Database unavailable',
                hint:
                    'Set MONGO_URI or MONGODB_URI in Vercel → Environment Variables (MongoDB Atlas connection string). In Atlas → Network Access allow 0.0.0.0/0. Redeploy after saving env vars.'
            });
        }
    }
};
