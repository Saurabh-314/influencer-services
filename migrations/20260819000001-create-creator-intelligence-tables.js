'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('creator_media', {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
            social_account_id: { type: Sequelize.INTEGER, allowNull: false },
            user_id: { type: Sequelize.INTEGER, allowNull: false },
            instagram_media_id: { type: Sequelize.STRING, allowNull: false },
            media_type: { type: Sequelize.STRING, allowNull: true },
            media_product_type: { type: Sequelize.STRING, allowNull: true },
            caption: { type: Sequelize.TEXT, allowNull: true },
            media_url: { type: Sequelize.TEXT, allowNull: true },
            thumbnail_url: { type: Sequelize.TEXT, allowNull: true },
            permalink: { type: Sequelize.TEXT, allowNull: true },
            published_at: { type: Sequelize.DATE, allowNull: true },
            like_count: { type: Sequelize.INTEGER, allowNull: true },
            comments_count: { type: Sequelize.INTEGER, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await queryInterface.addIndex('creator_media', ['social_account_id']);
        await queryInterface.addIndex('creator_media', ['social_account_id', 'instagram_media_id'], {
            unique: true,
            name: 'creator_media_account_ig_id_unique',
        });

        await queryInterface.createTable('creator_account_insights', {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
            social_account_id: { type: Sequelize.INTEGER, allowNull: false },
            user_id: { type: Sequelize.INTEGER, allowNull: false },
            insight_date: { type: Sequelize.DATEONLY, allowNull: false },
            reach: { type: Sequelize.BIGINT, allowNull: true },
            impressions: { type: Sequelize.BIGINT, allowNull: true },
            profile_views: { type: Sequelize.BIGINT, allowNull: true },
            total_interactions: { type: Sequelize.BIGINT, allowNull: true },
            likes: { type: Sequelize.BIGINT, allowNull: true },
            comments: { type: Sequelize.BIGINT, allowNull: true },
            shares: { type: Sequelize.BIGINT, allowNull: true },
            saves: { type: Sequelize.BIGINT, allowNull: true },
            views: { type: Sequelize.BIGINT, allowNull: true },
            follower_count: { type: Sequelize.BIGINT, allowNull: true },
            followers_total: { type: Sequelize.BIGINT, allowNull: true },
            follows: { type: Sequelize.BIGINT, allowNull: true },
            unfollows: { type: Sequelize.BIGINT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await queryInterface.addIndex('creator_account_insights', ['social_account_id', 'insight_date'], {
            unique: true,
            name: 'creator_account_insights_account_date_unique',
        });

        await queryInterface.createTable('creator_media_insights', {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
            social_account_id: { type: Sequelize.INTEGER, allowNull: false },
            user_id: { type: Sequelize.INTEGER, allowNull: false },
            creator_media_id: { type: Sequelize.INTEGER, allowNull: false },
            instagram_media_id: { type: Sequelize.STRING, allowNull: false },
            insight_date: { type: Sequelize.DATEONLY, allowNull: false },
            reach: { type: Sequelize.BIGINT, allowNull: true },
            views: { type: Sequelize.BIGINT, allowNull: true },
            likes: { type: Sequelize.BIGINT, allowNull: true },
            comments: { type: Sequelize.BIGINT, allowNull: true },
            shares: { type: Sequelize.BIGINT, allowNull: true },
            saves: { type: Sequelize.BIGINT, allowNull: true },
            total_interactions: { type: Sequelize.BIGINT, allowNull: true },
            video_view_total_time: { type: Sequelize.DOUBLE, allowNull: true },
            average_watch_time: { type: Sequelize.DOUBLE, allowNull: true },
            replays: { type: Sequelize.BIGINT, allowNull: true },
            skip_rate: { type: Sequelize.DOUBLE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await queryInterface.addIndex('creator_media_insights', ['creator_media_id', 'insight_date'], {
            unique: true,
            name: 'creator_media_insights_media_date_unique',
        });

        await queryInterface.createTable('scoring_weights', {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
            version: { type: Sequelize.STRING, allowNull: false },
            config: { type: Sequelize.JSON, allowNull: false },
            is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });

        await queryInterface.createTable('creator_scores', {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
            social_account_id: { type: Sequelize.INTEGER, allowNull: false },
            user_id: { type: Sequelize.INTEGER, allowNull: false },
            reach_power: { type: Sequelize.FLOAT, allowNull: true },
            engagement_quality: { type: Sequelize.FLOAT, allowNull: true },
            content_performance: { type: Sequelize.FLOAT, allowNull: true },
            audience_scale: { type: Sequelize.FLOAT, allowNull: true },
            consistency: { type: Sequelize.FLOAT, allowNull: true },
            creator_score: { type: Sequelize.FLOAT, allowNull: true },
            rising_score: { type: Sequelize.FLOAT, allowNull: true },
            status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'collecting' },
            score_version: { type: Sequelize.STRING, allowNull: false },
            peer_tier: { type: Sequelize.STRING, allowNull: true },
            metrics_json: { type: Sequelize.JSON, allowNull: true },
            payload_json: { type: Sequelize.JSON, allowNull: true },
            calculated_at: { type: Sequelize.DATE, allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
        await queryInterface.addIndex('creator_scores', ['social_account_id', 'calculated_at'], {
            name: 'creator_scores_account_calculated_idx',
        });

        const now = new Date();
        await queryInterface.bulkInsert('scoring_weights', [{
            version: '1.0.0',
            config: JSON.stringify({
                like: 1,
                comment: 3,
                save: 4,
                share: 5,
            }),
            is_active: true,
            created_at: now,
            updated_at: now,
        }]);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('creator_scores');
        await queryInterface.dropTable('scoring_weights');
        await queryInterface.dropTable('creator_media_insights');
        await queryInterface.dropTable('creator_account_insights');
        await queryInterface.dropTable('creator_media');
    },
};
