
const express = require("express");
const router = express.Router();

const homepageUpload = require("../middleware/homepageUpload");

const {
  getBanner,
  updateBanner,
  getLogo,
  updateLogo,
  getHomepagePosts,
  createHomepagePost,
  deleteHomepagePost,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} = require("../controllers/homepageController");

const { requireAuth } = require("../middleware/authMiddleware");

// Verify that the authenticated account is an owner.
function requireOwner(req, res, next) {
  if (String(req.user?.role || "").toLowerCase() !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Only the owner can manage this content.",
    });
  }

  next();
}

// ========================================
// PUBLIC CUSTOMER ROUTES
// ========================================

router.get("/banner", getBanner);
router.get("/logo", getLogo);
router.get("/posts", getHomepagePosts);

// Customers can view active payment methods.
router.get("/payment-methods", getPaymentMethods);

// ========================================
// OWNER-ONLY HOMEPAGE ROUTES
// ========================================

router.post(
  "/banner",
  requireAuth,
  requireOwner,
  homepageUpload.single("image"),
  updateBanner
);

router.post(
  "/logo",
  requireAuth,
  requireOwner,
  homepageUpload.single("image"),
  updateLogo
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

// ========================================
// OWNER-ONLY PAYMENT METHOD ROUTES
// ========================================

router.post(
  "/payment-methods",
  requireAuth,
  requireOwner,
  createPaymentMethod
);

router.put(
  "/payment-methods/:id",
  requireAuth,
  requireOwner,
  updatePaymentMethod
);

router.delete(
  "/payment-methods/:id",
  requireAuth,
  requireOwner,
  deletePaymentMethod
);

module.exports = router;
