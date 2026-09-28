"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import {
  fetchRoomDetail,
  createRoom,
  updateRoom,
  assignStudentsToRoom,
  endRoomAssignment,
  fetchAllStudentUsers,
  Room,
  RoomAssignment,
  StudentUser,
} from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { EcgLoader } from "./EcgLoader";

/**
 * The admin's room dialogs: the room record itself, and the students rostered
 * to it. Rostering is not a bed — analytics and reports read it per room.
 */

// Stable empty fallbacks, so nothing downstream sees a new array each render.
const NO_ASSIGNMENTS: RoomAssignment[] = [];
const NO_STUDENT_USERS: StudentUser[] = [];

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

export function RoomFormModal({
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
      <div className="bg-surface rounded-xl w-full max-w-md overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline">
        <div className="p-4 border-b border-hairline flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{room ? "Edit Room" : "Add Room"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Room Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Skills Lab A"
                className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Room Number</label>
              <input
                type="text"
                value={form.room_number}
                onChange={(e) => setForm((f) => ({ ...f, room_number: e.target.value }))}
                placeholder="e.g. 101"
                className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Capacity</label>
              <input
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as Room["status"],
                  }))
                }
                className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm"
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
              className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-surface transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <EcgLoader />}
            {room ? "Save Changes" : "Create Room"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomStudentsModal({
  room,
  onClose,
  onChanged,
}: {
  room: Room;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shift, setShift] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    loading,
    refresh: load,
  } = usePageData(`admin:room:${room.id}`, async () => {
    const [detail, allStudents] = await Promise.all([
      fetchRoomDetail(room.id),
      fetchAllStudentUsers(),
    ]);
    return {
      assignments: detail?.assignments ?? NO_ASSIGNMENTS,
      students: allStudents,
    };
  });

  const assignments = data?.assignments ?? NO_ASSIGNMENTS;
  const students = data?.students ?? NO_STUDENT_USERS;

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
      <div className="bg-surface rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline">
        <div className="p-4 border-b border-hairline flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assigned Students</h2>
            <p className="text-sm text-gray-500">
              {room.name} · Room {room.room_number} · capacity {room.capacity}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <EcgLoader size="md" className="text-brand-600" />
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
                            className="w-4 h-4 text-brand-600 rounded focus:ring-brand-600"
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
                        className="px-3 py-2 bg-surface border border-gray-300 rounded-xl text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600"
                      >
                        <option value="">No shift</option>
                        <option value="AM">AM shift</option>
                        <option value="PM">PM shift</option>
                        <option value="Night">Night shift</option>
                      </select>
                      <button
                        onClick={handleAssign}
                        disabled={saving || selectedIds.length === 0}
                        className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {saving && <EcgLoader />}
                        Assign {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-surface transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
