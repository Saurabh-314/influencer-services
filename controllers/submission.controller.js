const db = require('../models');
const { Op } = require('sequelize');
const campaign_submissions = db.models.campaign_submissions;
const campaigns = db.models.campaigns;
const social_accounts = db.models.social_accounts;
const users = db.models.users;
const { getVusicRank, getPayoutForRank } = require('../utils/scoring');
const { schedulePayout } = require('../services/payout.service');

async function assertCampaignOwner(campaign, user) {
    if (user.role === 'admin') return;
    if (campaign.created_by !== user.id) {
        const error = new Error('You are not authorized to manage this campaign');
        error.statusCode = 403;
        throw error;
    }
}

exports.getMySubmissions = async (request, reply) => {
    try {
        const {
            page,
            limit = '10',
            status,
            sort = 'createdAt',
            order = 'desc',
            date_from,
            date_to,
            date_field = 'submitted_at',
        } = request.query;

        const isPaginated = page !== undefined && page !== null && page !== '';

        const where = { user_id: request.user.id };

        if (status && status !== 'all') {
            where.status = status;
        }

        if (date_from || date_to) {
            const filterField = date_field === 'applied_at' ? 'applied_at'
                : date_field === 'approved_at' ? 'approved_at'
                : date_field === 'createdAt' ? 'createdAt'
                : 'submitted_at';
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
            applied_at: 'applied_at',
            submitted_at: 'submitted_at',
            approved_at: 'approved_at',
        };
        const sortField = sortFieldMap[sort] || 'createdAt';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const include = [{
            model: campaigns,
            as: 'campaign',
            attributes: ['id', 'title', 'brand_name', 'genre', 'campaign_type', 'rank_allocations', 'reward_points', 'spotify_link', 'track_artwork_url', 'hashtags', 'description', 'end_date'],
        }, {
            model: db.models.payout_schedules,
            as: 'payout_schedule',
        }];

        if (isPaginated) {
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

            const { count, rows } = await campaign_submissions.findAndCountAll({
                where,
                include,
                order: [[sortField, sortOrder]],
                limit: limitNum,
                offset: (pageNum - 1) * limitNum,
            });

            const statusCounts = await campaign_submissions.findAll({
                where: { user_id: request.user.id },
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

            return reply.send({
                success: true,
                data: rows,
                meta: {
                    total: count,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(count / limitNum) || 1,
                    counts,
                },
            });
        }

        const submissions = await campaign_submissions.findAll({
            where,
            include,
            order: [[sortField, sortOrder]],
        });

        reply.send({
            success: true,
            data: submissions,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getCampaignSubmissions = async (request, reply) => {
    try {
        const campaign = await campaigns.findByPk(request.params.campaignId);
        if (!campaign) {
            return reply.status(404).send({ success: false, message: 'Campaign not found' });
        }

        await assertCampaignOwner(campaign, request.user);

        const {
            page = '1',
            limit = '10',
            status,
            sort = 'submitted_at',
            order = 'desc',
            date_from,
            date_to,
        } = request.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
        const offset = (pageNum - 1) * limitNum;

        const baseWhere = {
            campaign_id: campaign.id,
            status: { [Op.in]: ['pending', 'approved', 'rejected'] },
            submitted_at: { [Op.ne]: null },
        };

        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            baseWhere.status = status;
        }

        if (date_from || date_to) {
            baseWhere.submitted_at = { ...baseWhere.submitted_at };
            if (date_from) {
                baseWhere.submitted_at[Op.gte] = new Date(date_from);
            }
            if (date_to) {
                const end = new Date(date_to);
                end.setHours(23, 59, 59, 999);
                baseWhere.submitted_at[Op.lte] = end;
            }
        }

        const sortField = sort === 'approved_at' ? 'approved_at' : 'submitted_at';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

        const { count, rows: submissions } = await campaign_submissions.findAndCountAll({
            where: baseWhere,
            include: [{
                model: users,
                as: 'user',
                attributes: ['id', 'name', 'email'],
            }, {
                model: social_accounts,
                as: 'social_account',
                attributes: ['id', 'username', 'display_name', 'followers_count', 'platform'],
            }, {
                model: db.models.payout_schedules,
                as: 'payout_schedule',
            }],
            order: [[sortField, sortOrder]],
            limit: limitNum,
            offset,
        });

        const statusCounts = await campaign_submissions.findAll({
            where: {
                campaign_id: campaign.id,
                status: { [Op.in]: ['pending', 'approved', 'rejected'] },
                submitted_at: { [Op.ne]: null },
            },
            attributes: [
                'status',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
            ],
            group: ['status'],
            raw: true,
        });

        const counts = { pending: 0, approved: 0, rejected: 0, all: 0 };
        for (const row of statusCounts) {
            const n = parseInt(row.count, 10) || 0;
            counts[row.status] = n;
            counts.all += n;
        }

        reply.send({
            success: true,
            data: submissions,
            meta: {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum) || 1,
                counts,
            },
        });
    } catch (error) {
        reply.status(error.statusCode || 500).send({ success: false, message: error.message });
    }
};

exports.applyCampaign = async (request, reply) => {
    try {
        const { campaign_id, social_account_id } = request.body;

        const campaign = await campaigns.findByPk(campaign_id);
        if (!campaign || campaign.status !== 'active') {
            return reply.status(400).send({ success: false, message: 'Campaign is not available for applications' });
        }

        const socialAccount = await social_accounts.findOne({
            where: { id: social_account_id, user_id: request.user.id },
        });
        if (!socialAccount) {
            return reply.status(400).send({ success: false, message: 'Social account not found' });
        }

        const existingSubmission = await campaign_submissions.findOne({
            where: { campaign_id, user_id: request.user.id, social_account_id },
        });

        if (existingSubmission) {
            return reply.status(400).send({ success: false, message: 'You have already applied to this campaign' });
        }

        const now = new Date();
        const submission = await campaign_submissions.create({
            campaign_id,
            user_id: request.user.id,
            social_account_id,
            status: 'applied',
            applied_at: now,
        });

        reply.status(201).send({
            success: true,
            message: 'Application successful. Create your reel and submit the post link when ready.',
            data: submission,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.submitCampaignUrl = async (request, reply) => {
    try {
        const { id } = request.params;
        const { submission_url, proof_image } = request.body;

        if (!submission_url) {
            return reply.status(400).send({ success: false, message: 'Submission URL is required' });
        }

        const submission = await campaign_submissions.findByPk(id);
        if (!submission) {
            return reply.status(404).send({ success: false, message: 'Submission not found' });
        }

        if (submission.user_id !== request.user.id) {
            return reply.status(403).send({ success: false, message: 'You are not authorized to update this submission' });
        }

        if (submission.status !== 'applied') {
            return reply.status(400).send({ success: false, message: 'This campaign submission has already been submitted' });
        }

        const campaign = await campaigns.findByPk(submission.campaign_id);
        if (!campaign || campaign.status !== 'active') {
            return reply.status(400).send({ success: false, message: 'Campaign is not available for submissions' });
        }

        const now = new Date();
        await submission.update({
            submission_url,
            proof_image,
            submitted_at: now,
            status: 'pending',
        });

        reply.send({
            success: true,
            message: 'Submission received and pending brand verification',
            data: submission,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.submitCampaign = async (request, reply) => {
    try {
        const { campaign_id, social_account_id, submission_url, proof_image } = request.body;

        const campaign = await campaigns.findByPk(campaign_id);
        if (!campaign || campaign.status !== 'active') {
            return reply.status(400).send({ success: false, message: 'Campaign is not available for submissions' });
        }

        const existingSubmission = await campaign_submissions.findOne({
            where: { campaign_id, user_id: request.user.id, social_account_id },
        });

        if (existingSubmission) {
            if (existingSubmission.status === 'applied') {
                if (!submission_url) {
                    return reply.status(400).send({ success: false, message: 'Submission URL is required' });
                }
                const now = new Date();
                await existingSubmission.update({
                    submission_url,
                    proof_image,
                    submitted_at: now,
                    status: 'pending',
                });
                return reply.send({
                    success: true,
                    message: 'Submission received and pending brand verification',
                    data: existingSubmission,
                });
            }
            return reply.status(400).send({ success: false, message: 'You have already submitted for this campaign using this account' });
        }

        if (!submission_url) {
            return reply.status(400).send({ success: false, message: 'Submission URL is required' });
        }

        const now = new Date();
        const submission = await campaign_submissions.create({
            campaign_id,
            user_id: request.user.id,
            social_account_id,
            submission_url,
            proof_image,
            status: 'pending',
            applied_at: now,
            submitted_at: now,
        });

        reply.status(201).send({
            success: true,
            message: 'Submission received and pending brand verification',
            data: submission,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.approveSubmission = async (request, reply) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = request.params;
        const submission = await campaign_submissions.findByPk(id, {
            include: [{ model: campaigns, as: 'campaign' }],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!submission) {
            await transaction.rollback();
            return reply.status(404).send({ success: false, message: 'Submission not found' });
        }

        if (submission.status !== 'pending') {
            await transaction.rollback();
            return reply.status(400).send({ success: false, message: 'Submission already processed' });
        }

        await assertCampaignOwner(submission.campaign, request.user);

        const socialAccount = await social_accounts.findByPk(submission.social_account_id, { transaction });
        const followers = socialAccount?.followers_count ?? 0;
        const userRank = getVusicRank(followers);
        const payoutAmount = getPayoutForRank(submission.campaign, userRank);

        if (payoutAmount <= 0) {
            await transaction.rollback();
            return reply.status(400).send({ success: false, message: 'Unable to determine payout for this creator rank' });
        }

        const approvedAt = new Date();
        await submission.update({
            status: 'approved',
            approved_by: request.user.id,
            approved_at: approvedAt,
            payout_amount: payoutAmount,
        }, { transaction });

        const schedule = await schedulePayout({
            submission,
            campaign: submission.campaign,
            brandUserId: submission.campaign.created_by,
            amount: payoutAmount,
            transaction,
        });

        await transaction.commit();

        reply.send({
            success: true,
            message: `Submission approved. ₹${payoutAmount} will be transferred to the creator after 48 hours.`,
            data: {
                submission,
                payout_schedule: schedule,
            },
        });
    } catch (error) {
        await transaction.rollback();
        reply.status(error.statusCode || 500).send({ success: false, message: error.message });
    }
};

exports.rejectSubmission = async (request, reply) => {
    try {
        const { id } = request.params;
        const submission = await campaign_submissions.findByPk(id, { include: [{ model: campaigns, as: 'campaign' }] });

        if (!submission) {
            return reply.status(404).send({ success: false, message: 'Submission not found' });
        }

        if (submission.status !== 'pending') {
            return reply.status(400).send({ success: false, message: 'Submission already processed' });
        }

        await assertCampaignOwner(submission.campaign, request.user);

        await submission.update({ status: 'rejected' });

        reply.send({
            success: true,
            message: 'Submission rejected',
        });
    } catch (error) {
        reply.status(error.statusCode || 500).send({ success: false, message: error.message });
    }
};
