'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class campaign_captions extends Model {
        static associate(models) {
            campaign_captions.belongsTo(models.campaigns, {
                foreignKey: 'campaign_id',
                as: 'campaign',
            });
        }
    }

    campaign_captions.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        campaign_id: { type: DataTypes.INTEGER, allowNull: false },
        caption: { type: DataTypes.TEXT, allowNull: false },
        hashtags: { type: DataTypes.STRING, allowNull: true },
        language: { type: DataTypes.STRING, defaultValue: 'en' },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'campaign_captions',
        tableName: 'campaign_captions',
        timestamps: true,
    });

    return campaign_captions;
};
