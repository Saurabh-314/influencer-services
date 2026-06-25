'use strict';
const bcrypt = require('bcryptjs');
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class users extends Model {
        static associate(models) {
            users.hasMany(models.campaigns, {
                foreignKey: 'created_by',
                as: 'campaigns',
            });
            users.hasMany(models.social_accounts, {
                foreignKey: 'user_id',
                as: 'social_accounts',
            });
            users.hasMany(models.campaign_submissions, {
                foreignKey: 'user_id',
                as: 'submissions',
            });
            users.hasOne(models.creator_ranks, {
                foreignKey: 'user_id',
                as: 'rank',
            });
            users.hasMany(models.creator_points, {
                foreignKey: 'user_id',
                as: 'points',
            });
        }

        async comparePassword(password) {
            return bcrypt.compare(password, this.password);
        }
    }

    users.init({
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: { isEmail: true },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        profile_image: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        role: {
            type: DataTypes.ENUM('creator', 'brand', 'admin'),
            defaultValue: 'creator',
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
        },
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
        deletedAt: { type: DataTypes.DATE, field: 'deleted_at' },
    }, {
        sequelize,
        modelName: 'users',
        tableName: 'users',
        timestamps: true,
        paranoid: true,
        hooks: {
            beforeCreate: async (user) => {
                if (user.password) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            },
            beforeUpdate: async (user) => {
                if (user.changed('password')) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            },
        },
    });

    return users;
};
