'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class creator_media extends Model {
        static associate(models) {
            creator_media.belongsTo(models.social_accounts, {
                foreignKey: 'social_account_id',
                as: 'account',
            });
            creator_media.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
            creator_media.hasMany(models.creator_media_insights, {
                foreignKey: 'creator_media_id',
                as: 'insights',
            });
        }
    }

    creator_media.init({
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        social_account_id: { type: DataTypes.INTEGER, allowNull: false },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        instagram_media_id: { type: DataTypes.STRING, allowNull: false },
        media_type: { type: DataTypes.STRING, allowNull: true },
        media_product_type: { type: DataTypes.STRING, allowNull: true },
        caption: { type: DataTypes.TEXT, allowNull: true },
        media_url: { type: DataTypes.TEXT, allowNull: true },
        thumbnail_url: { type: DataTypes.TEXT, allowNull: true },
        permalink: { type: DataTypes.TEXT, allowNull: true },
        published_at: { type: DataTypes.DATE, allowNull: true },
        like_count: { type: DataTypes.INTEGER, allowNull: true },
        comments_count: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'creator_media',
        tableName: 'creator_media',
        timestamps: true,
    });

    return creator_media;
};
