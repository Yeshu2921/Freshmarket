
const express = require("express");

const {
  getAllBrands,
  createBrand,
  updateBrand,
  updateBrandStatus,
  deleteBrand,
} = require("../controllers/brandController");

const {
  requireAuth,
  requireOwner,
  requireOwnerOrWorker,
} = require("../middleware/authMiddleware");

const router = express.Router();

// All brand endpoints require authentication.
router.use(requireAuth);

// Owners and workers can view brands.
router.get("/", requireOwnerOrWorker, getAllBrands);

// Only owners can manage brands.
router.post("/", requireOwner, createBrand);
router.put("/:id", requireOwner, updateBrand);
router.patch("/:id/status", requireOwner, updateBrandStatus);
router.delete("/:id", requireOwner, deleteBrand);

module.exports = router;
