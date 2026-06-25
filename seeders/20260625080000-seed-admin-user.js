'use strict';

const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        const password = await bcrypt.hash('adminpassword', 10);

        await queryInterface.bulkInsert('users', [
            {
                name: 'Admin User',
                email: 'admin@example.com',
                password,
                role: 'admin',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date(),
            },
            {
                name: 'Saurabh Creator',
                email: 'creator@example.com',
                password: await bcrypt.hash('creatorpassword', 10),
                role: 'creator',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date(),
            },
            {
                name: 'T-Series Brand',
                email: 'brand@example.com',
                password: await bcrypt.hash('brandpassword', 10),
                role: 'brand',
                status: 'active',
                created_at: new Date(),
                updated_at: new Date(),
            },
        ]);
    },

    async down(queryInterface) {
        await queryInterface.bulkDelete('users', {
            email: ['admin@example.com', 'creator@example.com', 'brand@example.com'],
        });
    },
};
