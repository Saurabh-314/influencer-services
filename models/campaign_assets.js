'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class campaign_assets extends Model {
        static associate(models) {
            campaign_assets.belongsTo(models.campaigns, {
                foreignKey: 'campaign_id',
                as: 'campaign',
            });
        }
    }

    campaign_assets.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        campaign_id: { type: DataTypes.INTEGER, allowNull: false },
        file_url: { type: DataTypes.STRING, allowNull: false },
        thumbnail: { type: DataTypes.STRING, allowNull: true },
        asset_type: {
            type: DataTypes.ENUM('image', 'video', 'pdf', 'zip'),
            allowNull: false,
        },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
        deletedAt: { type: DataTypes.DATE, field: 'deleted_at' },
    }, {
        sequelize,
        modelName: 'campaign_assets',
        tableName: 'campaign_assets',
        timestamps: true,
        paranoid: true,
    });

    return campaign_assets;
};
