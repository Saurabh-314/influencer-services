const db = require('../models');
const users = db.models.users;
const creator_ranks = db.models.creator_ranks;
const { sequelize } = db;

exports.getLeaderboard = async (request, reply) => {
    try {
        const leaderboard = await users.findAll({
            where: { role: 'creator' },
            attributes: [
                'id', 'name', 'profile_image',
                [
                    sequelize.literal(`(
                        SELECT COALESCE(SUM(points), 0)
                        FROM creator_points
                        WHERE creator_points.user_id = users.id
                    )`),
                    'total_points',
                ],
            ],
            include: [
                {
                    model: creator_ranks,
                    as: 'rank',
                    attributes: ['level', 'rank_score'],
                },
            ],
            order: [[sequelize.literal('total_points'), 'DESC']],
            limit: 100,
        });

        reply.send({
            success: true,
            data: leaderboard,
        });
    } catch (error) {
        console.log(error);
        reply.status(500).send({ success: false, message: error.message });
    }
};
