'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('creator_ranks', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            rank_score: { type: Sequelize.FLOAT, defaultValue: 0 },
            rank_name: { type: Sequelize.STRING, allowNull: true },
            level: {
                type: Sequelize.ENUM('Bronze', 'Silver', 'Gold', 'Platinum', 'Elite'),
                defaultValue: 'Bronze',
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('creator_ranks');
    },
};
