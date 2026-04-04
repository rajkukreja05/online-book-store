/**
 * Local development: long-running HTTP server.
 * Production (Vercel): use api/index.js + server/app.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, ensureInitialized } = require('./app');
const PORT = process.env.PORT || 3001;

ensureInitialized()
    .then(() => {
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Open in browser: http://127.0.0.1:${PORT}/`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(
                    `\n[Port ${PORT} is already in use]\n` +
                        `  • Stop the other process:  netstat -ano | findstr :${PORT}\n` +
                        `  • Then:  taskkill /PID <number> /F\n` +
                        `  • Or change PORT in server/.env (e.g. PORT=3002) and refresh the site.\n`
                );
            } else {
                console.error('Server listen error:', err);
            }
            process.exit(1);
        });
    })
    .catch((err) => {
        console.error('Startup failed:', err.message);
        process.exit(1);
    });
