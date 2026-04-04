
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Book = require('../models/Book');
const User = require('../models/User');

function demoEnabled() {
  return process.env.ENABLE_DEMO_PAYMENT === 'true';
}

// Create Demo Order (mock Razorpay) — only when ENABLE_DEMO_PAYMENT=true
router.post('/create-demo-order', async (req, res) => {
  try {
    if (!demoEnabled()) {
      return res.status(403).json({ message: 'Demo payment is disabled' });
    }
    const { amount, currency = "INR", userId } = req.body;
    
    const mockOrderId = `demo_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      id: mockOrderId,
      amount: amount * 100, // paise
      currency,
      key: 'demo_bookhaven_key'
    });
  } catch (error) {
    res.status(500).json({ message: 'Demo order failed' });
  }
});

// Verify Demo Payment (always success, creates real Order)
router.post('/verify-demo-payment', async (req, res) => {
  try {
    if (!demoEnabled()) {
      return res.status(403).json({ message: 'Demo payment is disabled' });
    }
    const {
      demo_order_id,
      demo_payment_id,
      orderData
    } = req.body;

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
      paymentId: demo_payment_id,
      paymentOrderId: demo_order_id,
      paymentMethod: 'demo_card',
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Demo verification failed' });
  }
});

module.exports = router;

