"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  Search,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import {
  type ScheduleWithMeta,
  type TeacherPayrollSummaryRow,
  cleanNoteText,
  getSubjectColorClasses,
  statusBadgeTone,
  statusLabelVi,
} from "../types";

interface TeacherScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
  teacherRow: TeacherPayrollSummaryRow | null;
  schedules: ScheduleWithMeta[];
}

export function TeacherScheduleDrawer({
  open,
  onClose,
  teacherRow,
  schedules,
}: TeacherScheduleDrawerProps) {
  const [filterLevel, setFilterLevel] = useState<"ALL" | "PRIMARY" | "SECONDARY">("ALL");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !teacherRow) return null;

  // Filter schedules belonging to this teacher
  const teacherSchedules = schedules.filter(
    (s) =>
      s.effectiveTeacherId === teacherRow.teacherId ||
      s.actualTeacherId === teacherRow.teacherId ||
      s.teacherId === teacherRow.teacherId
  );

  const filteredSchedules = teacherSchedules.filter((s) => {
    if (filterLevel !== "ALL" && s.schoolLevel !== filterLevel) return false;
    if (keyword.trim()) {
      const q = keyword.trim().toLowerCase();
      const pool = [
        s.resolvedClassName,
        s.resolvedSubjectName,
        s.formattedDate,
        s.dayName,
        s.effectiveTeacherName,
        s.resolvedTeacherName,
        s.cleanedNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!pool.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex h-full w-full max-w-3xl flex-col bg-background shadow-2xl transition-transform animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border bg-muted/40 px-6 py-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {teacherRow.teacherName}
              </h2>
              {teacherRow.teacherCode ? (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono font-semibold text-muted-foreground border">
                  {teacherRow.teacherCode}
                </span>
              ) : null}
              <Badge
                tone={
                  teacherRow.teachingLevel === "BOTH"
                    ? "warning"
                    : teacherRow.teachingLevel === "PRIMARY"
                      ? "info"
                      : "neutral"
                }
              >
                {teacherRow.teachingLevelLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs font-medium text-muted-foreground">
                {teacherRow.departmentName}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Tra cứu chi tiết toàn bộ các tiết phân công, điểm danh thực dạy và xử lý dạy thay trong tháng.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            aria-label="Đóng bảng chi tiết"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Summary Strip */}
        <div className="grid grid-cols-2 gap-2 border-b border-border bg-card px-6 py-3 sm:grid-cols-4">
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-2.5">
            <div className="text-[11px] font-semibold text-teal-800 uppercase tracking-wide">
              Tiết Cấp 1
            </div>
            <div className="mt-1 flex items-baseline gap-1 text-base font-bold text-teal-900">
              <span>{teacherRow.primaryActual}</span>
              <span className="text-xs font-normal text-teal-700">
                / {teacherRow.primaryStandard ?? "—"} định mức
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5">
            <div className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wide">
              Tiết Cấp 2
            </div>
            <div className="mt-1 flex items-baseline gap-1 text-base font-bold text-indigo-900">
              <span>{teacherRow.secondaryActual}</span>
              <span className="text-xs font-normal text-indigo-700">
                / {teacherRow.secondaryStandard ?? "—"} định mức
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
            <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide">
              Dạy thay (+)
            </div>
            <div className="mt-1 text-base font-bold text-blue-900">
              +{teacherRow.substituteCount} tiết
            </div>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
            <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wide">
              Báo vắng (-)
            </div>
            <div className="mt-1 text-base font-bold text-rose-900">
              -{teacherRow.absentCount} tiết
            </div>
          </div>
        </div>

        {/* Search & Filter bar inside Drawer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3 bg-muted/20">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Lọc cấp:</span>
            <button
              type="button"
              onClick={() => setFilterLevel("ALL")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                filterLevel === "ALL"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Tất cả ({teacherSchedules.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel("PRIMARY")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                filterLevel === "PRIMARY"
                  ? "bg-teal-600 text-white shadow-xs"
                  : "bg-teal-50 text-teal-800 hover:bg-teal-100"
              )}
            >
              Cấp 1
            </button>
            <button
              type="button"
              onClick={() => setFilterLevel("SECONDARY")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                filterLevel === "SECONDARY"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              )}
            >
              Cấp 2
            </button>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm theo môn, lớp, ngày..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Schedule List Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredSchedules.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Không có tiết dạy nào phù hợp với điều kiện tìm kiếm.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[650px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-[11px] font-bold text-muted-foreground">
                    <th className="px-3.5 py-3">Ngày & Tiết dạy</th>
                    <th className="px-3.5 py-3">Cấp học</th>
                    <th className="px-3.5 py-3">Lớp & Môn</th>
                    <th className="px-3.5 py-3">Thực hiện dạy</th>
                    <th className="px-3.5 py-3">Trạng thái</th>
                    <th className="px-3.5 py-3">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSchedules.map((schedule) => {
                    const subjectColors = getSubjectColorClasses(schedule.resolvedSubjectName);
                    const isSubstitute =
                      schedule.effectiveTeacherId !== (schedule.originalTeacherId || schedule.teacherId);
                    const noteText = cleanNoteText(
                      schedule.checkinDoc?.adjustmentReason,
                      schedule.checkinDoc?.note
                    );

                    return (
                      <tr key={schedule.id} className="transition hover:bg-muted/40">
                        {/* Ngày & Tiết */}
                        <td className="px-3.5 py-2.5">
                          <div className="font-bold text-foreground">
                            {schedule.dayName}, {schedule.formattedDate}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {schedule.periodLabel} ({schedule.periodCountNum} tiết)
                          </div>
                        </td>

                        {/* Cấp học */}
                        <td className="px-3.5 py-2.5">
                          {schedule.schoolLevel === "PRIMARY" ? (
                            <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-bold text-teal-800 text-[11px]">
                              Cấp 1
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-bold text-indigo-800 text-[11px]">
                              Cấp 2
                            </span>
                          )}
                        </td>

                        {/* Lớp & Môn */}
                        <td className="px-3.5 py-2.5">
                          <div className="font-semibold text-foreground">
                            {schedule.resolvedClassName}
                          </div>
                          <span
                            className={cn(
                              "inline-block rounded px-1.5 py-0.2 text-[10px] font-medium border mt-0.5",
                              subjectColors.bg,
                              subjectColors.text,
                              subjectColors.border
                            )}
                          >
                            {schedule.resolvedSubjectName}
                          </span>
                        </td>

                        {/* Thực hiện dạy (Gộp phân công & thực dạy) */}
                        <td className="px-3.5 py-2.5">
                          {isSubstitute ? (
                            <div className="font-medium">
                              <span className="text-slate-500 line-through mr-1">
                                {schedule.resolvedTeacherName}
                              </span>
                              <span className="font-bold text-blue-700">
                                ➔ {schedule.effectiveTeacherName}
                              </span>
                              <span className="ml-1 rounded bg-blue-100 px-1 py-0.2 text-[9px] font-bold text-blue-800">
                                Dạy thay
                              </span>
                            </div>
                          ) : (
                            <span className="font-semibold text-foreground">
                              {schedule.effectiveTeacherName}
                            </span>
                          )}
                        </td>

                        {/* Trạng thái */}
                        <td className="px-3.5 py-2.5">
                          <Badge tone={statusBadgeTone(schedule.effectiveStatus)}>
                            {statusLabelVi(schedule.effectiveStatus)}
                          </Badge>
                        </td>

                        {/* Ghi chú */}
                        <td className="px-3.5 py-2.5 text-muted-foreground max-w-[180px]">
                          {noteText ? (
                            <span className="text-foreground font-medium truncate block" title={noteText}>
                              {noteText}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            Tổng cộng: <strong>{filteredSchedules.length}</strong> tiết hiển thị
          </div>
          <Button variant="secondary" onClick={onClose}>
            Đóng bảng chi tiết
          </Button>
        </div>
      </div>
    </div>
  );
}
