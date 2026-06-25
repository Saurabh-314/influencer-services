'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class creator_ranks extends Model {
        static associate(models) {
            creator_ranks.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
        }
    }

    creator_ranks.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        rank_score: { type: DataTypes.FLOAT, defaultValue: 0 },
        rank_name: { type: DataTypes.STRING, allowNull: true },
        level: {
            type: DataTypes.ENUM('Bronze', 'Silver', 'Gold', 'Platinum', 'Elite'),
            defaultValue: 'Bronze',
        },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
        deletedAt: { type: DataTypes.DATE, field: 'deleted_at' },
    }, {
        sequelize,
        modelName: 'creator_ranks',
        tableName: 'creator_ranks',
        timestamps: true,
        paranoid: true,
    });

    return creator_ranks;
};
