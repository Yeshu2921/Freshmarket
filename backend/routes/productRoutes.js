
const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  requireAuth,
  requireOwner,
  requireOwnerOrWorker,
} = require("../middleware/authMiddleware");

const uploadProductImages = require("../middleware/productupload");

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

// Every product endpoint requires authentication.
router.use(requireAuth);

// Owners and workers can view the product catalog.
router.get("/", requireOwnerOrWorker, getProducts);
router.get("/:id", requireOwnerOrWorker, getProductById);

// Only owners can create products.
router.post(
  "/",
  requireOwner,
  uploadProductImages.array("images", 10),
  createProduct
);

// Only owners can edit products.
router.put(
  "/:id",
  requireOwner,
  uploadProductImages.array("images", 10),
  updateProduct
);

// Only owners can delete products.
router.delete("/:id", requireOwner, deleteProduct);

// Handle image-upload errors.
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each image must be 5 MB or smaller."
        : error.code === "LIMIT_FILE_COUNT"
        ? "You can upload up to 10 images at a time."
        : error.message;

    return res.status(400).json({
      success: false,
      message,
    });
  }

  if (error.message && error.message.startsWith("Only JPG")) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  next(error);
});

module.exports = router;
