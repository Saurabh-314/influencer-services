const db = require('../models');
const campaign_submissions = db.models.campaign_submissions;
const creator_points = db.models.creator_points;
const campaigns = db.models.campaigns;
const social_accounts = db.models.social_accounts;
const { getVusicRank, getPayoutForRank } = require('../utils/scoring');

exports.getStats = async (request, reply) => {
    try {
        const totalPoints = await creator_points.sum('points', { where: { user_id: request.user.id } }) || 0;
        const completedCampaigns = await campaign_submissions.count({
            where: { user_id: request.user.id, status: 'approved' },
        });

        const growthData = [
            { name: 'Jan', points: 400 },
            { name: 'Feb', points: 300 },
            { name: 'Mar', points: 600 },
            { name: 'Apr', points: 800 },
            { name: 'May', points: 500 },
            { name: 'Jun', points: 900 },
        ];

        reply.send({
            success: true,
            data: {
                totalPoints,
                completedCampaigns,
                growthData,
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getEarnings = async (request, reply) => {
    try {
        const instagram = await social_accounts.findOne({
            where: { user_id: request.user.id, platform: 'instagram', is_connected: true },
        });

        const followers = instagram?.followers_count ?? 0;
        const userRank = getVusicRank(followers);

        const submissions = await campaign_submissions.findAll({
            where: { user_id: request.user.id },
            include: [{
                model: campaigns,
                as: 'campaign',
                attributes: ['id', 'title', 'rank_allocations'],
            }],
        });

        let totalEarned = 0;
        let balance = 0;

        for (const submission of submissions) {
            const payout = getPayoutForRank(submission.campaign, userRank);
            if (submission.status === 'approved') {
                totalEarned += payout;
                balance += payout;
            } else if (submission.status === 'pending') {
                totalEarned += payout;
            }
        }

        reply.send({
            success: true,
            data: {
                totalEarned,
                balance,
                userRank,
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};
