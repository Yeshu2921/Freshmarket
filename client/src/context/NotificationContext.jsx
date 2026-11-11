
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  connectSocket,
  disconnectSocket,
  getSocket,
} from "../services/socket";

const NotificationContext = createContext(null);

export function NotificationProvider({ children, user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);

  // =========================================
  // LOAD NOTIFICATIONS
  // =========================================

  const loadNotifications = useCallback(async () => {
    const token = sessionStorage.getItem("freshmartToken");

    if (!token) return;

    try {
      const response = await fetch(
        "http://localhost:5134/api/notifications",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load notifications.");
      }

      setNotifications(data.notifications || []);
      setUnreadNotificationCount(data.unreadCount || 0);
    } catch (error) {
      console.error("Load notifications error:", error);
    }
  }, []);

  // =========================================
  // LOAD UNREAD MESSAGE COUNT
  // =========================================

  const loadUnreadMessagesCount = useCallback(async () => {
    const token = sessionStorage.getItem("freshmartToken");

    if (!token) return;

    try {
      const response = await fetch(
        "http://localhost:5134/api/messages/contacts",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load unread messages.");
      }

      const total = (data.contacts || []).reduce(
        (sum, contact) => sum + Number(contact.unread_count || 0),
        0
      );

      setUnreadMessagesCount(total);
    } catch (error) {
      console.error("Load unread messages error:", error);
    }
  }, []);

  // =========================================
  // REFRESH ALL COUNTS
  // =========================================

  const refreshNotifications = useCallback(async () => {
    await Promise.all([
      loadNotifications(),
      loadUnreadMessagesCount(),
    ]);
  }, [loadNotifications, loadUnreadMessagesCount]);

  // =========================================
  // CONNECT SOCKET AND LISTEN
  // =========================================

  useEffect(() => {
    const token = sessionStorage.getItem("freshmartToken");

    if (!user || !token) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      setUnreadMessagesCount(0);
      setSocketConnected(false);

      disconnectSocket();
      return;
    }

    const socket = connectSocket();

    if (!socket) return;

    refreshNotifications();

    const handleConnect = () => {
      setSocketConnected(true);
      refreshNotifications();
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleNewNotification = (notification) => {
      setNotifications((previous) => {
        if (previous.some((item) => item.id === notification.id)) {
          return previous;
        }

        return [notification, ...previous].slice(0, 50);
      });

      setUnreadNotificationCount((previous) => previous + 1);
    };

    const handleNotificationCount = (count) => {
      setUnreadNotificationCount(Number(count) || 0);
    };

    const handleNewMessage = () => {
      loadUnreadMessagesCount();
    };

    const handleMessageRead = () => {
      loadUnreadMessagesCount();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:count", handleNotificationCount);

    socket.on("message:new", handleNewMessage);
    socket.on("message:read", handleMessageRead);

    setSocketConnected(socket.connected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);

      socket.off("notification:new", handleNewNotification);
      socket.off("notification:count", handleNotificationCount);

      socket.off("message:new", handleNewMessage);
      socket.off("message:read", handleMessageRead);
    };
  }, [
    user,
    refreshNotifications,
    loadUnreadMessagesCount,
  ]);

  // =========================================
  // MARK ONE NOTIFICATION AS READ
  // =========================================

  const markNotificationRead = useCallback(async (id) => {
    const token = sessionStorage.getItem("freshmartToken");

    if (!token) return;

    try {
      const response = await fetch(
        `http://localhost:5134/api/notifications/${id}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not mark notification as read.");
      }

      setNotifications((previous) =>
        previous.map((item) =>
          Number(item.id) === Number(id)
            ? { ...item, is_read: 1 }
            : item
        )
      );

      setUnreadNotificationCount(Number(data.unreadCount) || 0);
    } catch (error) {
      console.error("Mark notification read error:", error);
    }
  }, []);

  // =========================================
  // MARK ALL NOTIFICATIONS AS READ
  // =========================================

  const markAllNotificationsRead = useCallback(async () => {
    const token = sessionStorage.getItem("freshmartToken");

    if (!token) return;

    try {
      const response = await fetch(
        "http://localhost:5134/api/notifications/read-all",
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not mark notifications as read.");
      }

      setNotifications((previous) =>
        previous.map((item) => ({ ...item, is_read: 1 }))
      );

      setUnreadNotificationCount(0);
    } catch (error) {
      console.error("Mark all notifications read error:", error);
    }
  }, []);

  const value = {
    notifications,
    unreadNotificationCount,
    unreadMessagesCount,
    socketConnected,
    loadNotifications,
    loadUnreadMessagesCount,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// =========================================
// CUSTOM HOOK
// =========================================

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used inside NotificationProvider."
    );
  }

  return context;
}
