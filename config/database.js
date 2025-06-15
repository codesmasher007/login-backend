const { Sequelize } = require("sequelize");
require("dotenv").config();

let sequelize;

const useLocalDB =
  process.env.USE_LOCAL_DB === "true" || process.env.NODE_ENV === "development";

if (useLocalDB) {
  console.log("🔧 Using SQLite for local development");
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  });
} else {
  console.log("🔧 Using MySQL for production");
  sequelize = new Sequelize({
    host: process.env.DB_HOST,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  });
}

const redis = require("redis");
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

redisClient.on("connect", () => {
  console.log(" Redis connected successfully");
});

redisClient.on("error", (err) => {
  console.error(" Redis connection error:", err);
});

redisClient.connect().catch(console.error);

module.exports = { sequelize, redisClient };
