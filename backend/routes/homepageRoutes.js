
const express = require("express");
const router = express.Router();

const homepageUpload = require("../middleware/homepageUpload");

const {
  getBanner,
  updateBanner,
  getHomepagePosts,
  createHomepagePost,
  deleteHomepagePost,
} = require("../controllers/homepageController");

const {
  requireAuth,
} = require("../middleware/authMiddleware");

// Public customer routes.
router.get("/banner", getBanner);
router.get("/posts", getHomepagePosts);

// Owner-only routes.
router.post(
  "/banner",
  requireAuth,
  requireOwner,
  homepageUpload.single("image"),
  updateBanner
);

router.post(
  "/posts",
  requireAuth,
  requireOwner,
  homepageUpload.single("image"),
  createHomepagePost
);

router.delete(
  "/posts/:id",
  requireAuth,
  requireOwner,
  deleteHomepagePost
);

// Verify the authenticated account is an owner.
function requireOwner(req, res, next) {
  if (String(req.user?.role || "").toLowerCase() !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Only the owner can manage homepage images.",
    });
  }

  next();
}

module.exports = router;
