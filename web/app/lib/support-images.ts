"use client";

import { apiFetch } from "./api";
import { SUPPORT_ATTACHMENTS, type SupportAttachment } from "./support";

/** Small enough images go up untouched; a screenshot's text stays crisp. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image this browser can read."));
    };
    img.src = url;
  });
}

async function encodeJpeg(img: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // JPEG has no transparency; a see-through screenshot would turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Makes a picked image fit the upload cap. A phone photo is several times
 * over it, and HEIC or BMP isn't accepted at all, so those are redrawn as a
 * JPEG; anything already small and in an accepted format is left alone.
 */
export async function shrinkSupportImage(file: File): Promise<File> {
  const accepted = (SUPPORT_ATTACHMENTS.types as readonly string[]).includes(file.type);
  if (accepted && file.size <= KEEP_AS_IS_BYTES) return file;

  const img = await loadImage(file);
  for (const [edge, quality] of [
    [2000, 0.85],
    [1600, 0.75],
    [1200, 0.65],
  ] as const) {
    const blob = await encodeJpeg(img, edge, quality);
    if (blob && blob.size <= SUPPORT_ATTACHMENTS.maxBytes) {
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    }
  }
  throw new Error("That image is too large to attach.");
}

/** Shrinks and uploads one image, returning what a message names in `attachments`. */
export async function uploadSupportImage(file: File): Promise<SupportAttachment> {
  const ready = await shrinkSupportImage(file);
  const form = new FormData();
  form.append("file", ready);
  const res = await apiFetch("/api/support/attachments", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { attachment?: SupportAttachment; error?: string };
  if (!res.ok || !data.attachment) throw new Error(data.error || "That image could not be uploaded.");
  return data.attachment;
}
