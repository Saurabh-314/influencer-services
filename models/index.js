const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);

const dbConfig = require("../config/database.config");
const db = { models: {} }

const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
	host: dbConfig.HOST,
	dialect: dbConfig.dialect,
	operatorsAliases: 0,
	logging: false,
	define: {
		underscored: false,
		freezeTableName: true, //use singular table name
		timestamps: true // I do not want timestamp fields by default
	},
	timezone: "+05:30",
	dialectOptions: {
		// for reading from database
		dateStrings: true,
		timezone: "+05:30",
		typeCast: true
	},
	retry: {
		match: [
			/SequelizeConnectionError/,
			/SequelizeConnectionRefusedError/,
			/SequelizeHostNotFoundError/,
			/SequelizeHostNotReachableError/,
			/SequelizeInvalidConnectionError/,
			/SequelizeConnectionTimedOutError/,
			/SequelizeConnectionAcquireTimeoutError/,
		],
		backoffBase: 1000,
		backoffExponent: 1.1,
		timeout: 60000,
	},
	pool: {
		max: dbConfig.pool.max,
		min: dbConfig.pool.min,
		acquire: dbConfig.pool.acquire,
		idle: dbConfig.pool.idle
	}
});

fs
	.readdirSync(__dirname)
	.filter(file => {
		return (
			file.indexOf('.') !== 0 &&
			file !== basename &&
			file.slice(-3) === '.js' &&
			file.indexOf('.test.js') === -1
		);
	})
	.forEach(file => {
		const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
		db.models[model.name] = model;
	});

Object.keys(db.models).forEach(modelName => {

	if (db.models[modelName].associate) {
		db.models[modelName].associate(db.models);
	}
});

db.Sequelize = Sequelize;
db.sequelize = sequelize;
module.exports = db;
