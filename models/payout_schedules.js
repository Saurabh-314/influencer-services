'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class payout_schedules extends Model {
        static associate(models) {
            payout_schedules.belongsTo(models.campaign_submissions, {
                foreignKey: 'submission_id',
                as: 'submission',
            });
            payout_schedules.belongsTo(models.campaigns, {
                foreignKey: 'campaign_id',
                as: 'campaign',
            });
            payout_schedules.belongsTo(models.users, {
                foreignKey: 'brand_user_id',
                as: 'brand',
            });
            payout_schedules.belongsTo(models.users, {
                foreignKey: 'creator_user_id',
                as: 'creator',
            });
        }
    }

    payout_schedules.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        submission_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        campaign_id: { type: DataTypes.INTEGER, allowNull: false },
        brand_user_id: { type: DataTypes.INTEGER, allowNull: false },
        creator_user_id: { type: DataTypes.INTEGER, allowNull: false },
        amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        status: {
            type: DataTypes.ENUM('scheduled', 'released', 'cancelled', 'failed'),
            allowNull: false,
            defaultValue: 'scheduled',
        },
        approved_at: { type: DataTypes.DATE, allowNull: false },
        release_at: { type: DataTypes.DATE, allowNull: false },
        released_at: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'payout_schedules',
        tableName: 'payout_schedules',
        timestamps: true,
    });

    return payout_schedules;
};
