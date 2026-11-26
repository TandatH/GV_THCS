"use client";

import type { HomeroomReportPhoto } from "@school/shared";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui";

export function HomeroomPhotoLightbox({
  photos,
  initialIndex = 0,
  open,
  onClose,
}: {
  photos: HomeroomReportPhoto[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (open) {
      setIndex(Math.max(0, Math.min(initialIndex, photos.length - 1)));
      setZoom(1);
      setRotation(0);
    }
  }, [open, initialIndex, photos.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        setIndex((prev) => (prev + 1 < photos.length ? prev + 1 : 0));
        setZoom(1);
        setRotation(0);
      }
      if (e.key === "ArrowLeft") {
        setIndex((prev) => (prev - 1 >= 0 ? prev - 1 : photos.length - 1));
        setZoom(1);
        setRotation(0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, photos.length, onClose]);

  if (!open || photos.length === 0) return null;

  const current = photos[index] || photos[0];

  function goPrev() {
    setIndex((prev) => (prev - 1 >= 0 ? prev - 1 : photos.length - 1));
    setZoom(1);
    setRotation(0);
  }

  function goNext() {
    setIndex((prev) => (prev + 1 < photos.length ? prev + 1 : 0));
    setZoom(1);
    setRotation(0);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Trình xem ảnh sổ sinh hoạt"
    >
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Trang {index + 1} / {photos.length}
            {current.caption ? ` — ${current.caption}` : ""}
          </p>
          <p className="truncate text-xs text-slate-400">{current.fileName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            title="Thu nhỏ"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[48px] text-center text-xs font-medium text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            title="Phóng to"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            title="Xoay trái 90°"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-slate-200 hover:bg-slate-800 hover:text-white"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Xoay phải 90°"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
            title="Mở ảnh gốc ở tab mới"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Ảnh gốc</span>
          </a>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-slate-200 hover:bg-rose-600 hover:text-white"
            onClick={onClose}
            title="Đóng (Esc)"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        {photos.length > 1 ? (
          <button
            type="button"
            onClick={goPrev}
            className="fixed left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-3 text-white shadow-lg ring-1 ring-white/15 hover:bg-slate-800"
            aria-label="Ảnh trước"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}

        <img
          src={current.url}
          alt={current.caption || `Trang ${index + 1}`}
          className="max-h-[82vh] max-w-full select-none rounded-lg object-contain shadow-2xl transition-transform duration-150"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
        />

        {photos.length > 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="fixed right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-slate-900/80 p-3 text-white shadow-lg ring-1 ring-white/15 hover:bg-slate-800"
            aria-label="Ảnh kế tiếp"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>

      {/* Thumbnails strip */}
      {photos.length > 1 ? (
        <div className="flex items-center justify-center gap-2 overflow-x-auto border-t border-slate-800 bg-slate-900/90 px-4 py-2.5">
          {photos.map((photo, idx) => (
            <button
              key={photo.photoId}
              type="button"
              onClick={() => {
                setIndex(idx);
                setZoom(1);
                setRotation(0);
              }}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                idx === index ? "border-amber-400 ring-2 ring-amber-400/40" : "border-slate-700 opacity-70 hover:opacity-100"
              }`}
            >
              <img src={photo.url} alt={`Trang ${idx + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-0.5 right-0.5 rounded bg-slate-950/80 px-1 text-[10px] font-bold">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
