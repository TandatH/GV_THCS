"use client";

import {
  homeroomPrincipalRatingLabels,
  type HomeroomReportPhoto,
  type HomeroomWeeklyReport,
} from "@school/shared";
import {
  Award,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { useState } from "react";

import { Badge, Card } from "@/components/ui";
import { submissionTypeLabel } from "@/lib/homeroom-activity-book";

import { HomeroomPhotoLightbox } from "./photo-lightbox";

function InfoBlock({
  icon,
  title,
  content,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  content?: string;
  tone?: "default" | "warning" | "success" | "info";
}) {
  const clean = (content || "").trim();
  if (!clean) return null;

  const toneClasses = {
    default: "border-border bg-card",
    warning: "border-amber-200 bg-amber-50/40",
    success: "border-emerald-200 bg-emerald-50/40",
    info: "border-blue-200 bg-blue-50/40",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
        {icon}
        <span>{title}</span>
      </div>
      <p className="whitespace-pre-line text-sm leading-6 text-foreground">{clean}</p>
    </div>
  );
}

export function HomeroomReportDetailView({
  report,
  weekLabel,
}: {
  report: HomeroomWeeklyReport;
  weekLabel?: string;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const form = report.formData;
  const photos: HomeroomReportPhoto[] = Array.isArray(report.photos) ? report.photos : [];
  const showFormSection =
    report.submissionType === "form_only" || report.submissionType === "hybrid" || Boolean(form);
  const hasAnyFormText = Boolean(
    form &&
      (form.totalStudents > 0 ||
        form.presentCount > 0 ||
        form.absentWithPermission?.trim() ||
        form.absentWithoutPermission?.trim() ||
        form.disciplineOverview?.trim() ||
        form.notableViolations?.trim() ||
        form.academicOverview?.trim() ||
        form.commendations?.trim() ||
        form.parentCoordination?.trim() ||
        form.movementActivities?.trim() ||
        form.nextWeekPlan?.trim() ||
        form.teacherRecommendations?.trim()),
  );

  function openPhoto(idx: number) {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* Summary Header */}
      <Card className="border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-foreground">
                Lớp {report.className} — {weekLabel || `Tuần ${report.weekNumber}`}
              </h3>
              <Badge tone="info">{submissionTypeLabel(report.submissionType)}</Badge>
              {report.status === "reviewed" ? (
                <Badge tone="success">BGH đã xem & nhận xét</Badge>
              ) : report.status === "submitted" ? (
                <Badge tone="warning">Đã gửi BGH</Badge>
              ) : (
                <Badge tone="neutral">Bản nháp</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              GVCN: <span className="font-semibold text-foreground">{report.teacherName}</span>
              {form?.meetingDate ? ` • Ngày SH lớp: ${form.meetingDate}` : ""}
            </p>
          </div>
        </div>
      </Card>

      {/* Principal feedback highlight if already reviewed */}
      {report.principalFeedback?.feedbackContent ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Ý kiến nhận xét / Chỉ đạo của Hiệu trưởng & BGH</span>
            </div>
            {report.principalFeedback.rating ? (
              <Badge tone="success">
                Đánh giá: {homeroomPrincipalRatingLabels[report.principalFeedback.rating]}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-950">
            {report.principalFeedback.feedbackContent}
          </p>
          <p className="mt-2 text-xs text-emerald-800/80">
            Người nhận xét: <span className="font-semibold">{report.principalFeedback.reviewedByName}</span>
            {report.principalFeedback.isAcknowledgedByTeacher ? " • GVCN đã xác nhận tiếp thu" : ""}
          </p>
        </div>
      ) : null}

      {/* Form Details */}
      {showFormSection && hasAnyFormText && form ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            <span>Nội dung báo cáo sinh hoạt lớp</span>
          </div>

          {/* Attendance metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Sĩ số lớp</p>
              <p className="mt-0.5 text-lg font-bold text-foreground">{form.totalStudents || 0} HS</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Có mặt</p>
              <p className="mt-0.5 text-lg font-bold text-emerald-700">{form.presentCount || 0} HS</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Đi trễ trong tuần</p>
              <p className="mt-0.5 text-lg font-bold text-amber-700">{form.tardyCount || 0} lượt</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Tiết tốt / Chưa tốt</p>
              <p className="mt-0.5 text-lg font-bold text-blue-700">
                {form.goodSessionsCount || 0} / {form.badSessionsCount || 0}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoBlock
              icon={<Users className="h-4 w-4 text-blue-600" />}
              title="Học sinh vắng có phép"
              content={form.absentWithPermission}
            />
            <InfoBlock
              icon={<ShieldAlert className="h-4 w-4 text-rose-600" />}
              title="Học sinh vắng không phép"
              content={form.absentWithoutPermission}
              tone="warning"
            />
          </div>

          <InfoBlock
            icon={<ClipboardList className="h-4 w-4 text-primary" />}
            title={`Nền nếp & Kỷ luật trong tuần${form.disciplineRankOrScore ? ` (${form.disciplineRankOrScore})` : ""}`}
            content={form.disciplineOverview}
          />

          <InfoBlock
            icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
            title="Học sinh vi phạm nổi bật / Cần uốn nắn"
            content={form.notableViolations}
            tone="warning"
          />

          <InfoBlock
            icon={<BookOpen className="h-4 w-4 text-indigo-600" />}
            title="Tình hình học tập các bộ môn"
            content={form.academicOverview}
          />

          <InfoBlock
            icon={<Award className="h-4 w-4 text-emerald-600" />}
            title="Tuyên dương / Khen thưởng trong tuần"
            content={form.commendations}
            tone="success"
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoBlock
              icon={<UserCheck className="h-4 w-4 text-sky-600" />}
              title="Phối hợp Cha mẹ học sinh (PHHS)"
              content={form.parentCoordination}
            />
            <InfoBlock
              icon={<Sparkles className="h-4 w-4 text-purple-600" />}
              title="Hoạt động Đội & Phong trào"
              content={form.movementActivities}
            />
          </div>

          <InfoBlock
            icon={<Calendar className="h-4 w-4 text-primary" />}
            title="Kế hoạch / Trọng tâm tuần tiếp theo"
            content={form.nextWeekPlan}
            tone="info"
          />

          <InfoBlock
            icon={<MessageSquare className="h-4 w-4 text-rose-600" />}
            title="Kiến nghị / Đề xuất với Hiệu trưởng & BGH"
            content={form.teacherRecommendations}
            tone="warning"
          />
        </div>
      ) : null}

      {/* Photos Section */}
      {photos.length > 0 || report.photoNote ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Camera className="h-4 w-4 text-primary" />
              <span>Ảnh chụp Sổ Sinh Hoạt giấy ({photos.length} trang)</span>
            </div>
            {photos.length > 0 ? (
              <span className="text-xs text-muted-foreground">Bấm vào ảnh để phóng to hoặc xoay</span>
            ) : null}
          </div>

          {report.photoNote?.trim() ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-sm text-foreground">
              <span className="font-semibold text-blue-900">Ghi chú kèm ảnh của GVCN: </span>
              {report.photoNote}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo, idx) => (
              <div
                key={photo.photoId}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div
                  className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden bg-slate-100"
                  onClick={() => openPhoto(idx)}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || `Trang ${idx + 1}`}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition group-hover:bg-slate-950/25">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow transition group-hover:opacity-100">
                      <Eye className="h-3.5 w-3.5" />
                      Phóng to & Xoay
                    </span>
                  </div>
                  <div className="absolute left-2 top-2">
                    <Badge tone="neutral">Trang {idx + 1}</Badge>
                  </div>
                </div>
                {photo.caption ? (
                  <p className="border-t border-border px-3 py-2 text-xs text-foreground">
                    {photo.caption}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <HomeroomPhotoLightbox
        photos={photos}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
