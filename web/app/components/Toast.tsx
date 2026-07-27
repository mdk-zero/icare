"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faTimes, faInfoCircle } from "@fortawesome/free-solid-svg-icons";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

let nextId = 0;
let addToastFn: ((text: string, type?: ToastType) => void) | null = null;

export function toast(text: string, type: ToastType = "success") {
  addToastFn?.(text, type);
}

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (text: string, type: ToastType = "success") => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    return () => { addToastFn = null; };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border text-sm font-medium animate-[slideIn_0.3s_ease] ${
            item.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : item.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-brand-50 border-brand-200 text-brand-800"
          }`}
        >
          <FontAwesomeIcon
            icon={item.type === "success" ? faCheckCircle : faInfoCircle}
            className={`w-4 h-4 mt-0.5 shrink-0 ${
              item.type === "success" ? "text-green-500" : item.type === "error" ? "text-red-500" : "text-brand-500"
            }`}
          />
          <span className="flex-1">{item.text}</span>
          <button
            onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
