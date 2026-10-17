"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "./EcgLoader";
import { toast } from "./Toast";
import { uploadSupportImage } from "../lib/support-images";
import { SUPPORT_ATTACHMENTS, type SupportAttachment } from "../lib/support";

export type PickedImage = {
  key: string;
  name: string;
  /** A local object URL, so the thumbnail shows before the upload finishes. */
  preview: string;
  status: "uploading" | "ready" | "failed";
  attachment?: SupportAttachment;
  error?: string;
};

export type SupportImages = ReturnType<typeof useSupportImages>;

let nextKey = 0;

/**
 * Images attached to a Help & Support message or an Admin's reply. Each one
 * uploads as soon as it's picked, so sending only has to name them.
 */
export function useSupportImages() {
  const [items, setItems] = useState<PickedImage[]>([]);
  // Read by add() for the room left and by the unmount cleanup, neither of
  // which should wait for a render.
  const itemsRef = useRef<PickedImage[]>([]);

  const commit = useCallback((next: PickedImage[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const update = useCallback(
    (key: string, patch: Partial<PickedImage>) =>
      commit(itemsRef.current.map((item) => (item.key === key ? { ...item, ...patch } : item))),
    [commit],
  );

  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  const add = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) {
        toast("Only images can be attached.", "error");
        return;
      }
      const room = SUPPORT_ATTACHMENTS.max - itemsRef.current.length;
      if (room <= 0) {
        toast(`You can attach up to ${SUPPORT_ATTACHMENTS.max} images.`, "error");
        return;
      }
      if (images.length > room) {
        toast(`Only ${room} more image${room === 1 ? "" : "s"} fit, so the rest were left out.`, "error");
      }
      const picked = images.slice(0, room).map((file) => ({
        file,
        item: {
          key: `img-${++nextKey}`,
          name: file.name || "image",
          preview: URL.createObjectURL(file),
          status: "uploading" as const,
        },
      }));
      commit([...itemsRef.current, ...picked.map((p) => p.item)]);
      for (const { file, item } of picked) {
        uploadSupportImage(file).then(
          (attachment) => update(item.key, { status: "ready", attachment }),
          (err: unknown) =>
            update(item.key, {
              status: "failed",
              error: err instanceof Error ? err.message : "That image could not be uploaded.",
            }),
        );
      }
    },
    [commit, update],
  );

  const remove = useCallback(
    (key: string) => {
      const gone = itemsRef.current.find((item) => item.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      commit(itemsRef.current.filter((item) => item.key !== key));
    },
    [commit],
  );

  const clear = useCallback(() => {
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    commit([]);
  }, [commit]);

  /** For a textarea's onPaste: a pasted screenshot becomes an attachment. */
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) add(files);
    },
    [add],
  );

  return {
    items,
    add,
    remove,
    clear,
    onPaste,
    /** The uploaded ones, as the API takes them. */
    attachments: items.flatMap((item) => (item.attachment ? [item.attachment] : [])),
    uploading: items.some((item) => item.status === "uploading"),
    failed: items.some((item) => item.status === "failed"),
  };
}

/** Thumbnails with a remove button each, plus the tile that opens the file picker. */
export function SupportImagePicker({
  images,
  disabled = false,
  hint = "Screenshots or photos that show the problem. You can also paste a screenshot into the message.",
}: {
  images: SupportImages;
  disabled?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = images.items.length >= SUPPORT_ATTACHMENTS.max;

  return (
    <div
      onDragOver={(e) => {
        if (disabled || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        images.add(Array.from(e.dataTransfer.files));
      }}
      className={`rounded-xl transition-colors ${dragging ? "bg-brand-600/5 ring-2 ring-brand-600/40" : ""}`}
    >
      <div className="flex flex-wrap gap-2">
        {images.items.map((item) => (
          <div
            key={item.key}
            className="relative h-20 w-20 overflow-hidden rounded-lg border border-hairline bg-subtle"
            title={item.error ?? item.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img src={item.preview} alt={item.name} className="h-full w-full object-cover" />
            {item.status === "uploading" && (
              <div className="absolute inset-0 grid place-items-center bg-black/40">
                <EcgLoader className="text-white" />
              </div>
            )}
            {item.status === "failed" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-rose-700/75 px-1 text-center text-[10px] font-semibold leading-tight text-white">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                Didn&apos;t upload
              </div>
            )}
            <button
              type="button"
              onClick={() => images.remove(item.key)}
              disabled={disabled}
              aria-label={`Remove ${item.name}`}
              className="absolute right-1 top-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-[11px] font-semibold text-gray-500 transition-colors hover:border-brand-600 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faImage} className="h-4 w-4" />
            Add Image
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(e) => {
          images.add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <p className="mt-1.5 text-xs text-gray-500">
        {hint} Up to {SUPPORT_ATTACHMENTS.max} images.
      </p>
      {images.failed && (
        <p className="mt-1 text-xs font-medium text-rose-600">
          Remove the images that didn&apos;t upload, then add them again.
        </p>
      )}
    </div>
  );
}
