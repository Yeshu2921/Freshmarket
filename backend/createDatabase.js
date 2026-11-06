
const mysql = require("mysql2/promise");
require("dotenv").config();

async function createDatabase() {
  let connection;

  try {
    // Connect to MySQL server
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
    });

    // Create a new database
    await connection.query(`
      CREATE DATABASE IF NOT EXISTS freshmarket
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
    `);

    console.log("Database 'freshmarket' is ready.");

    // Select the database
    await connection.query("USE freshmarket");

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,

        sex ENUM(
          'male',
          'female',
          'other',
          'prefer_not_to_say'
        ) DEFAULT NULL,

        email VARCHAR(190) NOT NULL UNIQUE,
        phone VARCHAR(30) DEFAULT NULL,
        address VARCHAR(255) DEFAULT NULL,
        about_me TEXT DEFAULT NULL,
        profile_image VARCHAR(255) DEFAULT NULL,

        password_hash VARCHAR(255) NOT NULL,

        role ENUM(
          'owner',
          'worker'
        ) NOT NULL DEFAULT 'worker',

        is_active BOOLEAN NOT NULL DEFAULT TRUE,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log("Users table created successfully.");
    console.log("Roles: owner, admin, worker, customer.");
    console.log("FreshMarket database setup completed.");

  } catch (error) {
    console.error("Database setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createDatabase();
