'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('wallet_transactions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            wallet_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            type: {
                type: Sequelize.ENUM(
                    'topup',
                    'campaign_lock',
                    'campaign_refund',
                    'payout_debit',
                    'payout_credit',
                ),
                allowNull: false,
            },
            amount: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
            },
            balance_after: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
            },
            reference_type: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            reference_id: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            description: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            metadata: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('wallet_transactions');
    },
};
