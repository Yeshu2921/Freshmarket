
const mysql = require("mysql2/promise");
const fs = require("fs");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "freshmarket",

  // Enable SSL for TiDB Cloud.
  ...(process.env.DB_SSL === "true" && {
  ssl: {
    ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, "utf8"),
    rejectUnauthorized: true,
  },
}),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
