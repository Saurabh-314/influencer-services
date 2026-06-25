'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('campaigns', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            title: { type: Sequelize.STRING, allowNull: false },
            description: { type: Sequelize.TEXT, allowNull: true },
            campaign_type: {
                type: Sequelize.ENUM('reel', 'post', 'story', 'youtube_video', 'shorts', 'tiktok_video'),
                allowNull: false,
            },
            reward_points: { type: Sequelize.INTEGER, defaultValue: 0 },
            spotify_link: { type: Sequelize.STRING, allowNull: true },
            genre: { type: Sequelize.STRING, allowNull: true },
            required_tags: { type: Sequelize.STRING, allowNull: true },
            hashtags: { type: Sequelize.STRING, allowNull: true },
            brand_name: { type: Sequelize.STRING, allowNull: true },
            brand_logo_url: { type: Sequelize.STRING, allowNull: true },
            track_artwork_url: { type: Sequelize.STRING, allowNull: true },
            bonus_target_views: { type: Sequelize.STRING, allowNull: true },
            bonus_reward: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            bonus_max_creators: { type: Sequelize.INTEGER, allowNull: true },
            audience_gender: { type: Sequelize.STRING, allowNull: true },
            audience_age: { type: Sequelize.STRING, allowNull: true },
            specific_creators: { type: Sequelize.TEXT, allowNull: true },
            rank_allocations: { type: Sequelize.JSON, allowNull: true },
            total_budget: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            expected_reels: { type: Sequelize.INTEGER, allowNull: true },
            start_date: { type: Sequelize.DATE, allowNull: false },
            end_date: { type: Sequelize.DATE, allowNull: false },
            status: {
                type: Sequelize.ENUM('draft', 'active', 'completed', 'paused'),
                defaultValue: 'draft',
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('campaigns');
    },
};
