'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn('users', 'profile_image', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.changeColumn('social_accounts', 'profile_image', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn('users', 'profile_image', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.changeColumn('social_accounts', 'profile_image', {
            type: Sequelize.STRING,
            allowNull: true,
        });
    },
};
