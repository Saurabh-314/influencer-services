const { User, CreatorRank, CreatorPoints, sequelize } = require('../models');

exports.getLeaderboard = async (request, reply) => {
    try {
        const leaderboard = await User.findAll({
            where: { role: 'creator' },
            attributes: [
                'id', 'name', 'profile_image',
                [
                    sequelize.literal(`(
                        SELECT COALESCE(SUM(points), 0)
                        FROM creator_points
                        WHERE creator_points.user_id = User.id
                    )`),
                    'total_points'
                ]
            ],
            include: [
                {
                    model: CreatorRank,
                    as: 'rank',
                    attributes: ['level', 'rank_score']
                }
            ],
            order: [[sequelize.literal('total_points'), 'DESC']],
            limit: 100
        });

        reply.send({
            success: true,
            data: leaderboard
        });
    } catch (error) {
        console.log(error);
        reply.status(500).send({ success: false, message: error.message });
    }
};

