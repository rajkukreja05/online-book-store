const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

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
    } catch (error) {
        res.status(500).json({ message: 'Auth check failed' });
    }
}

async function requireSelfOrAdmin(req, res, next) {
    try {
        const requesterId = req.headers['x-user-id'];
        if (!requesterId || !mongoose.Types.ObjectId.isValid(requesterId)) {
            return res.status(401).json({ message: 'Valid x-user-id header required' });
        }
        const requester = await User.findById(requesterId).select('role');
        if (!requester) return res.status(401).json({ message: 'Unauthorized' });
        if (requester.role === 'admin' || String(requesterId) === String(req.params.id)) {
            return next();
        }
        return res.status(403).json({ message: 'Access denied' });
    } catch (error) {
        res.status(500).json({ message: 'Auth check failed' });
    }
}

// IMPORTANT: /stats before /:id so "stats" is not parsed as an ObjectId
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const totalCustomers = await User.countDocuments({ role: 'user' });
        const newCustomers = await User.countDocuments({ role: 'user', segment: 'new' });
        const vipCustomers = await User.countDocuments({ role: 'user', segment: 'vip' });
        const regularCustomers = await User.countDocuments({ role: 'user', segment: 'regular' });
        const avgOrderValue = await Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, avg: { $avg: '$total' } } }
        ]);
        const totalRevenue = await Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        const retentionRate = totalCustomers ? Math.round((vipCustomers / totalCustomers) * 100) : 0;

        res.json({
            totalCustomers,
            newCustomers,
            regularCustomers,
            vipCustomers,
            avgOrderValue: avgOrderValue[0]?.avg || 0,
            totalRevenue: totalRevenue[0]?.total || 0,
            retentionRate
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/customers — CRM customer list
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, segment, search } = req.query;
        const query = { role: 'user' };

        if (segment) query.segment = segment;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const customers = await User.find(query)
            .select('-password')
            .sort({ totalSpent: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await User.countDocuments(query);

        res.json({
            customers,
            totalPages: Math.ceil(total / limit),
            currentPage: Number(page),
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/customers/:id — profile + order refs
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid id' });
        }
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('orders', 'total status createdAt paymentStatus')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/:id/segment', requireAdmin, async (req, res) => {
    try {
        const { segment } = req.body;
        if (!['new', 'regular', 'vip'].includes(segment)) {
            return res.status(400).json({ message: 'Invalid segment' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { segment }, { new: true }).select(
            '-password'
        );

        if (!user) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:id/loyalty', requireAdmin, async (req, res) => {
    try {
        const points = Number(req.body.points);
        if (Number.isNaN(points)) {
            return res.status(400).json({ message: 'Invalid points' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { $inc: { loyaltyPoints: points } }, { new: true }).select(
            '-password'
        );

        if (!user) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Gift coupon to customer (admin)
router.post('/:id/coupon', requireAdmin, async (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const note = String(req.body.note || '');
        const validDays = Number(req.body.validDays || 30);
        if (Number.isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Invalid coupon amount' });
        }
        const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
        const code = `CPN-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Customer not found' });

        user.coupons.push({
            code,
            amount,
            currency: 'INR',
            status: 'used',
            note: note || 'Wallet top-up coupon',
            issuedAt: new Date(),
            expiresAt
        });
        user.walletBalance = Number(user.walletBalance || 0) + amount;
        user.walletTransactions.push({
            type: 'credit',
            amount,
            source: 'admin_coupon',
            note: `Coupon gifted and auto-credited: ${code}`
        });
        await user.save();

        res.json({
            message: `Coupon added and ₹${amount} credited to wallet`,
            coupon: user.coupons[user.coupons.length - 1],
            walletBalance: user.walletBalance
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get coupons for self or admin view
router.get('/:id/coupons', requireSelfOrAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('name email coupons');
        if (!user) return res.status(404).json({ message: 'Customer not found' });
        const coupons = (user.coupons || []).sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
        res.json({ user: { _id: user._id, name: user.name, email: user.email }, coupons });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:id/wallet', requireSelfOrAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('walletBalance walletTransactions coupons');
        if (!user) return res.status(404).json({ message: 'Customer not found' });
        const activeCoupons = (user.coupons || []).filter(c => {
            if (c.status !== 'active') return false;
            if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
            return true;
        });
        res.json({
            walletBalance: user.walletBalance || 0,
            activeCouponsCount: activeCoupons.length,
            activeCouponsValue: activeCoupons.reduce((sum, c) => sum + Number(c.amount || 0), 0),
            recentTransactions: (user.walletTransactions || []).slice(-10).reverse()
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:id/redeem-coupon', requireSelfOrAdmin, async (req, res) => {
    try {
        const code = String(req.body.code || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ message: 'Coupon code is required' });

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'Customer not found' });

        const idx = (user.coupons || []).findIndex(c => String(c.code || '').toUpperCase() === code);
        if (idx < 0) return res.status(404).json({ message: 'Coupon code failed' });

        const coupon = user.coupons[idx];
        if (coupon.status !== 'active') return res.status(400).json({ message: 'Coupon is already used/invalid' });
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
            coupon.status = 'expired';
            await user.save();
            return res.status(400).json({ message: 'Coupon expired' });
        }

        coupon.status = 'used';
        user.walletBalance = Number(user.walletBalance || 0) + Number(coupon.amount || 0);
        user.walletTransactions.push({
            type: 'credit',
            amount: Number(coupon.amount || 0),
            source: 'coupon',
            note: `Coupon redeemed: ${coupon.code}`
        });
        await user.save();

        res.json({
            message: `Wallet topped up by ₹${coupon.amount}`,
            walletBalance: user.walletBalance
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
