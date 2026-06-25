'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('campaign_captions', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            campaign_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            caption: { type: Sequelize.TEXT, allowNull: false },
            hashtags: { type: Sequelize.STRING, allowNull: true },
            language: { type: Sequelize.STRING, defaultValue: 'en' },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('campaign_captions');
    },
};
