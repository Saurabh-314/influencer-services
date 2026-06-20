const { User, Campaign, sequelize } = require('./models');

const seedData = async () => {
    try {
        await sequelize.sync({ force: true });

        // Create Admin
        const admin = await User.create({
            name: 'Admin User',
            email: 'admin@example.com',
            password: 'adminpassword',
            role: 'admin'
        });

        // Create Creator
        const creator = await User.create({
            name: 'Saurabh Creator',
            email: 'creator@example.com',
            password: 'creatorpassword',
            role: 'creator'
        });

        // Create Campaign
        await Campaign.create({
            title: 'Summer Reel Challenge',
            description: 'Create a reel about summer vibes',
            campaign_type: 'reel',
            reward_points: 500,
            start_date: new Date(),
            end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days later
            status: 'active',
            created_by: admin.id
        });

        console.log('Database seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

seedData();
