'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class campaign_submissions extends Model {
        static associate(models) {
            campaign_submissions.belongsTo(models.campaigns, {
                foreignKey: 'campaign_id',
                as: 'campaign',
            });
            campaign_submissions.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
            campaign_submissions.belongsTo(models.social_accounts, {
                foreignKey: 'social_account_id',
                as: 'social_account',
            });
            campaign_submissions.belongsTo(models.users, {
                foreignKey: 'approved_by',
                as: 'approver',
            });
            campaign_submissions.hasOne(models.payout_schedules, {
                foreignKey: 'submission_id',
                as: 'payout_schedule',
            });
        }
    }

    campaign_submissions.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        campaign_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        social_account_id: { type: DataTypes.INTEGER, allowNull: false },
        submission_url: { type: DataTypes.STRING, allowNull: true },
        applied_at: { type: DataTypes.DATE, allowNull: true },
        submitted_at: { type: DataTypes.DATE, allowNull: true },
        proof_image: { type: DataTypes.STRING, allowNull: true },
        views: { type: DataTypes.INTEGER, defaultValue: 0 },
        likes: { type: DataTypes.INTEGER, defaultValue: 0 },
        comments: { type: DataTypes.INTEGER, defaultValue: 0 },
        shares: { type: DataTypes.INTEGER, defaultValue: 0 },
        status: {
            type: DataTypes.ENUM('applied', 'pending', 'approved', 'rejected'),
            defaultValue: 'applied',
        },
        approved_by: { type: DataTypes.INTEGER, allowNull: true },
        approved_at: { type: DataTypes.DATE, allowNull: true },
        payout_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'campaign_submissions',
        tableName: 'campaign_submissions',
        timestamps: true,
    });

    return campaign_submissions;
};
