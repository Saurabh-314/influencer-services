'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('campaigns', 'spent_budget', {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
        });

        await queryInterface.addColumn('campaign_submissions', 'payout_amount', {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('campaigns', 'spent_budget');
        await queryInterface.removeColumn('campaign_submissions', 'payout_amount');
    },
};
