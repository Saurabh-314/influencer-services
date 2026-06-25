'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('campaign_assets', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            campaign_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            file_url: { type: Sequelize.STRING, allowNull: false },
            thumbnail: { type: Sequelize.STRING, allowNull: true },
            asset_type: {
                type: Sequelize.ENUM('image', 'video', 'pdf', 'zip'),
                allowNull: false,
            },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('campaign_assets');
    },
};
