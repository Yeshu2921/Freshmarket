
const express = require("express");
const router = express.Router();

const {
  getPublicProducts,
  getPublicProductById,
} = require("../controllers/customerProductController");

// These endpoints are public; do not add requireAuth here.
router.get("/", getPublicProducts);
router.get("/:id", getPublicProductById);

module.exports = router;
