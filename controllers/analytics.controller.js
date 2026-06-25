const db = require('../models');
const campaign_submissions = db.models.campaign_submissions;
const creator_points = db.models.creator_points;

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
