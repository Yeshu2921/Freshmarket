
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db = require("../db");

let io = null;

// =============================================
// INITIALIZE SOCKET.IO
// =============================================

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5133",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authenticate every socket connection.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!token || !process.env.JWT_SECRET) {
        return next(new Error("Authentication required."));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded.id) {
        return next(new Error("Invalid authentication token."));
      }

      // Check that the user still exists and is active.
      const [users] = await db.execute(
        `
        SELECT id, first_name, last_name, role, profile_image, is_active
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [decoded.id]
      );

      if (!users.length || !users[0].is_active) {
        return next(new Error("Your account is unavailable."));
      }

      socket.user = users[0];

      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Invalid or expired authentication token."));
    }
  });

  // =============================================
  // CONNECTION
  // =============================================

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    // Each user joins their own private room.
    socket.join(`user:${userId}`);

    console.log(
      `Socket connected: ${socket.user.first_name} (${userId})`
    );

    socket.emit("socket:ready", {
      success: true,
      userId,
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `Socket disconnected: ${userId} - ${reason}`
      );
    });
  });

  return io;
}

// =============================================
// GET SOCKET.IO INSTANCE
// =============================================

function getIO() {
  if (!io) {
    throw new Error("Socket.IO has not been initialized.");
  }

  return io;
}

// =============================================
// SEND EVENT TO ONE USER
// =============================================

function emitToUser(userId, event, data) {
  if (!io) {
    console.warn("Socket.IO is not initialized.");
    return;
  }

  io.to(`user:${userId}`).emit(event, data);
}

// =============================================
// EXPORTS
// =============================================

module.exports = {
  initializeSocket,
  getIO,
  emitToUser,
};
