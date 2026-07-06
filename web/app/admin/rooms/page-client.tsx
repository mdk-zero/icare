"use client";

import { useState } from "react";

interface Room {
  id: string;
  name: string;
  capacity: number;
  status: 'active' | 'inactive';
  students_assigned: number;
  floor: number;
}

const mockRooms: Room[] = [
  { id: "1", name: "Room 1", capacity: 10, status: "active", students_assigned: 8, floor: 1 },
  { id: "2", name: "Room 2", capacity: 10, status: "active", students_assigned: 6, floor: 1 },
  { id: "3", name: "Room 3", capacity: 8, status: "active", students_assigned: 8, floor: 2 },
  { id: "4", name: "Room 4", capacity: 8, status: "inactive", students_assigned: 0, floor: 2 },
  { id: "5", name: "Room 5", capacity: 12, status: "active", students_assigned: 5, floor: 2 },
  { id: "6", name: "Room 6", capacity: 10, status: "active", students_assigned: 7, floor: 3 },
];

import PageHeader from "../../components/PageHeader";

export default function RoomsClient() {
  const rooms = mockRooms;
  const [roomFilter, setRoomFilter] = useState("all");

  const filteredRooms = rooms.filter(r => roomFilter === "all" || r.status === roomFilter);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ),
          label: "Room Management",
        }}
        title="Room Management"
        subtitle="Manage clinical rooms, track occupancy, and assign students"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{rooms.length}</p>
              <p className="text-xs text-gray-500">Total Rooms</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{rooms.filter(r => r.status === 'active').length}</p>
              <p className="text-xs text-gray-500">Active Rooms</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B6B7B]/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-[#145a63]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{rooms.reduce((sum, r) => sum + r.students_assigned, 0)}</p>
              <p className="text-xs text-gray-500">Students Assigned</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer"
          >
            <option value="all">All Rooms</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-xl hover:bg-[#145a63] hover:shadow-lg transition-all duration-300">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Room
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRooms.map((room) => {
          const utilization = (room.students_assigned / room.capacity) * 100;
          const isHigh = utilization >= 90;
          const isLow = utilization < 50;
          return (
            <div key={room.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-[#1B6B7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{room.name}</h3>
                    <p className="text-sm text-gray-500">Floor {room.floor}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${room.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {room.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Capacity</span>
                  <span className="text-sm font-medium text-gray-800">{room.students_assigned} / {room.capacity}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-[#145a63]' : isLow ? 'bg-[#1B6B7B]/50' : 'bg-gradient-to-r from-[#1B6B7B] to-[#2a8a98]'}`}
                    style={{ width: `${utilization}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Utilization</span>
                  <span className={`text-xs font-medium ${isHigh ? 'text-[#145a63]' : isLow ? 'text-[#1B6B7B]/70' : 'text-[#1B6B7B]'}`}>
                    {Math.round(utilization)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}