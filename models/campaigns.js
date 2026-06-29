'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class campaigns extends Model {
        static associate(models) {
            campaigns.belongsTo(models.users, {
                foreignKey: 'created_by',
                as: 'creator',
            });
            campaigns.hasMany(models.campaign_assets, {
                foreignKey: 'campaign_id',
                as: 'assets',
            });
            campaigns.hasMany(models.campaign_captions, {
                foreignKey: 'campaign_id',
                as: 'captions',
            });
            campaigns.hasMany(models.campaign_submissions, {
                foreignKey: 'campaign_id',
                as: 'submissions',
            });
            campaigns.hasMany(models.creator_points, {
                foreignKey: 'campaign_id',
                as: 'points',
            });
            campaigns.hasMany(models.payout_schedules, {
                foreignKey: 'campaign_id',
                as: 'payouts',
            });
        }
    }

    campaigns.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        title: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        campaign_type: {
            type: DataTypes.ENUM('reel', 'post', 'story', 'youtube_video', 'shorts', 'tiktok_video'),
            allowNull: false,
        },
        reward_points: { type: DataTypes.INTEGER, defaultValue: 0 },
        spotify_link: { type: DataTypes.STRING, allowNull: true },
        genre: { type: DataTypes.STRING, allowNull: true },
        required_tags: { type: DataTypes.STRING, allowNull: true },
        hashtags: { type: DataTypes.STRING, allowNull: true },
        brand_name: { type: DataTypes.STRING, allowNull: true },
        brand_logo_url: { type: DataTypes.STRING, allowNull: true },
        track_artwork_url: { type: DataTypes.STRING, allowNull: true },
        bonus_target_views: { type: DataTypes.STRING, allowNull: true },
        bonus_reward: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        bonus_max_creators: { type: DataTypes.INTEGER, allowNull: true },
        audience_gender: { type: DataTypes.STRING, allowNull: true },
        audience_age: { type: DataTypes.STRING, allowNull: true },
        specific_creators: { type: DataTypes.TEXT, allowNull: true },
        rank_allocations: { type: DataTypes.JSON, allowNull: true },
        total_budget: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        spent_budget: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        expected_reels: { type: DataTypes.INTEGER, allowNull: true },
        start_date: { type: DataTypes.DATE, allowNull: false },
        end_date: { type: DataTypes.DATE, allowNull: false },
        status: {
            type: DataTypes.ENUM('draft', 'active', 'completed', 'paused'),
            defaultValue: 'draft',
        },
        created_by: { type: DataTypes.INTEGER, allowNull: false },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'campaigns',
        tableName: 'campaigns',
        timestamps: true,
    });

    return campaigns;
};
