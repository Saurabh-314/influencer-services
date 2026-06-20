const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CampaignCaption = sequelize.define('CampaignCaption', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    campaign_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    caption: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    hashtags: {
        type: DataTypes.STRING,
        allowNull: true
    },
    language: {
        type: DataTypes.STRING,
        defaultValue: 'en'
    }
}, {
    timestamps: true,
    underscored: true
});

module.exports = CampaignCaption;
