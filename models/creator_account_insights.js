'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class creator_account_insights extends Model {
        static associate(models) {
            creator_account_insights.belongsTo(models.social_accounts, {
                foreignKey: 'social_account_id',
                as: 'account',
            });
            creator_account_insights.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
        }
    }

    creator_account_insights.init({
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        social_account_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        insight_date: { type: DataTypes.DATEONLY, allowNull: false },
        reach: { type: DataTypes.BIGINT, allowNull: true },
        impressions: { type: DataTypes.BIGINT, allowNull: true },
        profile_views: { type: DataTypes.BIGINT, allowNull: true },
        total_interactions: { type: DataTypes.BIGINT, allowNull: true },
        likes: { type: DataTypes.BIGINT, allowNull: true },
        comments: { type: DataTypes.BIGINT, allowNull: true },
        shares: { type: DataTypes.BIGINT, allowNull: true },
        saves: { type: DataTypes.BIGINT, allowNull: true },
        views: { type: DataTypes.BIGINT, allowNull: true },
        follower_count: { type: DataTypes.BIGINT, allowNull: true },
        followers_total: { type: DataTypes.BIGINT, allowNull: true },
        follows: { type: DataTypes.BIGINT, allowNull: true },
        unfollows: { type: DataTypes.BIGINT, allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'creator_account_insights',
        tableName: 'creator_account_insights',
        timestamps: true,
    });

    return creator_account_insights;
};
