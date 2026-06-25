'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('campaign_submissions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            campaign_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            social_account_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            submission_url: { type: Sequelize.STRING, allowNull: false },
            proof_image: { type: Sequelize.STRING, allowNull: true },
            views: { type: Sequelize.INTEGER, defaultValue: 0 },
            likes: { type: Sequelize.INTEGER, defaultValue: 0 },
            comments: { type: Sequelize.INTEGER, defaultValue: 0 },
            shares: { type: Sequelize.INTEGER, defaultValue: 0 },
            status: {
                type: Sequelize.ENUM('pending', 'approved', 'rejected'),
                defaultValue: 'pending',
            },
            approved_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            approved_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('campaign_submissions');
    },
};
