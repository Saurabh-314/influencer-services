const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreatorPoints = sequelize.define('CreatorPoints', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    points: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    campaign_id: {
        type: DataTypes.UUID,
        allowNull: true
    }
}, {
    timestamps: true,
    underscored: true
});

module.exports = CreatorPoints;
