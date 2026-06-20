const { CampaignSubmission, CreatorPoints, sequelize } = require('../models');

exports.getStats = async (request, reply) => {
    try {
        const totalPoints = await CreatorPoints.sum('points', { where: { user_id: request.user.id } }) || 0;
        const completedCampaigns = await CampaignSubmission.count({
            where: { user_id: request.user.id, status: 'approved' }
        });

        // Mock growth data for charts
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
                growthData
            }
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

