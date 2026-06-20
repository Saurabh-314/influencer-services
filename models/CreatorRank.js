const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreatorRank = sequelize.define('CreatorRank', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    rank_score: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    rank_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    level: {
        type: DataTypes.ENUM('Bronze', 'Silver', 'Gold', 'Platinum', 'Elite'),
        defaultValue: 'Bronze'
    }
}, {
    timestamps: true,
    underscored: true
});

module.exports = CreatorRank;
