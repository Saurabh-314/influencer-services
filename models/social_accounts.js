'use strict';
const { Model } = require('sequelize');
const { encryptToken, decryptToken } = require('../utils/tokenCrypto');

module.exports = (sequelize, DataTypes) => {
    class social_accounts extends Model {
        static associate(models) {
            social_accounts.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
            social_accounts.hasMany(models.campaign_submissions, {
                foreignKey: 'social_account_id',
                as: 'submissions',
            });
            social_accounts.hasMany(models.creator_media, {
                foreignKey: 'social_account_id',
                as: 'media',
            });
            social_accounts.hasMany(models.creator_account_insights, {
                foreignKey: 'social_account_id',
                as: 'account_insights',
            });
            social_accounts.hasMany(models.creator_media_insights, {
                foreignKey: 'social_account_id',
                as: 'media_insights',
            });
            social_accounts.hasMany(models.creator_scores, {
                foreignKey: 'social_account_id',
                as: 'scores',
            });
        }

        toJSON() {
            const values = { ...this.get() };
            delete values.access_token;
            delete values.refresh_token;
            return values;
        }
    }

    social_accounts.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        platform: {
            type: DataTypes.ENUM('instagram', 'youtube', 'tiktok', 'facebook', 'twitter', 'linkedin'),
            allowNull: false,
        },
        account_id: { type: DataTypes.STRING, allowNull: true },
        username: { type: DataTypes.STRING, allowNull: false },
        display_name: { type: DataTypes.STRING, allowNull: true },
        profile_image: { type: DataTypes.TEXT, allowNull: true },
        biography: { type: DataTypes.TEXT, allowNull: true },
        account_type: { type: DataTypes.STRING, allowNull: true },
        followers_count: { type: DataTypes.INTEGER, defaultValue: 0 },
        following_count: { type: DataTypes.INTEGER, defaultValue: 0 },
        subscribers_count: { type: DataTypes.INTEGER, defaultValue: 0 },
        engagement_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
        total_posts: { type: DataTypes.INTEGER, defaultValue: 0 },
        total_views: { type: DataTypes.BIGINT, defaultValue: 0 },
        access_token: {
            type: DataTypes.TEXT,
            allowNull: true,
            get() {
                return decryptToken(this.getDataValue('access_token'));
            },
            set(value) {
                this.setDataValue('access_token', encryptToken(value));
            },
        },
        refresh_token: {
            type: DataTypes.TEXT,
            allowNull: true,
            get() {
                return decryptToken(this.getDataValue('refresh_token'));
            },
            set(value) {
                this.setDataValue('refresh_token', encryptToken(value));
            },
        },
        token_expiry: { type: DataTypes.DATE, allowNull: true },
        is_connected: { type: DataTypes.BOOLEAN, defaultValue: true },
        connected_at: { type: DataTypes.DATE, allowNull: true },
        last_synced_at: { type: DataTypes.DATE, allowNull: true },
        score_status: { type: DataTypes.STRING, allowNull: true },
        status: {
            type: DataTypes.ENUM('active', 'inactive', 'error'),
            defaultValue: 'active',
        },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
        deletedAt: { type: DataTypes.DATE, field: 'deleted_at' },
    }, {
        sequelize,
        modelName: 'social_accounts',
        tableName: 'social_accounts',
        timestamps: true,
        paranoid: true,
    });

    return social_accounts;
};
