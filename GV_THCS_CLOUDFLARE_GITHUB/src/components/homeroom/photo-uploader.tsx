"use client";

import type { HomeroomReportPhoto } from "@school/shared";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  Eye,
  ImagePlus,
  Loader2,
  RotateCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef } from "react";

import { Badge, Button, Input } from "@/components/ui";
import { formatFileSize } from "@/lib/homeroom-activity-book";

export interface PendingHomeroomPhoto {
  localId: string;
  file: File;
  previewUrl: string;
  caption: string;
  rotateDegrees: number;
}

export function HomeroomPhotoUploader({
  uploadedPhotos,
  pendingPhotos,
  maxPhotos = 10,
  disabled = false,
  uploading = false,
  onAddFiles,
  onRemoveUploaded,
  onRemovePending,
  onRotatePending,
  onCaptionUploaded,
  onCaptionPending,
  onMoveUploaded,
  onPreviewPhoto,
}: {
  uploadedPhotos: HomeroomReportPhoto[];
  pendingPhotos: PendingHomeroomPhoto[];
  maxPhotos?: number;
  disabled?: boolean;
  uploading?: boolean;
  onAddFiles: (files: FileList) => void;
  onRemoveUploaded: (photoId: string) => void;
  onRemovePending: (localId: string) => void;
  onRotatePending: (localId: string) => void;
  onCaptionUploaded: (photoId: string, caption: string) => void;
  onCaptionPending: (localId: string, caption: string) => void;
  onMoveUploaded: (index: number, direction: -1 | 1) => void;
  onPreviewPhoto: (index: number) => void;
}) {
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const totalCount = uploadedPhotos.length + pendingPhotos.length;
  const canAddMore = !disabled && !uploading && totalCount < maxPhotos;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs for gallery & mobile camera */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={!canAddMore}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        disabled={!canAddMore}
      />

      {/* Action dropzone / buttons */}
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 text-center transition hover:border-primary/50">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Camera className="h-6 w-6" />
        </div>
        <h4 className="text-sm font-bold text-foreground">
          Chụp ảnh hoặc tải ảnh trang Sổ Sinh Hoạt giấy
        </h4>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Hệ thống tự động nén ảnh thông minh để tải nhanh qua 4G mà vẫn rõ nét chữ viết tay. Tối đa{" "}
          <span className="font-semibold text-foreground">{maxPhotos} ảnh</span> mỗi tuần ({totalCount}/{maxPhotos} ảnh).
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canAddMore}
            onClick={() => cameraInputRef.current?.click()}
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
            Chụp ảnh trực tiếp
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canAddMore}
            onClick={() => galleryInputRef.current?.click()}
            className="gap-2"
          >
            <ImagePlus className="h-4 w-4" />
            Chọn ảnh từ máy / thư viện
          </Button>
        </div>

        {uploading ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Đang nén và tải ảnh lên hệ thống...
          </div>
        ) : null}
      </div>

      {/* Uploaded photos list */}
      {uploadedPhotos.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Ảnh đã lưu trên hệ thống ({uploadedPhotos.length})
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uploadedPhotos.map((photo, idx) => (
              <div
                key={photo.photoId}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <img
                    src={photo.url}
                    alt={photo.caption || `Trang ${idx + 1}`}
                    className="h-full w-full cursor-pointer object-cover transition duration-200 group-hover:scale-[1.02]"
                    onClick={() => onPreviewPhoto(idx)}
                  />
                  <div className="absolute left-2 top-2">
                    <Badge tone="success">Trang {idx + 1}</Badge>
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onPreviewPhoto(idx)}
                      className="rounded-lg bg-slate-900/75 p-1.5 text-white hover:bg-slate-900"
                      title="Xem phóng to"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={() => onRemoveUploaded(photo.photoId)}
                        className="rounded-lg bg-rose-600/90 p-1.5 text-white hover:bg-rose-700"
                        title="Xóa ảnh"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <Input
                    value={photo.caption || ""}
                    onChange={(e) => onCaptionUploaded(photo.photoId, e.target.value)}
                    placeholder={`Ghi chú trang ${idx + 1} (tùy chọn)`}
                    className="h-9 text-xs"
                    disabled={disabled}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{formatFileSize(photo.sizeBytes)}</span>
                    {!disabled && uploadedPhotos.length > 1 ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onMoveUploaded(idx, -1)}
                          disabled={idx === 0}
                          className="rounded p-1 hover:bg-muted disabled:opacity-35"
                          title="Đưa lên trước"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveUploaded(idx, 1)}
                          disabled={idx === uploadedPhotos.length - 1}
                          className="rounded p-1 hover:bg-muted disabled:opacity-35"
                          title="Đưa xuống sau"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pending local photos */}
      {pendingPhotos.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
              <Upload className="h-4 w-4" />
              Ảnh mới chọn — sẽ tự động tải lên khi Lưu / Gửi ({pendingPhotos.length})
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingPhotos.map((item, idx) => (
              <div
                key={item.localId}
                className="flex flex-col overflow-hidden rounded-2xl border border-amber-300 bg-amber-50/30 shadow-sm"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <img
                    src={item.previewUrl}
                    alt={item.caption || `Ảnh mới ${idx + 1}`}
                    className="h-full w-full object-contain transition-transform duration-150"
                    style={{ transform: `rotate(${item.rotateDegrees}deg)` }}
                  />
                  <div className="absolute left-2 top-2">
                    <Badge tone="warning">Chờ tải lên #{uploadedPhotos.length + idx + 1}</Badge>
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRotatePending(item.localId)}
                      className="rounded-lg bg-slate-900/80 p-1.5 text-white hover:bg-slate-900"
                      title="Xoay ảnh 90°"
                      disabled={disabled || uploading}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePending(item.localId)}
                      className="rounded-lg bg-rose-600/90 p-1.5 text-white hover:bg-rose-700"
                      title="Bỏ ảnh này"
                      disabled={disabled || uploading}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 p-3">
                  <Input
                    value={item.caption}
                    onChange={(e) => onCaptionPending(item.localId, e.target.value)}
                    placeholder={`Ghi chú trang ${uploadedPhotos.length + idx + 1} (tùy chọn)`}
                    className="h-9 bg-white text-xs"
                    disabled={disabled || uploading}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Gốc: {formatFileSize(item.file.size)} • Góc xoay: {item.rotateDegrees}°
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
