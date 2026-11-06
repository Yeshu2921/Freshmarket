
const express = require("express");

const {
  getPublicCategories,
  getAllCategories,
  getParentCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
} = require("../controllers/categoryController");

const {
  requireAuth,
  requireOwner,
  requireOwnerOrWorker,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ============================================
// PUBLIC CATEGORY ROUTE
// GET /api/categories/public
// Visitors can view active shopping categories
// without logging in.
// IMPORTANT: Keep this before router.use(requireAuth).
// ============================================
router.get("/public", getPublicCategories);

// ============================================
// PROTECTED CATEGORY ROUTES
// All routes below require authentication.
// ============================================
router.use(requireAuth);

// Owners and workers can view categories.
router.get("/parents", requireOwnerOrWorker, getParentCategories);
router.get("/", requireOwnerOrWorker, getAllCategories);

// Only owners can manage categories.
router.post("/", requireOwner, createCategory);
router.put("/:id", requireOwner, updateCategory);
router.patch("/:id/status", requireOwner, updateCategoryStatus);
router.delete("/:id", requireOwner, deleteCategory);

module.exports = router;
