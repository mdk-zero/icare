"use client";

import { useNotifications } from "../../lib/notifications-live";
import { SkeletonNotificationItem } from "../../components/skeletons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faTriangleExclamation,
  faCircleCheck,
  faCircleInfo,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";

export default function FacultyNotificationsClient() {
  // Shared live store: inserts arrive over SSE and read state stays in step
  // with the sidebar badge.
  const {
    notifications,
    unread: unreadCount,
    loading,
    connected,
    markRead,
    markAllRead,
  } = useNotifications();

  const getNotificationIcon = (type: string): IconDefinition => {
    switch (type) {
      case 'alert': return faTriangleExclamation;
      case 'warning': return faTriangleExclamation;
      case 'success': return faCircleCheck;
      default: return faCircleInfo;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'alert': return 'bg-red-50 text-red-600 border-red-200';
      case 'warning': return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'success': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      default: return 'bg-blue-50 text-blue-600 border-blue-200';
    }
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faBell} className="w-3.5 h-3.5" />,
          label: "Notifications",
        }}
        title="Notifications"
        subtitle={connected ? "Live alerts and updates" : "Alerts and updates · reconnecting…"}
        action={unreadCount > 0 ? {
          icon: <FontAwesomeIcon icon={faCheck} className="w-6 h-6" />,
          onClick: () => markAllRead(),
          label: "Mark all as read",
        } : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faBell} className="w-5 h-5" />}
          value={notifications.length}
          label="Total"
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          value={notifications.filter(n => n.type === 'alert').length}
          label="Alerts"
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          value={unreadCount}
          label="Unread"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonNotificationItem key={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div 
              key={notification.id}
              className={`bg-surface rounded-xl p-3 shadow-sm border transition-all ${
                notification.is_read 
                  ? 'border-gray-100' 
                  : 'border-l-4 border-l-brand-600 border-gray-100'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getNotificationColor(notification.type)}`}>
                  <FontAwesomeIcon icon={getNotificationIcon(notification.type)} className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`font-semibold ${notification.is_read ? 'text-gray-700' : 'text-gray-900'}`}>
                      {notification.title}
                    </h3>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-brand-600 rounded-full" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                {!notification.is_read && (
                  <button
                    onClick={() => markRead(notification.id)}
                    className="px-3 py-1 text-sm text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="bg-surface rounded-xl p-12 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FontAwesomeIcon icon={faBell} className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500">No notifications</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}