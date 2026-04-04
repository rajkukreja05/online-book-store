const mongoose = require('mongoose');

const pullDemandSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['preorder', 'personal_request'],
        required: true
    },
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        default: null
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        default: '',
        trim: true
    },
    category: {
        type: String,
        default: 'Other'
    },
    language: {
        type: String,
        default: 'English'
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    notes: {
        type: String,
        default: '',
        trim: true
    },
    status: {
        type: String,
        enum: ['open', 'fulfilled', 'cancelled'],
        default: 'open'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PullDemand', pullDemandSchema);
