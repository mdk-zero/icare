"use client";

import { useState } from "react";

interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'faculty' | 'administrator' | 'super_admin';
  status: 'active' | 'inactive';
  created_at: string;
  last_login: string;
}

const mockUsers: UserAccount[] = [
  { id: "1", name: "John Smith", email: "john.smith@icare.edu", role: "student", status: "active", created_at: "2024-01-15", last_login: "2024-03-20" },
  { id: "2", name: "Sarah Johnson", email: "sarah.johnson@icare.edu", role: "student", status: "active", created_at: "2024-01-15", last_login: "2024-03-19" },
  { id: "3", name: "Mike Williams", email: "mike.williams@icare.edu", role: "student", status: "active", created_at: "2024-01-15", last_login: "2024-03-17" },
  { id: "9", name: "Dr. Maria Santos", email: "maria.santos@icare.edu", role: "administrator", status: "active", created_at: "2023-06-01", last_login: "2024-03-20" },
  { id: "10", name: "Prof. James Rivera", email: "james.rivera@icare.edu", role: "administrator", status: "active", created_at: "2023-06-01", last_login: "2024-03-19" },
  { id: "13", name: "Admin Super", email: "admin.super@icare.edu", role: "super_admin", status: "active", created_at: "2023-01-01", last_login: "2024-03-20" },
  { id: "15", name: "Test Faculty", email: "test.faculty@icare.edu", role: "faculty", status: "active", created_at: "2023-08-15", last_login: "2024-03-17" },
];

import PageHeader from "../../components/PageHeader";

export default function UsersClient() {
  const users = mockUsers;
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

  const filteredUsers = users.filter(u => 
    (userRoleFilter === "all" || u.role === userRoleFilter) &&
    (userStatusFilter === "all" || u.status === userStatusFilter)
  );

  const roleLabels: Record<string, string> = {
    student: 'Student',
    faculty: 'Faculty',
    administrator: 'Administrator',
    super_admin: 'Super Admin'
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
          label: "User Management",
        }}
        title="User Management"
        subtitle="Manage user accounts, roles, and access permissions"
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{users.length}</p>
              <p className="text-xs text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.role === 'student').length}</p>
              <p className="text-xs text-gray-500">Students</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.role === 'faculty').length}</p>
              <p className="text-xs text-gray-500">Faculty</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{users.filter(u => u.role === 'administrator' || u.role === 'super_admin').length}</p>
              <p className="text-xs text-gray-500">Admins</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={userRoleFilter}
          onChange={(e) => setUserRoleFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer"
        >
          <option value="all">All Roles</option>
          <option value="student">Student</option>
          <option value="faculty">Faculty</option>
          <option value="administrator">Administrator</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select
          value={userStatusFilter}
          onChange={(e) => setUserStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-xl hover:bg-[#145a63] hover:shadow-lg transition-all duration-300 ml-auto">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">User</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Role</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Status</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Created</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Last Login</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-full flex items-center justify-center text-[#1B6B7B] font-semibold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="px-3 py-1 bg-[#1B6B7B]/10 text-[#1B6B7B] rounded-full text-sm font-medium">
                      {roleLabels[user.role]}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-500">{user.created_at}</td>
                  <td className="py-4 px-6 text-gray-500">{user.last_login}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-gray-400 hover:text-[#1B6B7B] hover:bg-[#1B6B7B]/10 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button className="p-2 text-gray-400 hover:text-[#145a63] hover:bg-[#1B6B7B]/10 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}