const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const Book = require('../models/Book');
const Feedback = require('../models/Feedback');
const PullDemand = require('../models/PullDemand');

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

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** Decision-support + ERP overview */
router.get('/decision-dashboard', requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const [
            orderStats,
            crmUsers,
            books,
            revenueByDay,
            categoryRevenue
        ] = await Promise.all([
            Order.aggregate([
                {
                    $facet: {
                        all: [{ $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } }],
                        mtd: [
                            { $match: { createdAt: { $gte: monthStart }, status: { $ne: 'cancelled' } } },
                            { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' } } }
                        ],
                        pending: [{ $match: { status: { $in: ['pending', 'processing'] } } }, { $count: 'n' }]
                    }
                }
            ]),
            User.aggregate([
                { $match: { role: 'user' } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        newSeg: { $sum: { $cond: [{ $eq: ['$segment', 'new'] }, 1, 0] } },
                        regularSeg: { $sum: { $cond: [{ $eq: ['$segment', 'regular'] }, 1, 0] } },
                        vipSeg: { $sum: { $cond: [{ $eq: ['$segment', 'vip'] }, 1, 0] } },
                        loyalty: { $sum: '$loyaltyPoints' }
                    }
                }
            ]),
            Book.find().select('title stock price category').lean(),
            Order.aggregate([
                { $match: { createdAt: { $gte: weekAgo }, status: { $ne: 'cancelled' } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.title',
                        qty: { $sum: '$items.quantity' },
                        lineTotal: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                    }
                },
                { $sort: { lineTotal: -1 } },
                { $limit: 8 }
            ])
        ]);

        const facet = orderStats[0] || {};
        const allO = facet.all?.[0] || { count: 0, revenue: 0 };
        const mtd = facet.mtd?.[0] || { count: 0, revenue: 0 };
        const pendingN = facet.pending?.[0]?.n ?? 0;
        const crm = crmUsers[0] || { total: 0, newSeg: 0, regularSeg: 0, vipSeg: 0, loyalty: 0 };

        const threshold = 10;
        const lowStockBooks = books.filter(b => (b.stock || 0) < threshold);
        const inventoryValue = books.reduce((s, b) => s + (b.price || 0) * (b.stock || 0), 0);

        res.json({
            orders: {
                lifetimeCount: allO.count,
                lifetimeRevenue: allO.revenue,
                monthToDateOrders: mtd.count,
                monthToDateRevenue: mtd.revenue,
                pipelinePending: pendingN
            },
            crm: {
                totalCustomers: crm.total,
                segmentNew: crm.newSeg,
                segmentRegular: crm.regularSeg,
                segmentVip: crm.vipSeg,
                totalLoyaltyPoints: crm.loyalty
            },
            inventory: {
                skuCount: books.length,
                inventoryValueAtCostPrice: Math.round(inventoryValue),
                lowStockSkuCount: lowStockBooks.length,
                reorderAttention: lowStockBooks.slice(0, 5).map(b => ({
                    title: b.title,
                    stock: b.stock
                }))
            },
            charts: {
                revenueLast7Days: revenueByDay,
                topTitlesByRevenue: categoryRevenue
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Analytics error' });
    }
});

/** Sales report — optional date range */
router.get('/sales-report', requireAdmin, async (req, res) => {
    try {
        const to = req.query.to ? startOfDay(new Date(req.query.to)) : startOfDay(new Date());
        to.setHours(23, 59, 59, 999);
        let from = req.query.from ? startOfDay(new Date(req.query.from)) : new Date(to);
        if (!req.query.from) {
            from.setDate(from.getDate() - 29);
        }

        const match = {
            createdAt: { $gte: from, $lte: to },
            status: { $ne: 'cancelled' }
        };

        const [summary, byDay, byStatus, paymentMix] = await Promise.all([
            Order.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        orderCount: { $sum: 1 },
                        grossRevenue: { $sum: '$total' },
                        avgOrderValue: { $avg: '$total' }
                    }
                }
            ]),
            Order.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: match },
                { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$total' } } }
            ]),
            Order.aggregate([
                { $match: match },
                { $group: { _id: '$paymentMethod', count: { $sum: 1 }, revenue: { $sum: '$total' } } }
            ])
        ]);

        const s = summary[0] || { orderCount: 0, grossRevenue: 0, avgOrderValue: 0 };

        res.json({
            period: { from: from.toISOString(), to: to.toISOString() },
            summary: {
                orderCount: s.orderCount,
                grossRevenue: s.grossRevenue,
                avgOrderValue: Math.round((s.avgOrderValue || 0) * 100) / 100
            },
            seriesByDay: byDay,
            byStatus,
            byPaymentMethod: paymentMix
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Sales report error' });
    }
});

/** Inventory ↔ sales: units sold vs on-hand stock */
router.get('/inventory-sales', requireAdmin, async (req, res) => {
    try {
        const books = await Book.find().lean();

        const sold = await Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.bookId',
                    unitsSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            }
        ]);

        const salesMap = new Map(
            sold.map(row => [row._id ? String(row._id) : '', { unitsSold: row.unitsSold, revenue: row.revenue }])
        );

        const rows = books
            .map(b => {
                const id = String(b._id);
                const s = salesMap.get(id) || { unitsSold: 0, revenue: 0 };
                const stock = b.stock || 0;
                const velocity = s.unitsSold > 0 ? stock / s.unitsSold : null;
                let linkageStatus = 'ok';
                if (stock < 10) linkageStatus = 'low';
                if (s.unitsSold === 0) linkageStatus = stock < 10 ? 'low' : 'no_sales';
                if (stock === 0 && s.unitsSold > 0) linkageStatus = 'stockout_risk';
                return {
                    bookId: id,
                    title: b.title,
                    category: b.category,
                    stockOnHand: stock,
                    unitsSoldLifetime: s.unitsSold,
                    revenueFromSku: s.revenue,
                    estimatedWeeksCover: velocity != null ? Math.round(velocity * 4 * 10) / 10 : null,
                    linkageStatus
                };
            })
            .sort((a, b) => b.revenueFromSku - a.revenueFromSku);

        res.json({ rows, generatedAt: new Date().toISOString() });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Inventory linkage error' });
    }
});

// IDIC CRM model summary
router.get('/idic-model', requireAdmin, async (req, res) => {
    try {
        const [totalCustomers, segments, feedbackByCategory, feedbackRecent] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.aggregate([
                { $match: { role: 'user' } },
                { $group: { _id: '$segment', count: { $sum: 1 } } }
            ]),
            Feedback.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
                { $sort: { count: -1 } }
            ]),
            Feedback.find().sort({ createdAt: -1 }).limit(10).lean()
        ]);

        res.json({
            identify: { totalCustomers },
            differentiate: segments,
            interact: feedbackByCategory,
            customize: {
                recommendation: 'Use segment + feedback category to target campaigns and support priorities.'
            },
            recentFeedback: feedbackRecent
        });
    } catch (e) {
        res.status(500).json({ message: 'IDIC analytics error' });
    }
});

// Supply chain management summary
router.get('/supply-chain', requireAdmin, async (req, res) => {
    try {
        const books = await Book.find().lean();
        const sales = await Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.bookId', unitsSold: { $sum: '$items.quantity' } } }
        ]);
        const soldMap = new Map(sales.map(s => [String(s._id), s.unitsSold]));

        const recommendations = books.map((b) => {
            const units = soldMap.get(String(b._id)) || 0;
            const stock = b.stock || 0;
            let action = 'Hold';
            if (stock < 10 && units > 0) action = 'Reorder Now';
            else if (stock < 10 && units === 0) action = 'Review SKU';
            else if (stock > 60 && units < 5) action = 'Slow Moving';
            return {
                title: b.title,
                category: b.category,
                stock,
                unitsSold: units,
                action,
                supplierETA: action === 'Reorder Now' ? '5 days' : '-'
            };
        }).sort((a, b) => {
            const rank = (x) => (x.action === 'Reorder Now' ? 0 : x.action === 'Review SKU' ? 1 : x.action === 'Slow Moving' ? 2 : 3);
            return rank(a) - rank(b);
        });

        res.json({
            summary: {
                totalSkus: books.length,
                reorderNow: recommendations.filter(r => r.action === 'Reorder Now').length,
                reviewSku: recommendations.filter(r => r.action === 'Review SKU').length,
                slowMoving: recommendations.filter(r => r.action === 'Slow Moving').length
            },
            recommendations: recommendations.slice(0, 200)
        });
    } catch (e) {
        res.status(500).json({ message: 'Supply chain analytics error' });
    }
});

// Pull SCM (demand-driven replenishment)
router.get('/supply-chain/pull', requireAdmin, async (req, res) => {
    try {
        const leadTimeDays = Math.max(1, Number(req.query.leadTimeDays) || 5);
        const reviewPeriodDays = Math.max(7, Number(req.query.reviewPeriodDays) || 7);
        const lookbackDays = Math.max(14, Number(req.query.lookbackDays) || 30);
        const serviceLevelFactor = Math.max(0, Number(req.query.serviceLevelFactor) || 1.65); // ~95% cycle service level

        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - lookbackDays);

        const [books, demandRows, pullDemandRows, personalDemandRows] = await Promise.all([
            Book.find().lean(),
            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' }, createdAt: { $gte: fromDate } } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.bookId',
                        units: { $sum: '$items.quantity' }
                    }
                }
            ]),
            PullDemand.aggregate([
                {
                    $match: {
                        type: 'preorder',
                        status: 'open',
                        createdAt: { $gte: fromDate },
                        bookId: { $ne: null }
                    }
                },
                { $group: { _id: '$bookId', units: { $sum: '$quantity' } } }
            ]),
            PullDemand.aggregate([
                {
                    $match: {
                        type: 'personal_request',
                        status: 'open',
                        createdAt: { $gte: fromDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            title: '$title',
                            author: '$author',
                            category: '$category',
                            language: '$language'
                        },
                        requests: { $sum: '$quantity' }
                    }
                },
                { $sort: { requests: -1 } },
                { $limit: 50 }
            ])
        ]);

        const orderDemandMap = new Map(demandRows.map(r => [String(r._id), Number(r.units || 0)]));
        const preorderDemandMap = new Map(pullDemandRows.map(r => [String(r._id), Number(r.units || 0)]));

        const rows = books
            .map((b) => {
                const skuId = String(b._id);
                const stockOnHand = Number(b.stock || 0);
                const unitsFromOrders = orderDemandMap.get(skuId) || 0;
                const unitsFromPreorders = preorderDemandMap.get(skuId) || 0;
                const unitsInLookback = unitsFromOrders + unitsFromPreorders;
                const avgDailyDemand = unitsInLookback / lookbackDays;

                // Pull model:
                // Reorder Point (ROP) = demand during lead time + safety stock
                // Target Level = demand during (lead time + review period) + safety stock
                const demandDuringLeadTime = avgDailyDemand * leadTimeDays;
                const demandDuringCoverage = avgDailyDemand * (leadTimeDays + reviewPeriodDays);
                const demandStdApprox = Math.sqrt(Math.max(unitsInLookback, 0));
                const safetyStock = serviceLevelFactor * demandStdApprox;

                const reorderPoint = Math.ceil(demandDuringLeadTime + safetyStock);
                const targetLevel = Math.ceil(demandDuringCoverage + safetyStock);
                const suggestedOrderQty = Math.max(0, targetLevel - stockOnHand);

                const pullSignal = stockOnHand <= reorderPoint ? 'PULL_REPLENISH' : 'HOLD';
                const daysOfCover = avgDailyDemand > 0 ? Number((stockOnHand / avgDailyDemand).toFixed(1)) : null;

                return {
                    bookId: skuId,
                    title: b.title,
                    category: b.category,
                    stockOnHand,
                    demandFromOrders: unitsFromOrders,
                    demandFromPreorders: unitsFromPreorders,
                    unitsInLookback,
                    avgDailyDemand: Number(avgDailyDemand.toFixed(3)),
                    reorderPoint,
                    targetLevel,
                    suggestedOrderQty,
                    daysOfCover,
                    pullSignal
                };
            })
            .sort((a, b) => {
                if (a.pullSignal !== b.pullSignal) return a.pullSignal === 'PULL_REPLENISH' ? -1 : 1;
                return b.suggestedOrderQty - a.suggestedOrderQty;
            });

        res.json({
            model: 'pull_scm',
            params: { leadTimeDays, reviewPeriodDays, lookbackDays, serviceLevelFactor },
            summary: {
                totalSkus: rows.length,
                skusToReplenish: rows.filter(r => r.pullSignal === 'PULL_REPLENISH').length,
                totalSuggestedOrderQty: rows.reduce((sum, r) => sum + r.suggestedOrderQty, 0)
            },
            rows: rows.slice(0, 300),
            externalDemandSignals: {
                personalRequestsTop: personalDemandRows.map((r) => ({
                    title: r._id.title,
                    author: r._id.author,
                    category: r._id.category,
                    language: r._id.language,
                    requestedUnits: r.requests
                }))
            },
            generatedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Pull SCM analytics error' });
    }
});

module.exports = router;
