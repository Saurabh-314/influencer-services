'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class wallet_transactions extends Model {
        static associate(models) {
            wallet_transactions.belongsTo(models.wallets, {
                foreignKey: 'wallet_id',
                as: 'wallet',
            });
        }
    }

    wallet_transactions.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        wallet_id: { type: DataTypes.INTEGER, allowNull: false },
        type: {
            type: DataTypes.ENUM('topup', 'campaign_lock', 'campaign_refund', 'payout_debit', 'payout_credit'),
            allowNull: false,
        },
        amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        balance_after: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        reference_type: { type: DataTypes.STRING, allowNull: true },
        reference_id: { type: DataTypes.STRING, allowNull: true },
        description: { type: DataTypes.STRING, allowNull: true },
        metadata: { type: DataTypes.JSON, allowNull: true },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
    }, {
        sequelize,
        modelName: 'wallet_transactions',
        tableName: 'wallet_transactions',
        timestamps: true,
    });

    return wallet_transactions;
};
