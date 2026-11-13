
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const PROFILE_PHOTO_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "uploads",
  "profiles"
);

const ALLOWED_SEX_VALUES = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
];

const PASSWORD_RESET_EXPIRY_MINUTES = 15;

// ======================================================
// PUBLIC USER DATA
// ======================================================

function getPublicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    phone: user.phone,
    address: user.address,
    sex: user.sex,
    about_me: user.about_me,
    profile_image: user.profile_image,
    role: user.role,
    is_active: Boolean(user.is_active),
    created_at: user.created_at,
  };
}

// ======================================================
// FIND USER
// ======================================================

async function findUserById(userId) {
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
       created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

// ======================================================
// PASSWORD RESET TOKEN ID GENERATOR
// TiDB requires an explicit ID in password_reset_tokens.
// ======================================================

async function generatePasswordResetTokenId() {
  const [result] = await db.execute(
    "INSERT INTO password_reset_token_id_generator () VALUES ()"
  );

  if (!result.insertId) {
    throw new Error("Unable to generate password reset token ID.");
  }

  return result.insertId;
}

// ======================================================
// PASSWORD VALIDATION
// ======================================================

function validatePassword(password) {
  if (typeof password !== "string") {
    return "A password is required.";
  }

  if (password.length < 8 || password.length > 50) {
    return "Your password must be between 8 and 50 characters.";
  }

  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return (
      "Use at least one lowercase letter, uppercase letter, " +
      "number, and symbol."
    );
  }

  return null;
}

// ======================================================
// ESCAPE HTML FOR EMAIL
// ======================================================

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });
}

// ======================================================
// DELETE OLD PROFILE PHOTO
// ======================================================

async function removeOldProfilePhoto(photoPath) {
  if (!photoPath || typeof photoPath !== "string") return;

  let filename;

  if (photoPath.startsWith("/uploads/profiles/")) {
    filename = photoPath.slice("/uploads/profiles/".length);
  } else if (
    !photoPath.includes("/") &&
    !photoPath.includes("\\")
  ) {
    filename = photoPath;
  } else {
    return;
  }

  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    path.basename(filename) !== filename
  ) {
    return;
  }

  const fullPath = path.resolve(
    PROFILE_PHOTO_DIRECTORY,
    filename
  );

  if (path.dirname(fullPath) !== PROFILE_PHOTO_DIRECTORY) {
    return;
  }

  try {
    await fs.promises.unlink(fullPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "Unable to remove profile photo:",
        error.message
      );
    }
  }
}

// ======================================================
// LOGIN
// POST /api/auth/login
// ======================================================

async function login(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const password = req.body?.password;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const [users] = await db.execute(
      `SELECT
         id,
         first_name,
         last_name,
         email,
         password_hash,
         role,
         is_active
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!users.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact the owner.",
      });
    }

    if (!["owner", "worker"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "This account cannot access staff login.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from .env");

      return res.status(500).json({
        success: false,
        message: "Authentication is not configured.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const fullUser = await findUserById(user.id);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: getPublicUser(fullUser),
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during login.",
    });
  }
}

// ======================================================
// GET PROFILE
// GET /api/auth/profile
// ======================================================

async function getMyProfile(req, res) {
  try {
    const user = await findUserById(req.user.id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: "Your account is unavailable. Please log in again.",
      });
    }

    return res.json({
      success: true,
      user: getPublicUser(user),
    });
  } catch (error) {
    console.error("Get profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load your profile.",
    });
  }
}

// ======================================================
// UPDATE PROFILE
// PUT /api/auth/profile
// ======================================================

async function updateMyProfile(req, res) {
  try {
    const firstName = String(req.body?.first_name || "").trim();
    const lastName = String(req.body?.last_name || "").trim();

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const phone = String(req.body?.phone || "").trim();
    const address = String(req.body?.address || "").trim();
    const aboutMe = String(req.body?.about_me || "").trim();

    const sexInput = req.body?.sex;
    const sex =
      sexInput == null || sexInput === ""
        ? null
        : String(sexInput);

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, and email are required.",
      });
    }

    if (firstName.length > 100 || lastName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Names must not exceed 100 characters.",
      });
    }

    if (
      email.length > 190 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (phone.length > 30 || address.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Phone or address is too long.",
      });
    }

    if (sex !== null && !ALLOWED_SEX_VALUES.includes(sex)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid sex option.",
      });
    }

    if (aboutMe.length > 10000) {
      return res.status(400).json({
        success: false,
        message: "About me is too long.",
      });
    }

    const [existing] = await db.execute(
      `SELECT id
       FROM users
       WHERE email = ? AND id <> ?
       LIMIT 1`,
      [email, req.user.id]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "That email address is already used by another account.",
      });
    }

    await db.execute(
      `UPDATE users
       SET first_name = ?,
           last_name = ?,
           email = ?,
           phone = ?,
           address = ?,
           sex = ?,
           about_me = ?
       WHERE id = ?`,
      [
        firstName,
        lastName,
        email,
        phone || null,
        address || null,
        sex,
        aboutMe || null,
        req.user.id,
      ]
    );

    const user = await findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: getPublicUser(user),
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "That email address is already used by another account.",
      });
    }

    console.error("Update profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update your profile.",
    });
  }
}

// ======================================================
// UPLOAD PROFILE PHOTO
// POST /api/auth/profile-photo
// ======================================================

async function uploadMyProfilePhoto(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a profile image.",
      });
    }

    const user = await findUserById(req.user.id);

    if (!user || !user.is_active) {
      await removeOldProfilePhoto(req.file.filename);

      return res.status(401).json({
        success: false,
        message: "Your account is unavailable. Please log in again.",
      });
    }

    const newPhotoPath = `/uploads/profiles/${req.file.filename}`;

    await db.execute(
      "UPDATE users SET profile_image = ? WHERE id = ?",
      [newPhotoPath, req.user.id]
    );

    if (
      user.profile_image &&
      user.profile_image !== newPhotoPath &&
      user.profile_image.startsWith("/uploads/profiles/")
    ) {
      await removeOldProfilePhoto(user.profile_image);
    }

    const updatedUser = await findUserById(req.user.id);

    return res.json({
      success: true,
      message: "Profile photo updated successfully.",
      user: getPublicUser(updatedUser),
    });
  } catch (error) {
    if (req.file?.filename) {
      await removeOldProfilePhoto(req.file.filename);
    }

    console.error("Upload profile photo error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to upload your profile photo.",
    });
  }
}

// ======================================================
// CHANGE PASSWORD
// POST /api/auth/change-password
// ======================================================

async function changeMyPassword(req, res) {
  try {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword;

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
      });
    }

    if (
      typeof confirmPassword !== "string" ||
      newPassword !== confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "Your new password must differ from your current password.",
      });
    }

    const [rows] = await db.execute(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      rows[0].password_hash
    );

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message: "Your current password is incorrect.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [hashedPassword, req.user.id]
    );

    return res.json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to change your password.",
    });
  }
}

// ======================================================
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// ======================================================

async function forgotPassword(req, res) {
  const genericMessage =
    "If an eligible account exists for that email, a password-reset link will be sent.";

  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (
      !email ||
      email.length > 190 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const [users] = await db.execute(
      `SELECT id, first_name, last_name, email, role, is_active
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    // Do not disclose whether an email belongs to an account.
    if (
      !users.length ||
      !users[0].is_active ||
      !["owner", "worker"].includes(users[0].role)
    ) {
      return res.json({
        success: true,
        message: genericMessage,
      });
    }

    if (
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS ||
      !process.env.FRONTEND_URL
    ) {
      console.error("Password-reset email settings are missing.");

      return res.status(500).json({
        success: false,
        message: "Email recovery is not configured. Contact the administrator.",
      });
    }

    const user = users[0];

    // Generate a cryptographically secure, single-use token.
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Store only the token hash in the database.
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000
    );

    // Invalidate previous unused reset tokens.
    await db.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );

    // Generate explicit TiDB ID.
    const resetTokenId = await generatePasswordResetTokenId();

    // Insert reset token with its generated ID.
    await db.execute(
      `INSERT INTO password_reset_tokens
         (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [resetTokenId, user.id, tokenHash, expiresAt]
    );

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL.replace(/\/+$/, "");

    const resetUrl =
      `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const displayName =
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      "FreshMart user";

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: "FreshMart password reset",

        text:
          `Hello ${displayName},\n\n` +
          "A password-reset request was made for your FreshMart account.\n\n" +
          `Use this link within ${PASSWORD_RESET_EXPIRY_MINUTES} minutes:\n` +
          `${resetUrl}\n\n` +
          "If you did not request this, you can ignore this email.",

        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#24332a">
            <h2 style="color:#198754">FreshMart Password Reset</h2>
            <p>Hello ${escapeHtml(displayName)},</p>
            <p>A password-reset request was made for your FreshMart account.</p>
            <p>
              <a href="${escapeHtml(resetUrl)}"
                 style="display:inline-block;padding:12px 20px;background:#198754;color:#fff;text-decoration:none;border-radius:6px">
                Reset Password
              </a>
            </p>
            <p>This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes and can only be used once.</p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `,
      });
    } catch (emailError) {
      // Invalidate the token if email delivery fails.
      await db.execute(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE token_hash = ? AND used_at IS NULL`,
        [tokenHash]
      );

      throw emailError;
    }

    return res.json({
      success: true,
      message: genericMessage,
    });
  } catch (error) {
    console.error("Forgot password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to process the password-reset request right now.",
    });
  }
}

// ======================================================
// RESET PASSWORD
// POST /api/auth/reset-password
// ======================================================

async function resetPassword(req, res) {
  let connection;
  let transactionStarted = false;

  try {
    const token = req.body?.token;
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/i.test(token)
    ) {
      return res.status(400).json({
        success: false,
        message: "The reset link is invalid or expired. Request a new one.",
      });
    }

    if (
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation are required.",
      });
    }

    const passwordError = validatePassword(newPassword);

    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    connection = await db.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [tokens] = await connection.execute(
      `SELECT
         pr.id AS reset_id,
         pr.user_id,
         u.role,
         u.is_active
       FROM password_reset_tokens pr
       INNER JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = ?
         AND pr.used_at IS NULL
         AND pr.expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (
      !tokens.length ||
      !tokens[0].is_active ||
      !["owner", "worker"].includes(tokens[0].role)
    ) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "The reset link is invalid or expired. Request a new one.",
      });
    }

    const resetRecord = tokens[0];

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await connection.execute(
      `UPDATE users
       SET password_hash = ?
       WHERE id = ?`,
      [hashedPassword, resetRecord.user_id]
    );

    // Mark all unused reset tokens for this account as used.
    await connection.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [resetRecord.user_id]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Password-reset rollback error:",
          rollbackError.message
        );
      }
    }

    console.error("Reset password error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to reset the password right now. Please try again.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// ======================================================
// EXPORT ALL CONTROLLERS
// ======================================================

module.exports = {
  login,
  getMyProfile,
  updateMyProfile,
  uploadMyProfilePhoto,
  changeMyPassword,
  forgotPassword,
  resetPassword,
};
