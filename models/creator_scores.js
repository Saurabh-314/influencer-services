'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class creator_scores extends Model {
        static associate(models) {
            creator_scores.belongsTo(models.social_accounts, {
                foreignKey: 'social_account_id',
                as: 'account',
            });
            creator_scores.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
        }
    }

    creator_scores.init({
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        social_account_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        reach_power: { type: DataTypes.FLOAT, allowNull: true },
        engagement_quality: { type: DataTypes.FLOAT, allowNull: true },
        content_performance: { type: DataTypes.FLOAT, allowNull: true },
        audience_scale: { type: DataTypes.FLOAT, allowNull: true },
        consistency: { type: DataTypes.FLOAT, allowNull: true },
        creator_score: { type: DataTypes.FLOAT, allowNull: true },
        rising_score: { type: DataTypes.FLOAT, allowNull: true },
        status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'collecting' },
        score_version: { type: DataTypes.STRING, allowNull: false },
        peer_tier: { type: DataTypes.STRING, allowNull: true },
        metrics_json: { type: DataTypes.JSON, allowNull: true },
        payload_json: { type: DataTypes.JSON, allowNull: true },
        calculated_at: { type: DataTypes.DATE, allowNull: false },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'creator_scores',
        tableName: 'creator_scores',
        timestamps: true,
    });

    return creator_scores;
};
