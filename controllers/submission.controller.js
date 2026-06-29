const db = require('../models');
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
        const submissions = await campaign_submissions.findAll({
            where: { user_id: request.user.id },
            include: [{
                model: campaigns,
                as: 'campaign',
                attributes: ['id', 'title', 'brand_name', 'genre', 'rank_allocations', 'reward_points'],
            }, {
                model: db.models.payout_schedules,
                as: 'payout_schedule',
            }],
            order: [['createdAt', 'DESC']],
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

        const submissions = await campaign_submissions.findAll({
            where: { campaign_id: campaign.id },
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
            order: [['createdAt', 'DESC']],
        });

        reply.send({ success: true, data: submissions });
    } catch (error) {
        reply.status(error.statusCode || 500).send({ success: false, message: error.message });
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
            return reply.status(400).send({ success: false, message: 'You have already submitted for this campaign using this account' });
        }

        const submission = await campaign_submissions.create({
            campaign_id,
            user_id: request.user.id,
            social_account_id,
            submission_url,
            proof_image,
            status: 'pending',
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
