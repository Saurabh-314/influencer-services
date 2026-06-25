const dotenv = require("dotenv");
dotenv.config();
module.exports = {
  HOST: process.env.DB_HOST,
  USER: process.env.DB_USERNAME || process.env.DB_USER,
  PASSWORD: process.env.DB_PASSWORD,
  DB: process.env.DB_DATABASE || process.env.DB_NAME,
  dialect: process.env.DB_CONNECTION || 'mysql',
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 30000,
  },
};