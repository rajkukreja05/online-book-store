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
                hint: 'Set MONGO_URI in Vercel → Settings → Environment Variables (MongoDB Atlas).'
            });
        }
    }
};
