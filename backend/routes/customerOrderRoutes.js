
const express = require("express");
const router = express.Router();

const {
  createCustomerOrder,
} = require("../controllers/customerOrderController");

const {
  uploadReceipt,
} = require("../middleware/customerOrderUpload");

router.post("/", (req, res, next) => {
  uploadReceipt(req, res, (error) => {
    if (error) {
      const statusCode =
        error.code === "LIMIT_FILE_SIZE" ||
        error.code === "LIMIT_FILE_COUNT"
          ? 400
          : 400;

      return res.status(statusCode).json({
        success: false,
        message: error.message || "Receipt upload failed.",
      });
    }

    next();
  });
}, createCustomerOrder);

module.exports = router;
