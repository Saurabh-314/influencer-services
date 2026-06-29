'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class wallets extends Model {
        static associate(models) {
            wallets.belongsTo(models.users, {
                foreignKey: 'user_id',
                as: 'user',
            });
            wallets.hasMany(models.wallet_transactions, {
                foreignKey: 'wallet_id',
                as: 'transactions',
            });
        }
    }

    wallets.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        balance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        locked_balance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'wallets',
        tableName: 'wallets',
        timestamps: true,
    });

    return wallets;
};
