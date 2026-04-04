const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Book = require('../models/Book');
const User = require('../models/User');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const fs = require('fs');
let razorpay = null;

// Lazy Razorpay init
function getRazorpay() {
  if (!razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
}

// Get all orders (admin) or user orders
router.get('/', async (req, res) => {
    try {
        const { userId, admin } = req.query;
        
        let query = {};
        
        // If not admin, only return user's orders
        if (userId && !admin) {
            query.userId = userId;
        }
        
        const orders = await Order.find(query).sort({ createdAt: -1 }).populate('userId', 'name email');
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Client-safe payment setup (Key ID is public; secret stays on server only)
router.get('/payment-config', (req, res) => {
    const hasRazorpay = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    res.json({
        razorpay: hasRazorpay,
        keyId: hasRazorpay ? process.env.RAZORPAY_KEY_ID : null,
        demo: process.env.ENABLE_DEMO_PAYMENT === 'true'
    });
});

// Create order when wallet fully covers payable amount
router.post('/wallet-checkout', async (req, res) => {
    try {
        const { orderData } = req.body || {};
        if (!orderData?.userId || !Array.isArray(orderData.items) || !orderData.items.length) {
            return res.status(400).json({ message: 'Invalid order data' });
        }
        const subtotal = Number(orderData.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0));
        const buyer = await User.findById(orderData.userId);
        if (!buyer) return res.status(404).json({ message: 'User not found' });
        const requestedWalletUse = Number(orderData.walletUsed || 0);
        const walletUsed = Math.max(0, Math.min(requestedWalletUse, Number(buyer.walletBalance || 0), subtotal));
        const payableTotal = Math.max(0, subtotal - walletUsed);
        if (payableTotal > 0) {
            return res.status(400).json({ message: 'Wallet does not fully cover this order' });
        }

        const addr = orderData.shippingAddress || {};
        const order = new Order({
            userId: orderData.userId,
            items: orderData.items.map(item => ({
                bookId: item._id,
                title: item.title,
                author: item.author,
                price: item.price,
                quantity: item.quantity,
                coverImage: item.coverImage
            })),
            total: payableTotal,
            subtotal,
            walletUsed,
            couponCode: orderData.couponCode || '',
            status: 'processing',
            paymentStatus: 'completed',
            paymentMethod: 'wallet',
            shippingAddress: {
                name: addr.name,
                phone: addr.phone,
                street: addr.street,
                city: addr.city,
                state: addr.state,
                zipCode: addr.zipCode,
                country: addr.country || 'India'
            }
        });
        await order.save();

        for (const item of orderData.items) {
            await Book.findByIdAndUpdate(item._id, { $inc: { stock: -item.quantity } });
        }

        const nextPurchaseCount = (buyer?.purchaseCount || 0) + 1;
        let segment = 'new';
        if (subtotal > 5000) segment = 'vip';
        else if (nextPurchaseCount >= 5) segment = 'regular';

        await User.findByIdAndUpdate(orderData.userId, {
            $inc: {
                totalSpent: payableTotal,
                loyaltyPoints: Math.floor(payableTotal / 100),
                purchaseCount: 1,
                walletBalance: -walletUsed
            },
            lastPurchase: new Date(),
            $push: {
                orders: order._id,
                walletTransactions: {
                    type: 'debit',
                    amount: walletUsed,
                    source: 'checkout',
                    note: `Used for order ${order._id}`
                }
            },
            segment
        });

        res.json({ status: 'success', order: order._id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get order by ID
router.get('/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('userId', 'name email');
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/create-razorpay-order', async (req, res) => {
    try {
        const { amount, currency = "INR", userId } = req.body;

        const rzpay = getRazorpay();
        if (!rzpay) {
          return res.status(503).json({ message: 'Payment gateway not configured' });
        }

        const options = {
            amount: amount * 100, // paise
            currency,
            receipt: `receipt_${Date.now()}`
        };

        const razorpayOrder = await rzpay.orders.create(options);

        res.json({
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Payment init error' });
    }
});

// Verify payment
router.post('/verify-payment', async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderData // { userId, items: [{_id, title, author, price, quantity, coverImage}], total }
        } = req.body;

        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest('hex');

        if (expectedSign === razorpay_signature) {
            const addr = orderData.shippingAddress || {};
            const subtotal = Number((orderData.items || []).reduce((sum, item) => {
                return sum + Number(item.price || 0) * Number(item.quantity || 0);
            }, 0));
            const buyer = await User.findById(orderData.userId);
            const requestedWalletUse = Number(orderData.walletUsed || 0);
            const walletUsed = Math.max(
                0,
                Math.min(requestedWalletUse, Number(buyer?.walletBalance || 0), subtotal)
            );
            const payableTotal = Math.max(0, subtotal - walletUsed);
            const order = new Order({
                userId: orderData.userId,
                items: orderData.items.map(item => ({
                    bookId: item._id,
                    title: item.title,
                    author: item.author,
                    price: item.price,
                    quantity: item.quantity,
                    coverImage: item.coverImage
                })),
                total: payableTotal,
                subtotal,
                walletUsed,
                couponCode: orderData.couponCode || '',
                status: 'processing',
                paymentStatus: 'completed',
                paymentId: razorpay_payment_id,
                paymentOrderId: razorpay_order_id,
                paymentMethod: 'razorpay',
                shippingAddress: {
                    name: addr.name,
                    phone: addr.phone,
                    street: addr.street,
                    city: addr.city,
                    state: addr.state,
                    zipCode: addr.zipCode,
                    country: addr.country || 'India'
                }
            });

            await order.save();

            for (const item of orderData.items) {
                await Book.findByIdAndUpdate(item._id, {
                    $inc: { stock: -item.quantity }
                });
            }

            const nextPurchaseCount = (buyer?.purchaseCount || 0) + 1;
            let segment = 'new';
            if (payableTotal > 5000) segment = 'vip';
            else if (nextPurchaseCount >= 5) segment = 'regular';

            const incUpdate = {
                $inc: {
                    totalSpent: payableTotal,
                    loyaltyPoints: Math.floor(payableTotal / 100),
                    purchaseCount: 1
                },
                lastPurchase: new Date(),
                $push: { orders: order._id },
                segment
            };
            if (walletUsed > 0) {
                incUpdate.$inc.walletBalance = -walletUsed;
                incUpdate.$push.walletTransactions = {
                    type: 'debit',
                    amount: walletUsed,
                    source: 'checkout',
                    note: `Used for order ${order._id}`
                };
            }
            await User.findByIdAndUpdate(orderData.userId, incUpdate);

            res.json({ status: 'success', order: order._id });
        } else {
            res.status(400).json({ status: 'fail', message: 'Invalid signature' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate invoice PDF
router.get('/:id/invoice', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items.bookId');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice_${order._id}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text('BookHaven Invoice', 50, 50);
        doc.text(`Order ID: ${order._id}`, 50, 100);
        doc.text(`Date: ${order.createdAt.toDateString()}`, 50, 120);
        doc.text(`Total: ₹${order.total}`, 50, 140);
        doc.text(`Status: ${order.status}`, 50, 160);

        let y = 200;
        doc.text('Items:', 50, y);
        y += 30;
        order.items.forEach((item) => {
            doc.text(`${item.title} x${item.quantity} - ₹${item.price * item.quantity}`, 50, y);
            y += 20;
        });

        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Invoice error' });
    }
});

// Create order (for testing/cod)
router.post('/', async (req, res) => {
    try {
        const order = new Order(req.body);
        await order.save();
        res.status(201).json(order);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update order status (admin)
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        // If cancelling, restore stock
        if (status === 'cancelled' && order.status !== 'cancelled') {
            for (const item of order.items) {
                await Book.findByIdAndUpdate(item.bookId, {
                    $inc: { stock: item.quantity }
                });
            }
        }
        
        order.status = status;
        order.paymentStatus = status === 'delivered' ? 'completed' : order.paymentStatus;
        await order.save();
        
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Cancel order (user/admin)
router.put('/:id/cancel', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        if (order.status === 'cancelled' || order.status === 'delivered') {
            return res.status(400).json({ message: 'Order cannot be cancelled' });
        }
        
        // Restore stock
        for (const item of order.items) {
            await Book.findByIdAndUpdate(item.bookId, {
                $inc: { stock: item.quantity }
            });
        }
        
        order.status = 'cancelled';
        await order.save();
        
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete order (admin only)
router.delete('/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        
        // Restore stock if not cancelled
        if (order.status !== 'cancelled') {
            for (const item of order.items) {
                await Book.findByIdAndUpdate(item.bookId, {
                    $inc: { stock: item.quantity }
                });
            }
        }
        
        await Order.findByIdAndDelete(req.params.id);
        
        res.json({ message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get admin statistics
router.get('/admin/stats', async (req, res) => {
    try {
        const { period = 'all', year = new Date().getFullYear() } = req.query;
        const match = {};
        if (period !== 'all') {
            const now = new Date();
            const startDate = new Date(year, 0, 1);
            if (period === 'month') startDate.setMonth(now.getMonth());
            else if (period === 'week') startDate.setDate(now.getDate() - now.getDay());
            match.createdAt = { $gte: startDate };
        }

        const totalOrders = await Order.countDocuments(match);
        const pending = await Order.countDocuments({ ...match, status: { $in: ['pending', 'processing'] } });
        const shipped = await Order.countDocuments({ ...match, status: 'shipped' });
        const delivered = await Order.countDocuments({ ...match, status: 'delivered' });
        const cancelled = await Order.countDocuments({ ...match, status: 'cancelled' });
        
        const totalRevenue = await Order.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        const topProducts = await Order.aggregate([
            { $match: match },
            { $unwind: '$items' },
            { $group: { _id: '$items.title', quantity: { $sum: '$items.quantity' } } },
            { $sort: { quantity: -1 } },
            { $limit: 5 }
        ]);

        res.json({
            totalOrders,
            pending,
            shipped,
            delivered,
            cancelled,
            totalRevenue: totalRevenue[0]?.total || 0,
            topProducts,
            period
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

