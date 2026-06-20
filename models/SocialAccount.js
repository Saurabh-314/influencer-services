const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SocialAccount = sequelize.define('SocialAccount', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    platform: {
        type: DataTypes.ENUM('instagram', 'youtube', 'tiktok', 'facebook', 'twitter', 'linkedin'),
        allowNull: false
    },
    account_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false
    },
    display_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    profile_image: {
        type: DataTypes.STRING,
        allowNull: true
    },
    followers_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    following_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    subscribers_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    engagement_rate: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    total_posts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    total_views: {
        type: DataTypes.BIGINT,
        defaultValue: 0
    },
    access_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    refresh_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    token_expiry: {
        type: DataTypes.DATE,
        allowNull: true
    },
    is_connected: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    last_synced_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'error'),
        defaultValue: 'active'
    }
}, {
    timestamps: true,
    underscored: true
});

module.exports = SocialAccount;
