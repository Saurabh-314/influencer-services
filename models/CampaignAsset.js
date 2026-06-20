const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CampaignAssets = sequelize.define('CampaignAssets', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    campaign_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    file_url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    thumbnail: {
        type: DataTypes.STRING,
        allowNull: true
    },
    asset_type: {
        type: DataTypes.ENUM('image', 'video', 'pdf', 'zip'),
        allowNull: false
    }
}, {
    timestamps: true,
    underscored: true
});

module.exports = CampaignAssets;
