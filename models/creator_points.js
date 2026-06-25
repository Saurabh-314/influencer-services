'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class creator_points extends Model {
        static associate(models) {
            creator_points.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
            creator_points.belongsTo(models.campaigns, {
                foreignKey: 'campaign_id',
                as: 'campaign',
            });
        }
    }

    creator_points.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        points: { type: DataTypes.INTEGER, defaultValue: 0 },
        reason: { type: DataTypes.STRING, allowNull: true },
        campaign_id: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
        deletedAt: { type: DataTypes.DATE, field: 'deleted_at' },
    }, {
        sequelize,
        modelName: 'creator_points',
        tableName: 'creator_points',
        timestamps: true,
        paranoid: true,
    });

    return creator_points;
};
