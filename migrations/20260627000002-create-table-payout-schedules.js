'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('payout_schedules', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            submission_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
            },
            campaign_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            brand_user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            creator_user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            amount: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM('scheduled', 'released', 'cancelled', 'failed'),
                allowNull: false,
                defaultValue: 'scheduled',
            },
            approved_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            release_at: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            released_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('payout_schedules');
    },
};
