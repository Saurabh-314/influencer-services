const db = require('../models');
const { Op } = require('sequelize');
const users = db.models.users;
const social_accounts = db.models.social_accounts;
const creator_ranks = db.models.creator_ranks;
const creator_points = db.models.creator_points;
const wallets = db.models.wallets;
const wallet_transactions = db.models.wallet_transactions;
const campaigns = db.models.campaigns;
const campaign_submissions = db.models.campaign_submissions;
const { sequelize } = db;
const { getWalletSummary } = require('../services/wallet.service');
const { syncAccountInsights } = require('../services/instagramInsights.service');

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

async function getSubmissionStatusCounts(userId) {
    const statusCounts = await campaign_submissions.findAll({
        where: { user_id: userId },
        attributes: [
            'status',
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        ],
        group: ['status'],
        raw: true,
    });

    const counts = { applied: 0, pending: 0, approved: 0, rejected: 0, all: 0 };
    for (const row of statusCounts) {
        const n = parseInt(row.count, 10) || 0;
        if (counts[row.status] !== undefined) counts[row.status] = n;
        counts.all += n;
    }
    return counts;
}

async function getCampaignStatusCounts(userId) {
    const statusCounts = await campaigns.findAll({
        where: { created_by: userId },
        attributes: [
            'status',
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        ],
        group: ['status'],
        raw: true,
    });

    const counts = { active: 0, draft: 0, completed: 0, paused: 0, all: 0 };
    for (const row of statusCounts) {
        const n = parseInt(row.count, 10) || 0;
        if (counts[row.status] !== undefined) counts[row.status] = n;
        counts.all += n;
    }
    return counts;
}

function parsePagination(query) {
    const pageNum = Math.max(1, parseInt(query.page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    return { pageNum, limitNum, offset: (pageNum - 1) * limitNum };
}

function buildSearchWhere(search) {
    if (!search || !search.trim()) return {};
    const term = `%${search.trim()}%`;
    return {
        [Op.or]: [
            { name: { [Op.like]: term } },
            { email: { [Op.like]: term } },
        ],
    };
}

exports.getCreators = async (request, reply) => {
    try {
        const { search, status, connected, sort = 'createdAt', order = 'desc' } = request.query;
        const { pageNum, limitNum, offset } = parsePagination(request.query);

        const where = {
            role: 'creator',
            ...buildSearchWhere(search),
        };

        if (status === 'active' || status === 'inactive') {
            where.status = status;
        }

        if (connected === 'not_connected') {
            where.id = {
                [Op.notIn]: sequelize.literal(`(
                    SELECT DISTINCT user_id
                    FROM social_accounts
                    WHERE platform = 'instagram'
                    AND is_connected = 1
                    AND deleted_at IS NULL
                )`),
            };
        }

        const sortFieldMap = {
            createdAt: 'createdAt',
            name: 'name',
            followers: sequelize.literal('instagram_followers'),
            points: sequelize.literal('total_points'),
        };
        const sortField = sortFieldMap[sort] || 'createdAt';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const include = [
            {
                model: social_accounts,
                as: 'social_accounts',
                    attributes: [
                        'id', 'platform', 'username', 'display_name', 'profile_image',
                        'followers_count', 'engagement_rate', 'is_connected', 'last_synced_at',
                        'account_type', 'score_status',
                    ],
                required: connected === 'connected',
                where: connected === 'connected'
                    ? { platform: 'instagram', is_connected: true }
                    : undefined,
            },
            {
                model: creator_ranks,
                as: 'rank',
                attributes: ['level', 'rank_score', 'rank_name'],
                required: false,
            },
            {
                model: wallets,
                as: 'wallet',
                attributes: ['balance', 'locked_balance'],
                required: false,
            },
        ];

        const queryOptions = {
            where,
            attributes: [
                'id', 'name', 'email', 'profile_image', 'status', 'createdAt',
                [
                    sequelize.literal(`(
                        SELECT COALESCE(SUM(points), 0)
                        FROM creator_points
                        WHERE creator_points.user_id = users.id
                    )`),
                    'total_points',
                ],
                [
                    sequelize.literal(`(
                        SELECT COUNT(*)
                        FROM campaign_submissions
                        WHERE campaign_submissions.user_id = users.id
                    )`),
                    'submissions_total',
                ],
                [
                    sequelize.literal(`(
                        SELECT COUNT(*)
                        FROM campaign_submissions
                        WHERE campaign_submissions.user_id = users.id
                        AND campaign_submissions.status = 'approved'
                    )`),
                    'submissions_approved',
                ],
                [
                    sequelize.literal(`(
                        SELECT COALESCE(MAX(followers_count), 0)
                        FROM social_accounts
                        WHERE social_accounts.user_id = users.id
                        AND social_accounts.platform = 'instagram'
                        AND social_accounts.is_connected = 1
                        AND social_accounts.deleted_at IS NULL
                    )`),
                    'instagram_followers',
                ],
            ],
            include,
            order: [[sortField, sortOrder]],
            limit: limitNum,
            offset,
            distinct: true,
        };

        const { count, rows } = await users.findAndCountAll(queryOptions);

        const data = rows.map((row) => {
            const plain = row.toJSON();
            const instagram = plain.social_accounts?.find(
                (a) => a.platform === 'instagram' && a.is_connected,
            );
            return {
                ...plain,
                total_points: parseInt(plain.total_points, 10) || 0,
                submissions_total: parseInt(plain.submissions_total, 10) || 0,
                submissions_approved: parseInt(plain.submissions_approved, 10) || 0,
                instagram_followers: parseInt(plain.instagram_followers, 10) || 0,
                instagram,
                social_accounts: undefined,
            };
        });

        const [totalCreators, connectedCount, activeCount] = await Promise.all([
            users.count({ where: { role: 'creator' } }),
            users.count({
                where: { role: 'creator' },
                include: [{
                    model: social_accounts,
                    as: 'social_accounts',
                    where: { platform: 'instagram', is_connected: true },
                    required: true,
                }],
                distinct: true,
            }),
            users.count({ where: { role: 'creator', status: 'active' } }),
        ]);

        reply.send({
            success: true,
            data,
            meta: {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum) || 1,
                summary: {
                    total: totalCreators,
                    connected: connectedCount,
                    active: activeCount,
                    inactive: totalCreators - activeCount,
                },
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getBrands = async (request, reply) => {
    try {
        const { search, status, sort = 'createdAt', order = 'desc' } = request.query;
        const { pageNum, limitNum, offset } = parsePagination(request.query);

        const where = {
            role: 'brand',
            ...buildSearchWhere(search),
        };

        if (status === 'active' || status === 'inactive') {
            where.status = status;
        }

        const sortFieldMap = {
            createdAt: 'createdAt',
            name: 'name',
            balance: sequelize.literal('wallet_balance'),
            spent: sequelize.literal('total_spent'),
            campaigns: sequelize.literal('campaigns_total'),
        };
        const sortField = sortFieldMap[sort] || 'createdAt';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const { count, rows } = await users.findAndCountAll({
            where,
            attributes: [
                'id', 'name', 'email', 'profile_image', 'status', 'createdAt',
                [
                    sequelize.literal(`(
                        SELECT COUNT(*)
                        FROM campaigns
                        WHERE campaigns.created_by = users.id
                    )`),
                    'campaigns_total',
                ],
                [
                    sequelize.literal(`(
                        SELECT COUNT(*)
                        FROM campaigns
                        WHERE campaigns.created_by = users.id
                        AND campaigns.status = 'active'
                    )`),
                    'campaigns_active',
                ],
                [
                    sequelize.literal(`(
                        SELECT COALESCE(SUM(spent_budget), 0)
                        FROM campaigns
                        WHERE campaigns.created_by = users.id
                    )`),
                    'total_spent',
                ],
                [
                    sequelize.literal(`(
                        SELECT COALESCE(w.balance, 0)
                        FROM wallets w
                        WHERE w.user_id = users.id
                        LIMIT 1
                    )`),
                    'wallet_balance',
                ],
                [
                    sequelize.literal(`(
                        SELECT COALESCE(w.locked_balance, 0)
                        FROM wallets w
                        WHERE w.user_id = users.id
                        LIMIT 1
                    )`),
                    'wallet_locked',
                ],
            ],
            include: [{
                model: wallets,
                as: 'wallet',
                attributes: ['balance', 'locked_balance'],
                required: false,
            }],
            order: [[sortField, sortOrder]],
            limit: limitNum,
            offset,
            distinct: true,
        });

        const data = rows.map((row) => {
            const plain = row.toJSON();
            return {
                ...plain,
                campaigns_total: parseInt(plain.campaigns_total, 10) || 0,
                campaigns_active: parseInt(plain.campaigns_active, 10) || 0,
                total_spent: Number(plain.total_spent) || 0,
                wallet_balance: Number(plain.wallet_balance) || 0,
                wallet_locked: Number(plain.wallet_locked) || 0,
            };
        });

        const [totalBrands, activeCount, platformSpent, activeCampaigns] = await Promise.all([
            users.count({ where: { role: 'brand' } }),
            users.count({ where: { role: 'brand', status: 'active' } }),
            campaigns.sum('spent_budget') || 0,
            campaigns.count({ where: { status: 'active' } }),
        ]);

        reply.send({
            success: true,
            data,
            meta: {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum) || 1,
                summary: {
                    total: totalBrands,
                    active: activeCount,
                    inactive: totalBrands - activeCount,
                    total_spent: Number(platformSpent) || 0,
                    active_campaigns: activeCampaigns,
                },
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getCreatorById = async (request, reply) => {
    try {
        const userId = parseInt(request.params.id, 10);
        if (!userId) {
            return reply.status(400).send({ success: false, message: 'Invalid creator id' });
        }

        const user = await users.findOne({
            where: { id: userId, role: 'creator' },
            attributes: ['id', 'name', 'email', 'profile_image', 'status', 'createdAt', 'updatedAt'],
            include: [
                {
                    model: social_accounts,
                    as: 'social_accounts',
                    attributes: [
                        'id', 'platform', 'username', 'display_name', 'profile_image',
                        'followers_count', 'following_count', 'engagement_rate', 'total_posts',
                        'total_views', 'is_connected', 'last_synced_at', 'status',
                        'biography', 'account_type', 'score_status', 'connected_at',
                    ],
                },
                {
                    model: creator_ranks,
                    as: 'rank',
                    attributes: ['level', 'rank_score', 'rank_name'],
                    required: false,
                },
            ],
        });

        if (!user) {
            return reply.status(404).send({ success: false, message: 'Creator not found' });
        }

        const plain = user.toJSON();
        const instagram = plain.social_accounts?.find(
            (a) => a.platform === 'instagram' && a.is_connected,
        );

        const [walletSummary, submissionCounts, totalPoints, recentSubmissions, recentPoints] = await Promise.all([
            getWalletSummary(userId),
            getSubmissionStatusCounts(userId),
            creator_points.sum('points', { where: { user_id: userId } }) || 0,
            campaign_submissions.findAll({
                where: { user_id: userId },
                include: [{
                    model: campaigns,
                    as: 'campaign',
                    attributes: ['id', 'title', 'brand_name', 'campaign_type', 'track_artwork_url', 'status', 'end_date'],
                }, {
                    model: social_accounts,
                    as: 'social_account',
                    attributes: ['id', 'username', 'followers_count'],
                }],
                order: [['createdAt', 'DESC']],
                limit: 20,
            }),
            creator_points.findAll({
                where: { user_id: userId },
                include: [{
                    model: campaigns,
                    as: 'campaign',
                    attributes: ['id', 'title', 'brand_name'],
                }],
                order: [['createdAt', 'DESC']],
                limit: 10,
            }),
        ]);

        reply.send({
            success: true,
            data: {
                user: {
                    id: plain.id,
                    name: plain.name,
                    email: plain.email,
                    profile_image: plain.profile_image,
                    status: plain.status,
                    createdAt: plain.createdAt,
                    updatedAt: plain.updatedAt,
                },
                rank: plain.rank || null,
                instagram,
                social_accounts: plain.social_accounts || [],
                wallet: walletSummary,
                stats: {
                    total_points: parseInt(totalPoints, 10) || 0,
                    submissions: submissionCounts,
                },
                recent_submissions: recentSubmissions,
                recent_points: recentPoints,
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getBrandById = async (request, reply) => {
    try {
        const userId = parseInt(request.params.id, 10);
        if (!userId) {
            return reply.status(400).send({ success: false, message: 'Invalid brand id' });
        }

        const user = await users.findOne({
            where: { id: userId, role: 'brand' },
            attributes: ['id', 'name', 'email', 'profile_image', 'status', 'createdAt', 'updatedAt'],
            include: [{
                model: wallets,
                as: 'wallet',
                attributes: ['balance', 'locked_balance'],
                required: false,
            }],
        });

        if (!user) {
            return reply.status(404).send({ success: false, message: 'Brand not found' });
        }

        const plain = user.toJSON();
        const brandCampaigns = await campaigns.findAll({
            where: { created_by: userId },
            attributes: ['id'],
        });
        const campaignIds = brandCampaigns.map((c) => c.id);

        const [campaignCounts, totalSpent, recentCampaignRows, walletRecord] = await Promise.all([
            getCampaignStatusCounts(userId),
            campaigns.sum('spent_budget', { where: { created_by: userId } }) || 0,
            campaigns.findAll({
                where: { created_by: userId },
                attributes: [
                    'id', 'title', 'brand_name', 'campaign_type', 'status',
                    'total_budget', 'spent_budget', 'start_date', 'end_date', 'track_artwork_url',
                ],
                order: [['createdAt', 'DESC']],
                limit: 10,
            }),
            wallets.findOne({ where: { user_id: userId } }),
        ]);

        let recentTransactions = [];
        let pendingSubmissionsCount = 0;
        let recentPending = [];

        if (walletRecord) {
            recentTransactions = await wallet_transactions.findAll({
                where: { wallet_id: walletRecord.id },
                order: [['createdAt', 'DESC']],
                limit: 15,
            });
        }

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
                    model: users,
                    as: 'user',
                    attributes: ['id', 'name', 'email'],
                }, {
                    model: social_accounts,
                    as: 'social_account',
                    attributes: ['id', 'username', 'followers_count'],
                }],
                order: [['submitted_at', 'DESC']],
                limit: 8,
            });
        }

        const recentCampaigns = await attachSubmissionStats(recentCampaignRows);

        reply.send({
            success: true,
            data: {
                user: {
                    id: plain.id,
                    name: plain.name,
                    email: plain.email,
                    profile_image: plain.profile_image,
                    status: plain.status,
                    createdAt: plain.createdAt,
                    updatedAt: plain.updatedAt,
                },
                wallet: {
                    balance: Number(plain.wallet?.balance ?? walletRecord?.balance ?? 0),
                    locked_balance: Number(plain.wallet?.locked_balance ?? walletRecord?.locked_balance ?? 0),
                },
                campaignCounts,
                total_spent: Number(totalSpent) || 0,
                pending_submissions_count: pendingSubmissionsCount,
                recent_campaigns: recentCampaigns,
                recent_transactions: recentTransactions,
                recent_pending: recentPending,
            },
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getCreatorInsights = async (request, reply) => {
    try {
        const userId = parseInt(request.params.id, 10);
        if (!userId) {
            return reply.status(400).send({ success: false, message: 'Invalid creator id' });
        }

        const user = await users.findOne({
            where: { id: userId, role: 'creator' },
            attributes: ['id', 'name', 'email', 'profile_image'],
        });

        if (!user) {
            return reply.status(404).send({ success: false, message: 'Creator not found' });
        }

        const account = await social_accounts.findOne({
            where: {
                user_id: userId,
                platform: 'instagram',
                is_connected: true,
            },
        });

        if (!account) {
            return reply.status(404).send({
                success: false,
                message: 'Creator has no connected Instagram account',
            });
        }

        const insights = await syncAccountInsights(account, {
            force: request.query?.force === '1' || request.query?.force === 'true',
        });

        reply.send({
            success: true,
            data: {
                creator: user,
                account: {
                    id: account.id,
                    username: account.username,
                    last_synced_at: account.last_synced_at,
                },
                ...insights,
            },
        });
    } catch (error) {
        const meta = error.response?.data?.error || error.response?.data || {};
        console.error('Admin Creator Insights Error:', error.response?.data || error.message);
        reply.status(500).send({
            success: false,
            message: error.message,
            diagnostics: {
                hint: 'The Insights request threw before a score could be built. Use this Meta error to debug in live mode.',
                instagram_errors: [{
                    stage: 'admin_insights_request',
                    message: meta.message || error.message,
                    type: meta.type || error.name || null,
                    code: meta.code || error.code || null,
                    fbtrace_id: meta.fbtrace_id || null,
                }],
            },
        });
    }
};
