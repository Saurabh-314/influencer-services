'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('social_accounts', 'biography', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn('social_accounts', 'account_type', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn('social_accounts', 'connected_at', {
            type: Sequelize.DATE,
            allowNull: true,
        });
        await queryInterface.addColumn('social_accounts', 'score_status', {
            type: Sequelize.STRING,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('social_accounts', 'score_status');
        await queryInterface.removeColumn('social_accounts', 'connected_at');
        await queryInterface.removeColumn('social_accounts', 'account_type');
        await queryInterface.removeColumn('social_accounts', 'biography');
    },
};
