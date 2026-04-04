const express = require('express');
const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const User = require('../models/User');

const router = express.Router();

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

// Public submit form
router.post('/', async (req, res) => {
    try {
        const { name, email, subject, message, rating, category, userId } = req.body || {};
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ message: 'name, email, subject and message are required' });
        }
        const doc = await Feedback.create({
            name,
            email,
            subject,
            message,
            rating: Number(rating) || 5,
            category: category || 'general',
            userId: mongoose.Types.ObjectId.isValid(userId) ? userId : null
        });
        res.status(201).json({ message: 'Feedback submitted', id: doc._id });
    } catch (e) {
        res.status(500).json({ message: 'Feedback submit failed', error: e.message });
    }
});

// Admin list
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { status, category } = req.query;
        const q = {};
        if (status) q.status = status;
        if (category) q.category = category;
        const rows = await Feedback.find(q).sort({ createdAt: -1 }).limit(200).lean();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: 'Feedback fetch failed' });
    }
});

// Admin status update
router.put('/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!['new', 'reviewed', 'resolved'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        const row = await Feedback.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!row) return res.status(404).json({ message: 'Feedback not found' });
        res.json(row);
    } catch (e) {
        res.status(500).json({ message: 'Update failed' });
    }
});

module.exports = router;

