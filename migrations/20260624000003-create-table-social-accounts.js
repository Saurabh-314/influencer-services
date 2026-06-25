'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('social_accounts', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            platform: {
                type: Sequelize.ENUM('instagram', 'youtube', 'tiktok', 'facebook', 'twitter', 'linkedin'),
                allowNull: false,
            },
            account_id: { type: Sequelize.STRING, allowNull: true },
            username: { type: Sequelize.STRING, allowNull: false },
            display_name: { type: Sequelize.STRING, allowNull: true },
            profile_image: { type: Sequelize.STRING, allowNull: true },
            followers_count: { type: Sequelize.INTEGER, defaultValue: 0 },
            following_count: { type: Sequelize.INTEGER, defaultValue: 0 },
            subscribers_count: { type: Sequelize.INTEGER, defaultValue: 0 },
            engagement_rate: { type: Sequelize.FLOAT, defaultValue: 0 },
            total_posts: { type: Sequelize.INTEGER, defaultValue: 0 },
            total_views: { type: Sequelize.BIGINT, defaultValue: 0 },
            access_token: { type: Sequelize.TEXT, allowNull: true },
            refresh_token: { type: Sequelize.TEXT, allowNull: true },
            token_expiry: { type: Sequelize.DATE, allowNull: true },
            is_connected: { type: Sequelize.BOOLEAN, defaultValue: true },
            last_synced_at: { type: Sequelize.DATE, allowNull: true },
            status: {
                type: Sequelize.ENUM('active', 'inactive', 'error'),
                defaultValue: 'active',
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('social_accounts');
    },
};
