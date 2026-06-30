const db = require('../models');
const { Op } = require('sequelize');
const campaign_submissions = db.models.campaign_submissions;
const campaigns = db.models.campaigns;
const creator_points = db.models.creator_points;
const { getWalletSummary } = require('../services/wallet.service');

async function attachSubmissionStats(campaignRows) {
    if (!campaignRows.length) return campaignRows;

    const ids = campaignRows.map((c) => c.id);
    const stats = await campaign_submissions.findAll({
        where: {
            campaign_id: { [Op.in]: ids },
            submitted_at: { [Op.ne]: null },
            status: { [Op.in]: ['pending', 'approved', 'rejected'] },
        },
        attributes: [
            'campaign_id',
            'status',
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        ],
        group: ['campaign_id', 'status'],
        raw: true,
    });

    const statsMap = {};
    for (const row of stats) {
        if (!statsMap[row.campaign_id]) {
            statsMap[row.campaign_id] = { total: 0, pending: 0, approved: 0, rejected: 0 };
        }
        const n = parseInt(row.count, 10) || 0;
        statsMap[row.campaign_id][row.status] = n;
        statsMap[row.campaign_id].total += n;
    }

    return campaignRows.map((campaign) => {
        const plain = campaign.toJSON ? campaign.toJSON() : campaign;
        return {
            ...plain,
            submission_stats: statsMap[campaign.id] || { total: 0, pending: 0, approved: 0, rejected: 0 },
        };
    });
}

exports.getBrandOverview = async (request, reply) => {
    try {
        const userId = request.user.id;

        const wallet = await getWalletSummary(userId);

        const statusCounts = await campaigns.findAll({
            where: { created_by: userId },
            attributes: [
                'status',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
            ],
            group: ['status'],
            raw: true,
        });

        const campaignCounts = { active: 0, draft: 0, completed: 0, paused: 0, all: 0 };
        for (const row of statusCounts) {
            const n = parseInt(row.count, 10) || 0;
            if (campaignCounts[row.status] !== undefined) campaignCounts[row.status] = n;
            campaignCounts.all += n;
        }

        const brandCampaigns = await campaigns.findAll({
            where: { created_by: userId },
            attributes: ['id'],
        });
        const campaignIds = brandCampaigns.map((c) => c.id);

        let pendingSubmissionsCount = 0;
        let recentPending = [];

        if (campaignIds.length) {
            pendingSubmissionsCount = await campaign_submissions.count({
                where: {
                    campaign_id: { [Op.in]: campaignIds },
                    status: 'pending',
                    submitted_at: { [Op.ne]: null },
                },
            });

            recentPending = await campaign_submissions.findAll({
                where: {
                    campaign_id: { [Op.in]: campaignIds },
                    status: 'pending',
                    submitted_at: { [Op.ne]: null },
                },
                include: [{
                    model: campaigns,
                    as: 'campaign',
                    attributes: ['id', 'title', 'track_artwork_url', 'brand_name'],
                }, {
                    model: db.models.users,
                    as: 'user',
                    attributes: ['id', 'name', 'email'],
                }, {
                    model: db.models.social_accounts,
                    as: 'social_account',
                    attributes: ['id', 'username', 'followers_count'],
                }],
                order: [['submitted_at', 'DESC']],
                limit: 8,
            });
        }

        const totalSpent = await campaigns.sum('spent_budget', { where: { created_by: userId } }) || 0;

        const endingSoonRows = await campaigns.findAll({
            where: { created_by: userId, status: 'active' },
            attributes: ['id', 'title', 'end_date', 'total_budget', 'track_artwork_url', 'brand_name', 'campaign_type', 'status'],
            order: [['end_date', 'ASC']],
            limit: 5,
        });
        const activeCampaigns = await attachSubmissionStats(endingSoonRows);

        reply.send({
            success: true,
            data: {
                wallet: {
                    balance: wallet.balance,
                    locked_balance: wallet.locked_balance,
                },
                campaignCounts,
                pendingSubmissionsCount,
                totalSpent: Number(totalSpent),
                recentPending,
                activeCampaigns,
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

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
        const { getWalletSummary } = require('../services/wallet.service');
        const summary = await getWalletSummary(request.user.id);

        reply.send({
            success: true,
            data: {
                totalEarned: summary.total_earned,
                balance: summary.balance,
                pendingBalance: summary.pending_balance,
                lockedBalance: summary.locked_balance,
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};
