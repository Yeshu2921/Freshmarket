
const express = require("express");
const multer = require("multer");

const {
  login,
  getMyProfile,
  updateMyProfile,
  uploadMyProfilePhoto,
  changeMyPassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const { requireAuth } = require("../middleware/authMiddleware");
const uploadProfilePhoto = require("../middleware/uploadProfilePhoto");

const router = express.Router();


// LOGIN
// POST /api/auth/login

router.post("/login", login);


// FORGOT PASSWORD
// POST /api/auth/forgot-password
// ========================================
router.post("/forgot-password", forgotPassword);

// ========================================
// RESET PASSWORD
// POST /api/auth/reset-password

router.post("/reset-password", resetPassword);

// PERSONAL PROFILe

// GET /api/auth/profile
router.get("/profile", requireAuth, getMyProfile);

// PUT /api/auth/profile
router.put("/profile", requireAuth, updateMyProfile);

// ========================================
// UPLOAD PROFILE PHOTO
// POST /api/auth/profile-photo
// FormData field: profile_image
// ========================================
router.post(
  "/profile-photo",
  requireAuth,
  (req, res, next) => {
    uploadProfilePhoto.single("profile_image")(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "Profile image must not exceed 5 MB."
            : "Unable to process the uploaded image.";

        return res.status(400).json({
          success: false,
          message,
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "Invalid profile image.",
      });
    });
  },
  uploadMyProfilePhoto
);


// CHANGE PASSWORD
// POST /api/auth/change-password
// Requires authentication

router.post("/change-password", requireAuth, changeMyPassword);

module.exports = router;
