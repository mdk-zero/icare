"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faTimes,
  faPen,
  faTrash,
  faUsers,
  faPlus,
  faDoorOpen,
  faCheckCircle,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import {
  fetchRooms,
  fetchRoomDetail,
  createRoom,
  updateRoom,
  deleteRoom,
  assignStudentsToRoom,
  endRoomAssignment,
  fetchAllStudentUsers,
  Room,
  RoomAssignment,
  StudentUser,
} from "../../lib/api";

const STATUS_STYLES: Record<Room["status"], string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  maintenance: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<Room["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  maintenance: "Maintenance",
};

interface RoomFormState {
  name: string;
  room_number: string;
  capacity: string;
  status: Room["status"];
  description: string;
}

const EMPTY_FORM: RoomFormState = {
  name: "",
  room_number: "",
  capacity: "10",
  status: "active",
  description: "",
};

export default function RoomsClient() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [managingRoom, setManagingRoom] = useState<Room | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setRooms(await fetchRooms());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const filteredRooms = rooms.filter(
    (r) => roomFilter === "all" || r.status === roomFilter,
  );

  const handleDelete = async (room: Room) => {
    if (
      !window.confirm(
        `Delete ${room.name} (Room ${room.room_number})? Assignment history for this room will also be removed.`,
      )
    ) {
      return;
    }
    const result = await deleteRoom(room.id);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    loadRooms();
  };

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
              <FontAwesomeIcon icon={faDoorOpen} className="w-5 h-5 text-[#1B6B7B]" />
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
              <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {rooms.filter((r) => r.status === "active").length}
              </p>
              <p className="text-xs text-gray-500">Active Rooms</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B6B7B]/20 rounded-xl flex items-center justify-center">
              <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-[#145a63]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {rooms.reduce((sum, r) => sum + r.students_assigned, 0)}
              </p>
              <p className="text-xs text-gray-500">Students Assigned</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <select
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/50 focus:border-[#1B6B7B] transition-all cursor-pointer"
        >
          <option value="all">All Rooms</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="maintenance">Maintenance</option>
        </select>
        <button
          onClick={() => {
            setEditingRoom(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B7B] text-white font-medium rounded-xl hover:bg-[#145a63] hover:shadow-lg transition-all duration-300"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
          Add Room
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <FontAwesomeIcon icon={faSpinner} spin className="w-8 h-8 text-[#1B6B7B]" />
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <FontAwesomeIcon icon={faDoorOpen} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No rooms found</h3>
          <p className="text-gray-500 text-sm mt-1">
            {roomFilter === "all"
              ? "Create your first clinical room to get started."
              : "No rooms match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRooms.map((room) => {
            const utilization =
              room.capacity > 0 ? (room.students_assigned / room.capacity) * 100 : 0;
            const isHigh = utilization >= 90;
            const isLow = utilization < 50;
            return (
              <div
                key={room.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#1B6B7B]/30 transition-all duration-300 group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#1B6B7B]/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <FontAwesomeIcon icon={faDoorOpen} className="w-5 h-5 text-[#1B6B7B]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{room.name}</h3>
                      <p className="text-sm text-gray-500">Room {room.room_number}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[room.status]}`}
                  >
                    {STATUS_LABELS[room.status]}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Capacity</span>
                    <span className="text-sm font-medium text-gray-800">
                      {room.students_assigned} / {room.capacity}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isHigh
                          ? "bg-[#145a63]"
                          : isLow
                            ? "bg-[#1B6B7B]/50"
                            : "bg-gradient-to-r from-[#1B6B7B] to-[#2a8a98]"
                      }`}
                      style={{ width: `${Math.min(utilization, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Utilization</span>
                    <span
                      className={`text-xs font-medium ${
                        isHigh
                          ? "text-[#145a63]"
                          : isLow
                            ? "text-[#1B6B7B]/70"
                            : "text-[#1B6B7B]"
                      }`}
                    >
                      {Math.round(utilization)}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setManagingRoom(room)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-[#1B6B7B] hover:bg-[#1B6B7B]/5 rounded-lg transition-colors"
                  >
                    <FontAwesomeIcon icon={faUserPlus} className="w-3.5 h-3.5" />
                    Students
                  </button>
                  <button
                    onClick={() => {
                      setEditingRoom(room);
                      setFormOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(room)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <RoomFormModal
          room={editingRoom}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            loadRooms();
          }}
        />
      )}

      {managingRoom && (
        <RoomStudentsModal
          room={managingRoom}
          onClose={() => setManagingRoom(null)}
          onChanged={loadRooms}
        />
      )}
    </div>
  );
}

function RoomFormModal({
  room,
  onClose,
  onSaved,
}: {
  room: Room | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RoomFormState>(
    room
      ? {
          name: room.name,
          room_number: room.room_number,
          capacity: String(room.capacity),
          status: room.status,
          description: room.description ?? "",
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim() || !form.room_number.trim()) {
      setError("Room name and room number are required.");
      return;
    }
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) {
      setError("Capacity must be a non-negative whole number.");
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      room_number: form.room_number.trim(),
      capacity,
      status: form.status,
      description: form.description.trim() || null,
    };
    const result = room ? await updateRoom(room.id, payload) : await createRoom(payload);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {room ? "Edit Room" : "Add Room"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Room Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Skills Lab A"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Room Number</label>
              <input
                type="text"
                value={form.room_number}
                onChange={(e) => setForm((f) => ({ ...f, room_number: e.target.value }))}
                placeholder="e.g. 101"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Capacity</label>
              <input
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as Room["status"] }))
                }
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Purpose, equipment, notes..."
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] text-sm resize-none"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 bg-[#1B6B7B] text-white rounded-xl font-medium hover:bg-[#145a63] transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
            {room ? "Save Changes" : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomStudentsModal({
  room,
  onClose,
  onChanged,
}: {
  room: Room;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [assignments, setAssignments] = useState<RoomAssignment[]>([]);
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shift, setShift] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [detail, allStudents] = await Promise.all([
      fetchRoomDetail(room.id),
      fetchAllStudentUsers(),
    ]);
    setAssignments(detail?.assignments ?? []);
    setStudents(allStudents);
    setLoading(false);
  }, [room.id]);

  useEffect(() => {
    load();
  }, [load]);

  const assignedIds = new Set(assignments.map((a) => a.student_id));
  const available = students.filter((s) => !assignedIds.has(s.id));

  const handleAssign = async () => {
    if (selectedIds.length === 0) return;
    setError(null);
    setSaving(true);
    const result = await assignStudentsToRoom(room.id, selectedIds, shift.trim() || null);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSelectedIds([]);
    setShift("");
    await load();
    onChanged();
  };

  const handleUnassign = async (assignmentId: string) => {
    setError(null);
    const result = await endRoomAssignment(room.id, assignmentId);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assigned Students</h2>
            <p className="text-sm text-gray-500">
              {room.name} · Room {room.room_number} · capacity {room.capacity}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-[#1B6B7B]" />
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Currently assigned ({assignments.length})
                </h3>
                {assignments.length === 0 ? (
                  <p className="text-sm text-gray-400">No students assigned to this room.</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {assignment.users?.name ?? "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {assignment.shift ? `${assignment.shift} shift · ` : ""}
                            since {new Date(assignment.starts_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleUnassign(assignment.id)}
                          className="text-xs font-medium text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Assign students</h3>
                {available.length === 0 ? (
                  <p className="text-sm text-gray-400">All students are already assigned.</p>
                ) : (
                  <>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 custom-scrollbar">
                      {available.map((student) => (
                        <label
                          key={student.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(student.id)}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked
                                  ? [...prev, student.id]
                                  : prev.filter((id) => id !== student.id),
                              )
                            }
                            className="w-4 h-4 text-[#1B6B7B] rounded focus:ring-[#1B6B7B]"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{student.name}</p>
                            <p className="text-xs text-gray-500">{student.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <select
                        value={shift}
                        onChange={(e) => setShift(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B]"
                      >
                        <option value="">No shift</option>
                        <option value="AM">AM shift</option>
                        <option value="PM">PM shift</option>
                        <option value="Night">Night shift</option>
                      </select>
                      <button
                        onClick={handleAssign}
                        disabled={saving || selectedIds.length === 0}
                        className="flex-1 px-4 py-2 bg-[#1B6B7B] text-white rounded-xl font-medium text-sm hover:bg-[#145a63] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {saving && <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />}
                        Assign {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-white transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
