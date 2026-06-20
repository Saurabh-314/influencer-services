const { CampaignSubmission, CreatorPoints, User, Campaign } = require('../models');

exports.submitCampaign = async (request, reply) => {
    try {
        const { campaign_id, social_account_id, submission_url, proof_image } = request.body;

        // Check if duplicate submission
        const existingSubmission = await CampaignSubmission.findOne({
            where: { campaign_id, user_id: request.user.id, social_account_id }
        });

        if (existingSubmission) {
            return reply.status(400).send({ success: false, message: 'You have already submitted for this campaign using this account' });
        }

        const submission = await CampaignSubmission.create({
            campaign_id,
            user_id: request.user.id,
            social_account_id,
            submission_url,
            proof_image,
            status: 'pending'
        });

        reply.status(201).send({
            success: true,
            message: 'Submission received and pending approval',
            data: submission
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.approveSubmission = async (request, reply) => {
    const transaction = await CampaignSubmission.sequelize.transaction();
    try {
        const { id } = request.params;
        const submission = await CampaignSubmission.findByPk(id, { include: [Campaign] });

        if (!submission) {
            return reply.status(404).send({ success: false, message: 'Submission not found' });
        }

        if (submission.status !== 'pending') {
            return reply.status(400).send({ success: false, message: 'Submission already processed' });
        }

        // Update submission status
        await submission.update({
            status: 'approved',
            approved_by: request.user.id,
            approved_at: new Date()
        }, { transaction });

        // Award points
        await CreatorPoints.create({
            user_id: submission.user_id,
            points: submission.Campaign.reward_points,
            reason: `Reward for campaign: ${submission.Campaign.title}`,
            campaign_id: submission.campaign_id
        }, { transaction });

        await transaction.commit();

        reply.send({
            success: true,
            message: 'Submission approved and points awarded'
        });
    } catch (error) {
        await transaction.rollback();
        reply.status(500).send({ success: false, message: error.message });
    }
};

