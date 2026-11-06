
const express = require("express");

const {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  resetPassword,
} = require("../controllers/userController");

const {
  requireAuth,
  requireOwner,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Every User Management endpoint requires an authenticated owner.
router.use(requireAuth, requireOwner);

router.get("/", getUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.patch("/:id/status", updateUserStatus);
router.delete("/:id", deleteUser);
router.post("/:id/reset-password", resetPassword);

module.exports = router;
