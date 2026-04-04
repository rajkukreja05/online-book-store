const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    phone: {
        type: String,
        default: ''
    },
    address: {
        type: Object,
        default: {}
    },
    // TOTP (Google Authenticator-style) fields
    totpSecret: {
        type: String,
        default: null
    },
    totpEnabled: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    }],
    loyaltyPoints: {
        type: Number,
        default: 0
    },
    coupons: [{
        code: { type: String, required: true },
        amount: { type: Number, required: true, min: 1 },
        currency: { type: String, default: 'INR' },
        status: {
            type: String,
            enum: ['active', 'used', 'expired'],
            default: 'active'
        },
        note: { type: String, default: '' },
        issuedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, default: null }
    }],
    walletBalance: {
        type: Number,
        default: 0
    },
    walletTransactions: [{
        type: {
            type: String,
            enum: ['credit', 'debit'],
            required: true
        },
        amount: { type: Number, required: true, min: 1 },
        source: { type: String, default: '' },
        note: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now }
    }],
    totalSpent: {
        type: Number,
        default: 0
    },
    segment: {
        type: String,
        enum: ['new', 'regular', 'vip'],
        default: 'new'
    },
    lastPurchase: {
        type: Date
    },
    purchaseCount: {
        type: Number,
        default: 0
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
