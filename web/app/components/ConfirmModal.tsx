"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faTimes } from "@fortawesome/free-solid-svg-icons";

interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export default function ConfirmModal({
  config,
  onClose,
}: {
  config: ConfirmConfig;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-overlay max-w-sm w-full mx-4 p-6 border border-hairline">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
          <p className="text-sm text-gray-600">{config.message}</p>
          <div className="flex gap-3 mt-2 w-full">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                config.onConfirm();
                onClose();
              }}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white ${
                config.danger !== false
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-brand-600 hover:bg-[#155663]"
              }`}
            >
              {config.confirmLabel ?? (config.danger !== false ? "Delete" : "Confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
