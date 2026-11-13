
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");

// =============================================
// CONFIGURATION
// =============================================

const allowedRoles = ["owner", "worker"];

const allowedSexes = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
];

// =============================================
// PASSWORD HELPERS
// =============================================

function strongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 50 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function generateStrongPassword() {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%&*_-+?";
  const all = lower + upper + numbers + symbols;

  const pick = (chars) =>
    chars[crypto.randomInt(0, chars.length)];

  const chars = [
    pick(lower),
    pick(upper),
    pick(numbers),
    pick(symbols),
  ];

  while (chars.length < 16) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

// =============================================
// GENERAL HELPERS
// =============================================

function normalizeSex(value) {
  if (value === "" || value === undefined || value === null) {
    return null;
  }

  return allowedSexes.includes(value) ? value : undefined;
}

function parseActive(value) {
  return value === true || value === 1 || value === "1";
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: `${user.first_name} ${user.last_name}`,
    sex: user.sex,
    email: user.email,
    phone: user.phone,
    address: user.address,
    about_me: user.about_me,
    profile_image: user.profile_image || null,
    role: user.role,
    is_active: parseActive(user.is_active),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function rollbackSafely(connection, transactionStarted) {
  if (!connection || !transactionStarted) {
    return Promise.resolve();
  }

  return connection.rollback().catch((error) => {
    console.error("Transaction rollback error:", error.message);
  });
}

// =============================================
// GET ALL USERS
// GET /api/users
// =============================================

async function getUsers(req, res) {
  try {
    const [rows] = await db.execute(
      `SELECT
         id,
         first_name,
         last_name,
         sex,
         email,
         phone,
         address,
         about_me,
         profile_image,
         role,
         is_active,
         created_at,
         updated_at
       FROM users
       ORDER BY created_at DESC, id DESC`
    );

    return res.json({
      success: true,
      users: rows.map(publicUser),
      total: rows.length,
    });
  } catch (error) {
    console.error("Get users error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load users.",
    });
  }
}

// =============================================
// CREATE USER
// POST /api/users
//
// Uses user_id_generator because users.id
// is not AUTO_INCREMENT.
// =============================================

async function createUser(req, res) {
  let connection;
  let transactionStarted = false;

  try {
    const firstName = String(req.body?.first_name || "").trim();
    const lastName = String(req.body?.last_name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();

    const phone =
      String(req.body?.phone || "").trim() || null;

    const address =
      String(req.body?.address || "").trim() || null;

    const aboutMe =
      String(req.body?.about_me || "").trim() || null;

    const sex = normalizeSex(req.body?.sex);

    const role = String(req.body?.role || "worker").trim();

    // Validate required fields.
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, and email are required.",
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (sex === undefined) {
      return res.status(400).json({
        success: false,
        message: "Invalid sex selection.",
      });
    }

    // Owners create worker accounts only.
    if (role !== "worker") {
      return res.status(400).json({
        success: false,
        message: "New accounts can only be created with the worker role.",
      });
    }

    if (
      firstName.length > 100 ||
      lastName.length > 100 ||
      email.length > 190 ||
      (phone && phone.length > 30) ||
      (address && address.length > 255)
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more fields exceed the allowed length.",
      });
    }

    // Generate a temporary password if not provided.
    let password = req.body?.password;
    let generatedPassword = false;

    if (
      password === undefined ||
      password === null ||
      password === ""
    ) {
      password = generateStrongPassword();
      generatedPassword = true;
    } else if (!strongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8–50 characters and include uppercase, lowercase, a number, and a symbol.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Generate a unique ID from user_id_generator.
    const [sequenceResult] = await connection.execute(
      `INSERT INTO user_id_generator () VALUES ()`
    );

    const newUserId = Number(sequenceResult.insertId);

    if (!validId(newUserId)) {
      throw new Error("Unable to generate a valid user ID.");
    }

    // Insert the user using the generated ID.
    await connection.execute(
      `INSERT INTO users (
         id,
         first_name,
         last_name,
         sex,
         email,
         phone,
         address,
         about_me,
         password_hash,
         role,
         is_active
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        newUserId,
        firstName,
        lastName,
        sex,
        email,
        phone,
        address,
        aboutMe,
        passwordHash,
        role,
      ]
    );

    const [rows] = await connection.execute(
      `SELECT
         id,
         first_name,
         last_name,
         sex,
         email,
         phone,
         address,
         about_me,
         profile_image,
         role,
         is_active,
         created_at,
         updated_at
       FROM users
       WHERE id = ?`,
      [newUserId]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      user: publicUser(rows[0]),
      ...(generatedPassword
        ? { temporaryPassword: password }
        : {}),
    });
  } catch (error) {
    await rollbackSafely(connection, transactionStarted);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Create user error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create user.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// =============================================
// UPDATE USER
// PUT /api/users/:id
// =============================================

async function updateUser(req, res) {
  const id = Number(req.params.id);

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [targets] = await connection.execute(
      `SELECT id, role, is_active
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!targets.length) {
      await rollbackSafely(connection, transactionStarted);
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const target = targets[0];
    const body = req.body || {};

    const updates = [];
    const values = [];

    // First name.
    if (body.first_name !== undefined) {
      const firstName = String(body.first_name).trim();

      if (!firstName || firstName.length > 100) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Please provide a valid first name.",
        });
      }

      updates.push("first_name = ?");
      values.push(firstName);
    }

    // Last name.
    if (body.last_name !== undefined) {
      const lastName = String(body.last_name).trim();

      if (!lastName || lastName.length > 100) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Please provide a valid last name.",
        });
      }

      updates.push("last_name = ?");
      values.push(lastName);
    }

    // Email.
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();

      if (!validEmail(email) || email.length > 190) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address.",
        });
      }

      updates.push("email = ?");
      values.push(email);
    }

    // Sex.
    if (body.sex !== undefined) {
      const sex = normalizeSex(body.sex);

      if (sex === undefined) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Invalid sex selection.",
        });
      }

      updates.push("sex = ?");
      values.push(sex);
    }

    // Phone: an empty value clears the field.
    if (body.phone !== undefined) {
      const phone = String(body.phone || "").trim() || null;

      if (phone && phone.length > 30) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Phone number cannot exceed 30 characters.",
        });
      }

      updates.push("phone = ?");
      values.push(phone);
    }

    // Address: an empty value clears the field.
    if (body.address !== undefined) {
      const address = String(body.address || "").trim() || null;

      if (address && address.length > 255) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Address cannot exceed 255 characters.",
        });
      }

      updates.push("address = ?");
      values.push(address);
    }

    // About me: an empty value clears the field.
    if (body.about_me !== undefined) {
      const aboutMe = String(body.about_me || "").trim() || null;

      updates.push("about_me = ?");
      values.push(aboutMe);
    }

    // Role.
    const role =
      body.role === undefined
        ? target.role
        : String(body.role).trim();

    if (!allowedRoles.includes(role)) {
      await rollbackSafely(connection, transactionStarted);
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Role must be owner or worker.",
      });
    }

    // A worker cannot be promoted through this account-management flow.
    if (target.role === "worker" && role === "owner") {
      await rollbackSafely(connection, transactionStarted);
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "Workers cannot be promoted to owner through this form.",
      });
    }

    if (id === Number(req.user.id) && role !== target.role) {
      await rollbackSafely(connection, transactionStarted);
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "You cannot change your own role.",
      });
    }

    if (
      target.role === "owner" &&
      parseActive(target.is_active) &&
      role !== "owner"
    ) {
      const [owners] = await connection.execute(
        `SELECT id
         FROM users
         WHERE role = 'owner'
           AND is_active = TRUE
         FOR UPDATE`
      );

      if (owners.length <= 1) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The last active owner cannot be demoted.",
        });
      }
    }

    if (role !== target.role) {
      updates.push("role = ?");
      values.push(role);
    }

    if (updates.length > 0) {
      values.push(id);

      await connection.execute(
        `UPDATE users
         SET ${updates.join(", ")}
         WHERE id = ?`,
        values
      );
    }

    const [rows] = await connection.execute(
      `SELECT
         id,
         first_name,
         last_name,
         sex,
         email,
         phone,
         address,
         about_me,
         profile_image,
         role,
         is_active,
         created_at,
         updated_at
       FROM users
       WHERE id = ?`,
      [id]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "User updated successfully.",
      user: publicUser(rows[0]),
    });
  } catch (error) {
    await rollbackSafely(connection, transactionStarted);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Update user error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update user.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// =============================================
// ACTIVATE / DEACTIVATE USER
// PATCH /api/users/:id/status
// =============================================

async function updateUserStatus(req, res) {
  const id = Number(req.params.id);

  const value = req.body?.isActive ?? req.body?.is_active;

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  if (typeof value !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isActive must be true or false.",
    });
  }

  if (id === Number(req.user.id) && value === false) {
    return res.status(400).json({
      success: false,
      message: "You cannot deactivate your own account.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [targets] = await connection.execute(
      `SELECT id, role, is_active
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!targets.length) {
      await rollbackSafely(connection, transactionStarted);
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const target = targets[0];

    if (
      target.role === "owner" &&
      parseActive(target.is_active) &&
      value === false
    ) {
      const [owners] = await connection.execute(
        `SELECT id
         FROM users
         WHERE role = 'owner'
           AND is_active = TRUE
         FOR UPDATE`
      );

      if (owners.length <= 1) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The last active owner cannot be deactivated.",
        });
      }
    }

    await connection.execute(
      "UPDATE users SET is_active = ? WHERE id = ?",
      [value, id]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: `User ${value ? "activated" : "deactivated"} successfully.`,
    });
  } catch (error) {
    await rollbackSafely(connection, transactionStarted);

    console.error("Update user status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update user status.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// =============================================
// DELETE USER
// DELETE /api/users/:id
// =============================================

async function deleteUser(req, res) {
  const id = Number(req.params.id);

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  if (id === Number(req.user.id)) {
    return res.status(400).json({
      success: false,
      message: "You cannot delete your own account.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [targets] = await connection.execute(
      `SELECT id, role, is_active
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!targets.length) {
      await rollbackSafely(connection, transactionStarted);
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const target = targets[0];

    if (
      target.role === "owner" &&
      parseActive(target.is_active)
    ) {
      const [owners] = await connection.execute(
        `SELECT id
         FROM users
         WHERE role = 'owner'
           AND is_active = TRUE
         FOR UPDATE`
      );

      if (owners.length <= 1) {
        await rollbackSafely(connection, transactionStarted);
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "The last active owner cannot be deleted.",
        });
      }
    }

    await connection.execute(
      "DELETE FROM users WHERE id = ?",
      [id]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    await rollbackSafely(connection, transactionStarted);

    console.error("Delete user error:", error);

    if (
      error.code === "ER_ROW_IS_REFERENCED_2" ||
      error.code === "ER_ROW_IS_REFERENCED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This user is referenced by other records and cannot be deleted. Deactivate the account instead.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to delete user.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// =============================================
// RESET USER PASSWORD
// POST /api/users/:id/reset-password
// =============================================

async function resetPassword(req, res) {
  const id = Number(req.params.id);
  const password = req.body?.password;

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  if (!strongPassword(password)) {
    return res.status(400).json({
      success: false,
      message:
        "Password must be 8–50 characters and include uppercase, lowercase, a number, and a symbol.",
    });
  }

  if (id === Number(req.user.id)) {
    return res.status(400).json({
      success: false,
      message: "Use your account's own password-change process.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `UPDATE users
       SET password_hash = ?
       WHERE id = ?`,
      [passwordHash, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset user password.",
    });
  }
}

// =============================================
// EXPORT CONTROLLERS
// =============================================

module.exports = {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  resetPassword,
};
