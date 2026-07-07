"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faSpinner,
  faCheckDouble,
  faExclamationTriangle,
  faCircleInfo,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  FacultyNotification,
} from "../../lib/api";

const TYPE_STYLES: Record<FacultyNotification["type"], { icon: typeof faBell; classes: string }> = {
  alert: { icon: faExclamationTriangle, classes: "bg-rose-50 text-rose-600" },
  warning: { icon: faExclamationTriangle, classes: "bg-amber-50 text-amber-600" },
  success: { icon: faCheckCircle, classes: "bg-emerald-50 text-emerald-600" },
  info: { icon: faCircleInfo, classes: "bg-blue-50 text-blue-600" },
};

export default function StudentNotificationsPage() {
  const [notifications, setNotifications] = useState<FacultyNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchNotifications();
    if (data) {
      setNotifications(data.notifications);
      setUnreadCount(data.unread);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <FontAwesomeIcon icon={faBell} className="text-[#1B6B7B]" />
            Notifications
          </h1>
          <p className="text-gray-500">
            Assignments, deadlines, and alerts from your instructors
            {unreadCount > 0 && ` · ${unreadCount} unread`}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#1B6B7B] hover:bg-[#1B6B7B]/5 border border-[#1B6B7B]/30 rounded-xl transition-colors whitespace-nowrap"
          >
            <FontAwesomeIcon icon={faCheckDouble} className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <FontAwesomeIcon icon={faSpinner} spin className="w-8 h-8 text-[#1B6B7B]" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <FontAwesomeIcon icon={faBell} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No notifications yet</h3>
          <p className="text-gray-500 text-sm mt-1">
            You&apos;ll see quiz assignments, deadline reminders, and alerts here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.info;
            return (
              <div
                key={notification.id}
                className={`bg-white rounded-2xl p-5 shadow-sm border transition-all ${
                  notification.is_read
                    ? "border-gray-100"
                    : "border-l-4 border-l-[#1B6B7B] border-gray-100"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.classes}`}
                  >
                    <FontAwesomeIcon icon={style.icon} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3
                        className={`font-semibold ${
                          notification.is_read ? "text-gray-700" : "text-gray-900"
                        }`}
                      >
                        {notification.title}
                      </h3>
                      {!notification.is_read && (
                        <span className="w-2 h-2 bg-[#1B6B7B] rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <button
                      onClick={() => handleMarkAsRead(notification.id)}
                      className="px-3 py-1 text-sm text-[#1B6B7B] hover:text-[#145a63] transition-colors whitespace-nowrap"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
