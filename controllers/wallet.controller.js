const db = require('../models');
const wallet_transactions = db.models.wallet_transactions;
const { getWalletSummary } = require('../services/wallet.service');
const { createTopupOrder, verifyTopupPayment } = require('../services/razorpay.service');

exports.getWallet = async (request, reply) => {
    try {
        const summary = await getWalletSummary(request.user.id);
        reply.send({ success: true, data: summary });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getTransactions = async (request, reply) => {
    try {
        const { getOrCreateWallet } = require('../services/wallet.service');
        const wallet = await getOrCreateWallet(request.user.id);

        const transactions = await wallet_transactions.findAll({
            where: { wallet_id: wallet.id },
            order: [['createdAt', 'DESC']],
            limit: 50,
        });

        reply.send({ success: true, data: transactions });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.createTopupOrder = async (request, reply) => {
    try {
        const { amount } = request.body;
        const order = await createTopupOrder(request.user, amount);
        reply.send({ success: true, data: order });
    } catch (error) {
        reply.status(400).send({ success: false, message: error.message });
    }
};

exports.verifyTopup = async (request, reply) => {
    try {
        const result = await verifyTopupPayment(request.user.id, request.body);
        reply.send({
            success: true,
            message: 'Wallet topped up successfully',
            data: result,
        });
    } catch (error) {
        reply.status(400).send({ success: false, message: error.message });
    }
};
