const db = require('../models');
const { Op } = require('sequelize');
const campaigns = db.models.campaigns;
const campaign_assets = db.models.campaign_assets;
const campaign_captions = db.models.campaign_captions;
const campaign_submissions = db.models.campaign_submissions;
const { lockCampaignBudget, toNumber } = require('../services/wallet.service');
const { calculateCampaignLiability } = require('../utils/campaignBudget');

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

exports.createCampaign = async (request, reply) => {
    const transaction = await db.sequelize.transaction();
    try {
        const {
            title,
            description,
            campaign_type,
            reward_points,
            start_date,
            end_date,
            spotify_link,
            genre,
            required_tags,
            hashtags,
            brand_name,
            brand_logo_url,
            track_artwork_url,
            bonus_target_views,
            bonus_reward,
            bonus_max_creators,
            audience_gender,
            audience_age,
            specific_creators,
            rank_allocations,
            total_budget,
            expected_reels,
            assets,
            captions,
        } = request.body;

        const liability = calculateCampaignLiability(rank_allocations, bonus_reward, bonus_max_creators);
        const budget = toNumber(total_budget);

        if (budget <= 0) {
            await transaction.rollback();
            return reply.status(400).send({ success: false, message: 'Campaign budget must be greater than zero' });
        }

        if (budget < liability) {
            await transaction.rollback();
            return reply.status(400).send({
                success: false,
                message: `Campaign budget (₹${budget}) is less than total liability (₹${liability}). Increase budget or reduce allocations.`,
            });
        }

        const campaign = await campaigns.create({
            title,
            description,
            campaign_type: campaign_type || 'reel',
            reward_points: reward_points || 0,
            start_date: start_date || new Date(),
            end_date: end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            spotify_link,
            genre,
            required_tags,
            hashtags,
            brand_name,
            brand_logo_url,
            track_artwork_url,
            bonus_target_views,
            bonus_reward,
            bonus_max_creators,
            audience_gender,
            audience_age,
            specific_creators,
            rank_allocations,
            total_budget: budget,
            spent_budget: 0,
            expected_reels,
            created_by: request.user.id,
            status: 'active',
        }, { transaction });

        await lockCampaignBudget(request.user.id, campaign.id, budget, transaction);

        if (assets && assets.length > 0) {
            const assetData = assets.map((asset) => ({ ...asset, campaign_id: campaign.id }));
            await campaign_assets.bulkCreate(assetData, { transaction });
        }

        if (captions && captions.length > 0) {
            const captionData = captions.map((caption) => ({ ...caption, campaign_id: campaign.id }));
            await campaign_captions.bulkCreate(captionData, { transaction });
        }

        await transaction.commit();

        const fullCampaign = await campaigns.findByPk(campaign.id, {
            include: ['assets', 'captions'],
        });

        reply.status(201).send({
            success: true,
            message: 'Campaign created and budget locked from wallet',
            data: fullCampaign,
        });
    } catch (error) {
        await transaction.rollback();
        reply.status(error.statusCode || 400).send({ success: false, message: error.message });
    }
};

exports.getAllCampaigns = async (request, reply) => {
    try {
        const {
            page,
            limit = '10',
            status,
            sort = 'createdAt',
            order = 'desc',
            date_from,
            date_to,
            date_field = 'end_date',
        } = request.query;

        const isBrand = request.user.role === 'brand';
        const isPaginated = page !== undefined && page !== null && page !== '';

        const where = {};

        if (isBrand) {
            where.created_by = request.user.id;
            if (status && status !== 'all') {
                where.status = status;
            }
        } else {
            where.status = 'active';
        }

        if (date_from || date_to) {
            const filterField = date_field === 'start_date' ? 'start_date'
                : date_field === 'createdAt' ? 'createdAt'
                : 'end_date';
            where[filterField] = {};
            if (date_from) {
                where[filterField][Op.gte] = new Date(date_from);
            }
            if (date_to) {
                const end = new Date(date_to);
                end.setHours(23, 59, 59, 999);
                where[filterField][Op.lte] = end;
            }
        }

        const sortFieldMap = {
            createdAt: 'createdAt',
            end_date: 'end_date',
            start_date: 'start_date',
            total_budget: 'total_budget',
            title: 'title',
        };
        const sortField = sortFieldMap[sort] || 'createdAt';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const queryOptions = {
            where,
            include: ['assets', 'captions'],
            order: [[sortField, sortOrder]],
        };

        if (isPaginated) {
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
            queryOptions.limit = limitNum;
            queryOptions.offset = (pageNum - 1) * limitNum;

            const { count, rows } = await campaigns.findAndCountAll(queryOptions);
            const data = await attachSubmissionStats(rows);

            let meta = {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum) || 1,
            };

            if (isBrand) {
                const statusCounts = await campaigns.findAll({
                    where: { created_by: request.user.id },
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
                meta.counts = counts;
            }

            return reply.send({ success: true, data, meta });
        }

        const campaignList = await campaigns.findAll(queryOptions);
        const data = isBrand ? await attachSubmissionStats(campaignList) : campaignList;

        reply.send({
            success: true,
            data,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getCampaignById = async (request, reply) => {
    try {
        const campaign = await campaigns.findByPk(request.params.id, {
            include: ['assets', 'captions'],
        });

        if (!campaign) {
            return reply.status(404).send({ success: false, message: 'Campaign not found' });
        }

        reply.send({
            success: true,
            data: campaign,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};
