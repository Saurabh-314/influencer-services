const crypto = require('crypto');
const Razorpay = require('razorpay');
const db = require('../models');
const wallet_transactions = db.models.wallet_transactions;
const { creditWallet } = require('./wallet.service');

let razorpayInstance;

function getRazorpay() {
    if (!razorpayInstance) {
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            throw new Error('Razorpay credentials are not configured');
        }
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return razorpayInstance;
}

async function createTopupOrder(user, amountInRupees) {
    const amount = Number(amountInRupees);
    if (!amount || amount < 100) {
        throw new Error('Minimum top-up amount is ₹100');
    }

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: `wallet_topup_${user.id}_${Date.now()}`,
        notes: {
            user_id: String(user.id),
            purpose: 'wallet_topup',
        },
    });

    return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        prefill: {
            name: user.name,
            email: user.email,
        },
    };
}

async function verifyTopupPayment(userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

    if (expectedSignature !== razorpay_signature) {
        throw new Error('Invalid payment signature');
    }

    const existing = await wallet_transactions.findOne({
        where: {
            reference_type: 'razorpay_order',
            reference_id: razorpay_order_id,
            type: 'topup',
        },
    });

    if (existing) {
        throw new Error('This payment has already been processed');
    }

    const razorpay = getRazorpay();
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const amountInRupees = Number(order.amount) / 100;

    const transaction = await db.sequelize.transaction();
    try {
        const wallet = await creditWallet(
            userId,
            amountInRupees,
            'topup',
            'razorpay_order',
            razorpay_order_id,
            `Wallet top-up via Razorpay`,
            { razorpay_payment_id, razorpay_order_id },
            transaction,
        );

        await transaction.commit();

        return {
            balance: Number(wallet.balance),
            amount: amountInRupees,
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

module.exports = {
    createTopupOrder,
    verifyTopupPayment,
};
