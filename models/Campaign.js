const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Campaign = sequelize.define('Campaign', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    campaign_type: {
        type: DataTypes.ENUM('reel', 'post', 'story', 'youtube_video', 'shorts', 'tiktok_video'),
        allowNull: false
    },
    reward_points: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    start_date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    end_date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('draft', 'active', 'completed', 'paused'),
        defaultValue: 'draft'
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: false
    }
}, {
    timestamps: true,
    underscored: true
});

module.exports = Campaign;
