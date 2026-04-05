/**
 * Split hosting: frontend on one host (e.g. Vercel), API on another (e.g. Render).
 *
 * Set your real API base here (must include /api, no trailing slash after that).
 * Example:
 *   window.BOOKSTORE_API_BASE = 'https://bookstore-api-xxxx.onrender.com/api';
 *
 * Leave empty for same-origin (local npm start or single Vercel app with rewrites).
 * On Vercel static deploys, set env BOOKSTORE_API_BASE and use build command:
 *   node scripts/inject-site-config.js
 */
window.BOOKSTORE_API_BASE = window.BOOKSTORE_API_BASE || '';
