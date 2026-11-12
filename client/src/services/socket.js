
import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5134";

let socket = null;

// =============================================
// CONNECT SOCKET
// =============================================

export function connectSocket() {
  const token = sessionStorage.getItem("freshmartToken");

  if (!token) {
    console.warn("Socket connection skipped: no login token.");
    return null;
  }

  if (socket?.connected) {
    return socket;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }

  socket.auth = {
    token,
  };

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

// =============================================
// GET SOCKET INSTANCE
// =============================================

export function getSocket() {
  return socket;
}

// =============================================
// DISCONNECT SOCKET
// =============================================

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// =============================================
// CHECK CONNECTION
// =============================================

export function isSocketConnected() {
  return Boolean(socket?.connected);
}
