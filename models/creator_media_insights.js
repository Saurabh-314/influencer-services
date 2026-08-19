'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class creator_media_insights extends Model {
        static associate(models) {
            creator_media_insights.belongsTo(models.social_accounts, {
                foreignKey: 'social_account_id',
                as: 'account',
            });
            creator_media_insights.belongsTo(models.creator_media, {
                foreignKey: 'creator_media_id',
                as: 'media',
            });
        }
    }

    creator_media_insights.init({
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        social_account_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        creator_media_id: { type: DataTypes.INTEGER, allowNull: false },
        instagram_media_id: { type: DataTypes.STRING, allowNull: false },
        insight_date: { type: DataTypes.DATEONLY, allowNull: false },
        reach: { type: DataTypes.BIGINT, allowNull: true },
        views: { type: DataTypes.BIGINT, allowNull: true },
        likes: { type: DataTypes.BIGINT, allowNull: true },
        comments: { type: DataTypes.BIGINT, allowNull: true },
        shares: { type: DataTypes.BIGINT, allowNull: true },
        saves: { type: DataTypes.BIGINT, allowNull: true },
        total_interactions: { type: DataTypes.BIGINT, allowNull: true },
        video_view_total_time: { type: DataTypes.DOUBLE, allowNull: true },
        average_watch_time: { type: DataTypes.DOUBLE, allowNull: true },
        replays: { type: DataTypes.BIGINT, allowNull: true },
        skip_rate: { type: DataTypes.DOUBLE, allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'creator_media_insights',
        tableName: 'creator_media_insights',
        timestamps: true,
    });

    return creator_media_insights;
};
