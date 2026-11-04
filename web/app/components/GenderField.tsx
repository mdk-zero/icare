"use client";

const OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "female", label: "Female (Ms.)" },
  { value: "male", label: "Male (Mr.)" },
];

/**
 * An account's users.sex, shown as Gender on the Dean's forms. Optional: left
 * blank, greetings use the full name rather than guess an honorific.
 */
export default function GenderField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">
        Gender <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
