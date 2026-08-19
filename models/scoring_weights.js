'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class scoring_weights extends Model {
        static associate() {}
    }

    scoring_weights.init({
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        version: { type: DataTypes.STRING, allowNull: false },
        config: { type: DataTypes.JSON, allowNull: false },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'scoring_weights',
        tableName: 'scoring_weights',
        timestamps: true,
    });

    return scoring_weights;
};
