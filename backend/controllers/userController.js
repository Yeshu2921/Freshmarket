
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");

const allowedRoles = ["owner", "worker"];
const allowedSexes = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
];

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

  // Securely shuffle the characters.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

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
    profile_image: user.profile_image,
    role: user.role,
    is_active: Boolean(user.is_active),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

// GET /api/users
async function getUsers(req, res) {
  try {
    const [rows] = await db.execute(
      `SELECT
         id, first_name, last_name, sex, email,
         phone, address, about_me, profile_image,
         role, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC, id DESC`
    );

    return res.json({
      success: true,
      users: rows.map(publicUser),
      total: rows.length,
    });
  } catch (error) {
    console.error("Get users error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load users.",
    });
  }
}

// POST /api/users
async function createUser(req, res) {
  try {
    const firstName = String(req.body?.first_name || "").trim();
    const lastName = String(req.body?.last_name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim() || null;
    const address = String(req.body?.address || "").trim() || null;
    const aboutMe = String(req.body?.about_me || "").trim() || null;
    const role = String(req.body?.role || "worker").trim();

    const sex = normalizeSex(req.body?.sex);

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, and email are required.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be owner or worker.",
      });
    }

    if (firstName.length > 100 || lastName.length > 100 ||
        email.length > 190 || (phone && phone.length > 30) ||
        (address && address.length > 255)) {
      return res.status(400).json({
        success: false,
        message: "One or more fields exceed the allowed length.",
      });
    }

    // If no password was supplied, generate a strong temporary one.
    let password = req.body?.password;
    let generatedPassword = false;

    if (password === undefined || password === null || password === "") {
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

    const [result] = await db.execute(
      `INSERT INTO users (
         first_name, last_name, sex, email, phone, address,
         about_me, password_hash, role, is_active
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
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

    const [rows] = await db.execute(
      `SELECT
         id, first_name, last_name, sex, email,
         phone, address, about_me, profile_image,
         role, is_active, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      user: publicUser(rows[0]),
      ...(generatedPassword ? { temporaryPassword: password } : {}),
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Create user error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create user.",
    });
  }
}

// PUT /api/users/:id
async function updateUser(req, res) {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [targets] = await connection.execute(
      `SELECT id, role, is_active
       FROM users WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (!targets.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const target = targets[0];
    const body = req.body || {};

    const firstName =
      body.first_name === undefined
        ? undefined
        : String(body.first_name).trim();

    const lastName =
      body.last_name === undefined
        ? undefined
        : String(body.last_name).trim();

    const email =
      body.email === undefined
        ? undefined
        : String(body.email).trim().toLowerCase();

    const phone =
      body.phone === undefined
        ? undefined
        : String(body.phone).trim() || null;

    const address =
      body.address === undefined
        ? undefined
        : String(body.address).trim() || null;

    const aboutMe =
      body.about_me === undefined
        ? undefined
        : String(body.about_me).trim() || null;

    const sex = normalizeSex(body.sex);
    const role = body.role === undefined
      ? target.role
      : String(body.role).trim();

    if (firstName !== undefined && !firstName) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "First name cannot be empty.",
      });
    }

    if (lastName !== undefined && !lastName) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Last name cannot be empty.",
      });
    }

    if (
      email !== undefined &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (body.sex !== undefined && sex === undefined) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid sex selection.",
      });
    }

    if (!allowedRoles.includes(role)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Role must be owner or worker.",
      });
    }

    if (
      (firstName !== undefined && firstName.length > 100) ||
      (lastName !== undefined && lastName.length > 100) ||
      (email !== undefined && email.length > 190) ||
      (phone && phone.length > 30) ||
      (address && address.length > 255)
    ) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "One or more fields exceed the allowed length.",
      });
    }

    if (id === Number(req.user.id) && role !== target.role) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role.",
      });
    }

    if (target.role === "owner" && target.is_active && role !== "owner") {
      const [owners] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'owner' AND is_active = TRUE
         FOR UPDATE`
      );

      if (owners.length <= 1) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "The last active owner cannot be demoted.",
        });
      }
    }

    await connection.execute(
      `UPDATE users SET
         first_name = COALESCE(?, first_name),
         last_name = COALESCE(?, last_name),
         sex = CASE WHEN ? = 1 THEN ? ELSE sex END,
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         address = COALESCE(?, address),
         about_me = COALESCE(?, about_me),
         role = ?
       WHERE id = ?`,
      [
        firstName ?? null,
        lastName ?? null,
        body.sex !== undefined ? 1 : 0,
        sex,
        email ?? null,
        phone === undefined ? null : phone,
        address === undefined ? null : address,
        aboutMe ?? null,
        role,
        id,
      ]
    );

    await connection.commit();

    const [rows] = await db.execute(
      `SELECT id, first_name, last_name, sex, email, phone,
              address, about_me, profile_image, role, is_active,
              created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );

    return res.json({
      success: true,
      message: "User updated successfully.",
      user: publicUser(rows[0]),
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Update user error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update user.",
    });
  } finally {
    connection.release();
  }
}

// PATCH /api/users/:id/status
async function updateUserStatus(req, res) {
  const id = Number(req.params.id);
  const value = req.body?.isActive ?? req.body?.is_active;

  if (!Number.isSafeInteger(id) || id < 1) {
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

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [targets] = await connection.execute(
      `SELECT id, role, is_active FROM users
       WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (!targets.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const target = targets[0];

    if (
      target.role === "owner" &&
      target.is_active &&
      value === false
    ) {
      const [owners] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'owner' AND is_active = TRUE
         FOR UPDATE`
      );

      if (owners.length <= 1) {
        await connection.rollback();
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

    return res.json({
      success: true,
      message: `User ${value ? "activated" : "deactivated"} successfully.`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Update user status error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update user status.",
    });
  } finally {
    connection.release();
  }
}

// DELETE /api/users/:id
async function deleteUser(req, res) {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
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

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [targets] = await connection.execute(
      `SELECT id, role, is_active FROM users
       WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (!targets.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const target = targets[0];

    if (target.role === "owner" && target.is_active) {
      const [owners] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'owner' AND is_active = TRUE
         FOR UPDATE`
      );

      if (owners.length <= 1) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "The last active owner cannot be deleted.",
        });
      }
    }

    await connection.execute("DELETE FROM users WHERE id = ?", [id]);
    await connection.commit();

    return res.json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Delete user error:", error.message);

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
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
    connection.release();
  }
}

// POST /api/users/:id/reset-password
async function resetPassword(req, res) {
  const id = Number(req.params.id);
  const password = req.body?.password;

  if (!Number.isSafeInteger(id) || id < 1) {
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
      "UPDATE users SET password_hash = ? WHERE id = ?",
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
    console.error("Reset password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password.",
    });
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  resetPassword,
};
