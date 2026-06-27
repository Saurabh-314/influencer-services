const db = require('../models');
const campaign_submissions = db.models.campaign_submissions;
const creator_points = db.models.creator_points;
const campaigns = db.models.campaigns;

exports.getMySubmissions = async (request, reply) => {
    try {
        const submissions = await campaign_submissions.findAll({
            where: { user_id: request.user.id },
            include: [{
                model: campaigns,
                as: 'campaign',
                attributes: ['id', 'title', 'brand_name', 'genre', 'rank_allocations', 'reward_points'],
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

exports.submitCampaign = async (request, reply) => {
    try {
        const { campaign_id, social_account_id, submission_url, proof_image } = request.body;

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
            message: 'Submission received and pending approval',
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
        const submission = await campaign_submissions.findByPk(id, { include: ['campaign'] });

        if (!submission) {
            return reply.status(404).send({ success: false, message: 'Submission not found' });
        }

        if (submission.status !== 'pending') {
            return reply.status(400).send({ success: false, message: 'Submission already processed' });
        }

        await submission.update({
            status: 'approved',
            approved_by: request.user.id,
            approved_at: new Date(),
        }, { transaction });

        await creator_points.create({
            user_id: submission.user_id,
            points: submission.campaign.reward_points,
            reason: `Reward for campaign: ${submission.campaign.title}`,
            campaign_id: submission.campaign_id,
        }, { transaction });

        await transaction.commit();

        reply.send({
            success: true,
            message: 'Submission approved and points awarded',
        });
    } catch (error) {
        await transaction.rollback();
        reply.status(500).send({ success: false, message: error.message });
    }
};
