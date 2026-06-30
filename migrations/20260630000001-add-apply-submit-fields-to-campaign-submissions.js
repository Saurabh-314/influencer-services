'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('campaign_submissions', 'applied_at', {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn('campaign_submissions', 'submitted_at', {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.changeColumn('campaign_submissions', 'submission_url', {
            type: Sequelize.STRING,
            allowNull: true,
        });

        await queryInterface.sequelize.query(`
            ALTER TABLE campaign_submissions
            MODIFY COLUMN status ENUM('applied', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'applied'
        `);

        await queryInterface.sequelize.query(`
            UPDATE campaign_submissions
            SET applied_at = created_at,
                submitted_at = created_at
            WHERE submission_url IS NOT NULL
        `);

        await queryInterface.addIndex('campaign_submissions', ['campaign_id', 'user_id', 'social_account_id'], {
            unique: true,
            name: 'campaign_submissions_campaign_user_account_unique',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex(
            'campaign_submissions',
            'campaign_submissions_campaign_user_account_unique',
        );

        await queryInterface.sequelize.query(`
            DELETE FROM campaign_submissions WHERE status = 'applied' AND submission_url IS NULL
        `);

        await queryInterface.sequelize.query(`
            ALTER TABLE campaign_submissions
            MODIFY COLUMN status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'
        `);

        await queryInterface.changeColumn('campaign_submissions', 'submission_url', {
            type: Sequelize.STRING,
            allowNull: false,
        });

        await queryInterface.removeColumn('campaign_submissions', 'submitted_at');
        await queryInterface.removeColumn('campaign_submissions', 'applied_at');
    },
};
