const db = require('../models');
const payout_schedules = db.models.payout_schedules;
const campaigns = db.models.campaigns;
const { PAYOUT_HOLD_HOURS, toNumber, releasePayoutToCreator } = require('./wallet.service');

async function schedulePayout({ submission, campaign, brandUserId, amount, transaction }) {
    const approvedAt = new Date();
    const releaseAt = new Date(approvedAt.getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000);

    const remainingBudget = toNumber(campaign.total_budget) - toNumber(campaign.spent_budget);
    if (remainingBudget < amount) {
        throw new Error('Campaign budget exceeded. Cannot schedule payout.');
    }

    const schedule = await payout_schedules.create({
        submission_id: submission.id,
        campaign_id: campaign.id,
        brand_user_id: brandUserId,
        creator_user_id: submission.user_id,
        amount,
        status: 'scheduled',
        approved_at: approvedAt,
        release_at: releaseAt,
    }, { transaction });

    await campaigns.increment('spent_budget', { by: amount, where: { id: campaign.id }, transaction });

    return schedule;
}

async function releaseDuePayouts() {
    const duePayouts = await payout_schedules.findAll({
        where: {
            status: 'scheduled',
            release_at: { [db.Sequelize.Op.lte]: new Date() },
        },
    });

    const results = { released: 0, failed: 0, errors: [] };

    for (const payout of duePayouts) {
        const transaction = await db.sequelize.transaction();
        try {
            await releasePayoutToCreator(payout, transaction);
            await transaction.commit();
            results.released += 1;
        } catch (error) {
            await transaction.rollback();
            await payout.update({ status: 'failed' });
            results.failed += 1;
            results.errors.push({ payoutId: payout.id, message: error.message });
        }
    }

    return results;
}

module.exports = {
    schedulePayout,
    releaseDuePayouts,
};
