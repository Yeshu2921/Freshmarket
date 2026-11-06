const express = require("express");
const router = express.Router();

const {
  getCustomerOrderHistory,
} = require("../controllers/customerOrderHistoryController");

router.post("/lookup", getCustomerOrderHistory);

module.exports = router;