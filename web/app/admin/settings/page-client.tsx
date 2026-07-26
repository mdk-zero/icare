"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faUserShield,
  faLock,
  faBell,
  faGear,
  faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import ProfileEditor from "../../components/ProfileEditor";
import PageHeader from "../../components/PageHeader";

export default function SettingsClient() {
  const [activeSection, setActiveSection] = useState("profile");

  const sections: { id: string; label: string; icon: IconDefinition }[] = [
    { id: "profile", label: "Profile", icon: faUser },
    { id: "access", label: "Access Control", icon: faUserShield },
    { id: "privacy", label: "Data Privacy", icon: faLock },
    { id: "notifications", label: "Notifications", icon: faBell },
  ];

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faGear} className="w-3.5 h-3.5" />,
          label: "Administration",
        }}
        title="Dean Administration"
        subtitle="Manage system configuration and institutional settings"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-300 ${
                  activeSection === section.id
                    ? "bg-brand-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-50 hover:text-brand-600"
                }`}
              >
                <FontAwesomeIcon icon={section.icon} className="w-5 h-5" />
                <span className="font-medium">{section.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          {activeSection === "profile" && (
            <ProfileEditor changePasswordHref="/admin/settings/change-password" />
          )}

          {activeSection === "access" && (
            <div className="space-y-6">
              <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Role-Based Access Control</h2>
                <p className="text-gray-500 text-sm mb-6">Configure access permissions for each user role</p>
                <div className="space-y-4">
                  {[
                    { role: "Super Administrator", desc: "Full system access, user management, analytics, and configuration" },
                    { role: "Faculty", desc: "Student management, grading, performance monitoring, and room oversight" },
                    { role: "Student", desc: "Clinical tasks, quizzes, patient monitoring, and learning recommendations" },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-800">{item.role}</p>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                      <button className="px-3 py-1.5 text-sm text-brand-600 border border-brand-600 rounded-lg hover:bg-brand-600 hover:text-white transition-all">
                        Configure
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Security Settings</h2>
                <p className="text-gray-500 text-sm mb-6">Manage password policies and authentication</p>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Password Length</label>
                    <input type="number" defaultValue={8} className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">Two-Factor Authentication</p>
                      <p className="text-sm text-gray-500">Require 2FA for all administrators</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-600/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "privacy" && (
            <div className="space-y-6">
              <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Data Privacy Compliance</h2>
                <p className="text-gray-500 text-sm mb-6">Ensure compliance with the Philippine Data Privacy Act of 2012</p>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon icon={faCircleCheck} className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Data Protection</p>
                        <p className="text-sm text-gray-500">All student data encrypted at rest</p>
                      </div>
                    </div>
                    <span className="text-green-600 font-medium">Compliant</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon icon={faCircleCheck} className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Access Control</p>
                        <p className="text-sm text-gray-500">Role-based access properly configured</p>
                      </div>
                    </div>
                    <span className="text-green-600 font-medium">Compliant</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon icon={faCircleCheck} className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Audit Trail</p>
                        <p className="text-sm text-gray-500">Activity logging enabled for all actions</p>
                      </div>
                    </div>
                    <span className="text-green-600 font-medium">Compliant</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Privacy Settings</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">Data Retention Policy</p>
                      <p className="text-sm text-gray-500">Automatically archive data after 5 years</p>
                    </div>
                    <button className="px-3 py-1.5 text-sm text-brand-600 border border-brand-600 rounded-lg hover:bg-brand-600 hover:text-white transition-all">
                      Configure
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">Student Consent Management</p>
                      <p className="text-sm text-gray-500">Manage data processing consent records</p>
                    </div>
                    <button className="px-3 py-1.5 text-sm text-brand-600 border border-brand-600 rounded-lg hover:bg-brand-600 hover:text-white transition-all">
                      View
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">Data Export</p>
                      <p className="text-sm text-gray-500">Export student data upon request</p>
                    </div>
                    <button className="px-3 py-1.5 text-sm text-brand-600 border border-brand-600 rounded-lg hover:bg-brand-600 hover:text-white transition-all">
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Notification Preferences</h2>
              <p className="text-gray-500 text-sm mb-6">Configure alerts for administrative activities</p>
              <div className="space-y-4">
                {[
                  { label: "Student enrollment alerts", desc: "Get notified when new students enroll" },
                  { label: "At-risk student alerts", desc: "Receive alerts when students are flagged at-risk" },
                  { label: "Assessment deadlines", desc: "Reminders for upcoming assessment deadlines" },
                  { label: "Report generation", desc: "Notifications when reports are ready" },
                  { label: "System updates", desc: "Important system announcements" },
                  { label: "Room maintenance alerts", desc: "Notifications when rooms require attention" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div>
                      <p className="font-medium text-gray-800">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-600/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}