const db = require('../models');
const wallets = db.models.wallets;
const wallet_transactions = db.models.wallet_transactions;
const payout_schedules = db.models.payout_schedules;

const PAYOUT_HOLD_HOURS = 48;

function toNumber(value) {
    return Number(value || 0);
}

async function getOrCreateWallet(userId, transaction) {
    const [wallet] = await wallets.findOrCreate({
        where: { user_id: userId },
        defaults: { balance: 0, locked_balance: 0 },
        transaction,
    });
    return wallet;
}

async function recordTransaction(wallet, type, amount, referenceType, referenceId, description, metadata, transaction) {
    await wallet.reload({ transaction });
    return wallet_transactions.create({
        wallet_id: wallet.id,
        type,
        amount,
        balance_after: wallet.balance,
        reference_type: referenceType,
        reference_id: referenceId ? String(referenceId) : null,
        description,
        metadata,
    }, { transaction });
}

async function creditWallet(userId, amount, type, referenceType, referenceId, description, metadata, transaction) {
    const wallet = await getOrCreateWallet(userId, transaction);
    await wallet.increment('balance', { by: amount, transaction });
    await wallet.reload({ transaction });
    await recordTransaction(wallet, type, amount, referenceType, referenceId, description, metadata, transaction);
    return wallet;
}

async function lockCampaignBudget(userId, campaignId, amount, transaction) {
    const wallet = await getOrCreateWallet(userId, transaction);
    const available = toNumber(wallet.balance);

    if (available < amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${available.toLocaleString()}, Required: ₹${amount.toLocaleString()}`);
    }

    await wallet.decrement('balance', { by: amount, transaction });
    await wallet.increment('locked_balance', { by: amount, transaction });
    await wallet.reload({ transaction });

    await recordTransaction(
        wallet,
        'campaign_lock',
        amount,
        'campaign',
        campaignId,
        `Budget locked for campaign #${campaignId}`,
        null,
        transaction,
    );

    return wallet;
}

async function releasePayoutToCreator(payoutSchedule, transaction) {
    const brandWallet = await getOrCreateWallet(payoutSchedule.brand_user_id, transaction);
    const amount = toNumber(payoutSchedule.amount);

    if (toNumber(brandWallet.locked_balance) < amount) {
        throw new Error('Brand escrow has insufficient locked balance for payout');
    }

    await brandWallet.decrement('locked_balance', { by: amount, transaction });
    await brandWallet.reload({ transaction });

    await recordTransaction(
        brandWallet,
        'payout_debit',
        amount,
        'payout_schedule',
        payoutSchedule.id,
        `Payout released for submission #${payoutSchedule.submission_id}`,
        null,
        transaction,
    );

    const creatorWallet = await creditWallet(
        payoutSchedule.creator_user_id,
        amount,
        'payout_credit',
        'payout_schedule',
        payoutSchedule.id,
        `Earnings from campaign submission #${payoutSchedule.submission_id}`,
        null,
        transaction,
    );

    await payoutSchedule.update({
        status: 'released',
        released_at: new Date(),
    }, { transaction });

    return { brandWallet, creatorWallet };
}

async function getWalletSummary(userId) {
    const wallet = await getOrCreateWallet(userId);
    const pendingPayout = await payout_schedules.sum('amount', {
        where: { creator_user_id: userId, status: 'scheduled' },
    }) || 0;

    const totalReleased = await payout_schedules.sum('amount', {
        where: { creator_user_id: userId, status: 'released' },
    }) || 0;

    return {
        balance: toNumber(wallet.balance),
        locked_balance: toNumber(wallet.locked_balance),
        pending_balance: toNumber(pendingPayout),
        total_earned: toNumber(wallet.balance) + toNumber(totalReleased),
    };
}

module.exports = {
    PAYOUT_HOLD_HOURS,
    toNumber,
    getOrCreateWallet,
    creditWallet,
    lockCampaignBudget,
    releasePayoutToCreator,
    getWalletSummary,
};
