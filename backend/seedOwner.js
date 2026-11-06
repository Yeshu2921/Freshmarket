
require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./db");

async function seedOwner() {
  const firstName = process.env.OWNER_FIRST_NAME;
  const lastName = process.env.OWNER_LAST_NAME;
  const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;

  if (!firstName || !lastName || !email || !password) {
    throw new Error(
      "Set OWNER_FIRST_NAME, OWNER_LAST_NAME, OWNER_EMAIL, and OWNER_PASSWORD in .env"
    );
  }

  if (password.length < 12) {
    throw new Error("Use a temporary owner password of at least 12 characters.");
  }

  const [existingUsers] = await db.execute(
    "SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  if (existingUsers.length > 0) {
    const existing = existingUsers[0];

    if (existing.role !== "owner") {
      throw new Error(
        "The configured owner email already belongs to a non-owner account. Use a different email or review the account manually."
      );
    }

    console.log(
      `An owner account already exists for ${email}. Its password was not changed.`
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.execute(
    `INSERT INTO users
      (first_name, last_name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, 'owner', TRUE)`,
    [firstName, lastName, email, passwordHash]
  );

  console.log(`Initial owner account created for ${email}.`);
}

seedOwner()
  .catch((error) => {
    console.error("Owner setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
