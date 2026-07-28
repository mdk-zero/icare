"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faTriangleExclamation,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import type { ReactNode } from "react";

export interface ConfirmConfig {
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  error?: string | null;
  children?: ReactNode;
  onConfirm: () => void;
}

export default function ConfirmModal({
  config,
  onClose,
}: {
  config: ConfirmConfig;
  onClose: () => void;
}) {
  const { title, message, confirmLabel, danger, loading, error, children, onConfirm } = config;
  const isDanger = danger !== false;

  return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={loading ? undefined : onClose}>
      <div className="bg-surface rounded-xl w-full max-w-md overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-hairline" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isDanger ? "bg-rose-50" : "bg-brand-600/10"
            }`}>
              <FontAwesomeIcon
                icon={isDanger ? faTrash : faTriangleExclamation}
                className={`w-5 h-5 ${isDanger ? "text-rose-600" : "text-brand-600"}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">{message}</p>
              {children}
              {error && (
                <div className="mt-3 p-2.5 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                  {error}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center gap-2 ${
                isDanger
                  ? "bg-rose-600 text-white hover:bg-rose-700 shadow-[0_2px_6px_rgba(225,29,72,0.25)]"
                  : "bg-brand-600 text-white hover:bg-[#155663] shadow-[0_2px_6px_rgba(27,107,123,0.25)]"
              }`}
            >
              {loading ? (
                <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
              ) : isDanger ? (
                <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
              ) : null}
              {loading ? "Processing…" : (confirmLabel ?? (isDanger ? "Delete" : "Confirm"))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
