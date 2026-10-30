"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, PencilLine, UserCheck, XCircle, Layers } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import {
  type ScheduleWithMeta,
  getSubjectColorClasses,
} from "../types";
import { isHomeroomSubject } from "@/lib/exports/payroll-excel";

interface AttendanceByTeacherViewProps {
  schedules: ScheduleWithMeta[];
  onConfirmSchedule: (schedule: ScheduleWithMeta) => void;
  onAdjustSchedule: (schedule: ScheduleWithMeta) => void;
  onBatchConfirmTeacher: (teacherSchedules: ScheduleWithMeta[]) => void;
  actionLoading: boolean;
}

export function AttendanceByTeacherView({
  schedules,
  onConfirmSchedule,
  onAdjustSchedule,
  onBatchConfirmTeacher,
  actionLoading,
}: AttendanceByTeacherViewProps) {
  // Group schedules by assigned teacher
  const groupedByTeacher = useMemo(() => {
    const map = new Map<string, ScheduleWithMeta[]>();
    for (const schedule of schedules) {
      const teacherId = String(schedule.effectiveTeacherId || schedule.actualTeacherId || schedule.teacherId || "unknown");
      if (!map.has(teacherId)) map.set(teacherId, []);
      map.get(teacherId)!.push(schedule);
    }

    return Array.from(map.entries())
      .map(([teacherId, items]) => {
        const sortedItems = [...items].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate) || a.startPeriodNum - b.startPeriodNum);
        const meta = items[0];
        const teacherName = meta?.effectiveTeacherName || meta?.resolvedTeacherName || teacherId;
        const departmentName = meta?.resolvedDepartmentName || "—";
        const teacherType = meta?.teacherType || "";

        // Phân tách Cấp 1 và Cấp 2
        const primaryItems = sortedItems.filter((i) => i.schoolLevel === "PRIMARY");
        const secondaryItems = sortedItems.filter((i) => i.schoolLevel === "SECONDARY");

        const primaryPeriods = primaryItems.reduce((sum, i) => sum + i.periodCountNum, 0);
        const secondaryPeriods = secondaryItems.reduce((sum, i) => sum + i.periodCountNum, 0);

        const primaryConfirmed = primaryItems
          .filter((i) => i.effectiveStatus === "confirmed" || i.effectiveStatus === "adjusted")
          .reduce((sum, i) => sum + i.attendance.payablePeriods, 0);
        const secondaryConfirmed = secondaryItems
          .filter((i) => i.effectiveStatus === "confirmed" || i.effectiveStatus === "adjusted")
          .reduce((sum, i) => sum + i.attendance.payablePeriods, 0);

        const primaryHomeroomPeriods = primaryItems
          .filter((i) => isHomeroomSubject(i.resolvedSubjectName, i.subjectCode, i.subjectId))
          .reduce((sum, i) => sum + i.periodCountNum, 0);
        const secondaryHomeroomPeriods = secondaryItems
          .filter((i) => isHomeroomSubject(i.resolvedSubjectName, i.subjectCode, i.subjectId))
          .reduce((sum, i) => sum + i.periodCountNum, 0);

        const totalPeriods = items.reduce((sum, i) => sum + i.periodCountNum, 0);
        const confirmedPeriods = items
          .filter((i) => i.effectiveStatus === "confirmed" || i.effectiveStatus === "adjusted")
          .reduce((sum, i) => sum + i.attendance.payablePeriods, 0);
        const pendingPastPeriods = items
          .filter((i) => i.effectiveStatus === "pending_past")
          .reduce((sum, i) => sum + i.periodCountNum, 0);
        const absentPeriods = items
          .filter((i) => i.effectiveStatus === "absent")
          .reduce((sum, i) => sum + i.periodCountNum, 0);

        const pendingItems = items.filter((i) => i.effectiveStatus === "pending_past");
        const completionRate = totalPeriods > 0 ? Math.round((confirmedPeriods / totalPeriods) * 100) : 100;
        const teachesBoth = primaryPeriods > 0 && secondaryPeriods > 0;

        return {
          teacherId,
          teacherName,
          departmentName,
          teacherType,
          totalPeriods,
          confirmedPeriods,
          pendingPastPeriods,
          absentPeriods,
          primaryItems,
          secondaryItems,
          primaryPeriods,
          secondaryPeriods,
          primaryConfirmed,
          secondaryConfirmed,
          primaryHomeroomPeriods,
          secondaryHomeroomPeriods,
          teachesBoth,
          items: sortedItems,
          pendingItems,
          completionRate,
        };
      })
      .sort((a, b) => {
        // Teachers with pending items first, then alphabetical by name
        if (b.pendingPastPeriods !== a.pendingPastPeriods) {
          return b.pendingPastPeriods - a.pendingPastPeriods;
        }
        return a.teacherName.localeCompare(b.teacherName, "vi");
      });
  }, [schedules]);

  const [openTeachers, setOpenTeachers] = useState<Record<string, boolean>>({});

  const toggleTeacher = (teacherId: string) => {
    setOpenTeachers((prev) => ({
      ...prev,
      [teacherId]: !prev[teacherId],
    }));
  };

  if (groupedByTeacher.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Không có dữ liệu giáo viên phù hợp với bộ lọc hiện tại.
      </Card>
    );
  }

  const renderScheduleRow = (schedule: ScheduleWithMeta) => {
    const subjectColors = getSubjectColorClasses(schedule.resolvedSubjectName);
    const isSHL = isHomeroomSubject(schedule.resolvedSubjectName, schedule.subjectCode, schedule.subjectId);

    return (
      <div
        key={schedule.id}
        className={cn(
          "flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/30",
          schedule.effectiveStatus === "pending_past" && "bg-amber-50/20",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-xs font-semibold text-foreground w-36">
            {schedule.dayName}, {schedule.formattedDate}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-foreground">{schedule.periodLabel}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.2 text-[10px] font-bold border",
                schedule.schoolLevel === "PRIMARY"
                  ? "bg-teal-50 text-teal-800 border-teal-200"
                  : "bg-indigo-50 text-indigo-800 border-indigo-200",
              )}
            >
              {schedule.schoolLevel === "PRIMARY" ? "Cấp 1" : "Cấp 2"}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.2 text-[11px] font-semibold text-slate-700">
              {schedule.resolvedClassName}
            </span>
            <span
              className={cn(
                "rounded border px-1.5 py-0.2 text-[11px] font-medium",
                subjectColors.bg,
                subjectColors.text,
                subjectColors.border,
              )}
            >
              {schedule.resolvedSubjectName}
            </span>
            {isSHL ? (
              <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                Sinh hoạt lớp
              </span>
            ) : null}
          </div>

          {schedule.effectiveStatus === "confirmed" ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Đã xác nhận
            </span>
          ) : schedule.effectiveStatus === "adjusted" ? (
            <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-semibold">
              <UserCheck className="h-3 w-3" />{" "}
              {schedule.isSubstituted
                ? `Dạy thay cho ${schedule.originalTeacherName || schedule.resolvedTeacherName}`
                : `Dạy thay: ${schedule.effectiveTeacherName}`}
            </span>
          ) : schedule.effectiveStatus === "absent" ? (
            <span className="inline-flex items-center gap-1 text-xs text-rose-700 font-semibold">
              <XCircle className="h-3 w-3" /> Vắng / Nghỉ phép
            </span>
          ) : schedule.effectiveStatus === "pending_past" ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-800 font-bold">
              <AlertCircle className="h-3 w-3 text-amber-600" /> Chưa đối soát
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3 w-3" /> Sắp tới
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          {schedule.effectiveStatus !== "confirmed" ? (
            <Button
              size="sm"
              loading={actionLoading}
              onClick={() => onConfirmSchedule(schedule)}
              className="h-7 gap-1 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-3 w-3" />
              Duyệt
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAdjustSchedule(schedule)}
            className="h-7 gap-1 px-2 text-xs"
          >
            <PencilLine className="h-3 w-3" />
            Sửa
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {groupedByTeacher.map((group) => {
        const isOpen = openTeachers[group.teacherId] ?? (group.pendingPastPeriods > 0);

        return (
          <div
            key={group.teacherId}
            className={cn(
              "overflow-hidden rounded-xl border transition-all",
              group.pendingPastPeriods > 0
                ? "border-amber-300 bg-card shadow-sm"
                : "border-border bg-card",
            )}
          >
            {/* Header */}
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/30">
              <button
                type="button"
                onClick={() => toggleTeacher(group.teacherId)}
                className="flex items-center gap-3 text-left focus:outline-none"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-card border border-border text-muted-foreground shadow-xs">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials(group.teacherName)}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-base text-foreground">{group.teacherName}</span>
                    <span className="text-xs text-muted-foreground">· {group.departmentName}</span>
                    {group.teachesBoth ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 border border-indigo-200 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                        <Layers className="h-3 w-3 text-indigo-700" /> Dạy 2 cấp (C1 & C2)
                      </span>
                    ) : group.primaryPeriods > 0 ? (
                      <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                        Cấp 1
                      </span>
                    ) : group.secondaryPeriods > 0 ? (
                      <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 text-[10px] font-bold text-indigo-800">
                        Cấp 2
                      </span>
                    ) : null}
                    {group.teacherType === "thinh_giang" ? (
                      <span className="rounded bg-purple-50 px-1.5 py-0.2 text-[10px] font-semibold text-purple-700">
                        Thỉnh giảng
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span className="font-semibold text-foreground">Tổng {group.totalPeriods} tiết</span>
                    <span>·</span>
                    {group.teachesBoth ? (
                      <>
                        <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 font-bold text-teal-800">
                          Cấp 1: {group.primaryConfirmed}/{group.primaryPeriods} tiết{group.primaryHomeroomPeriods > 0 ? ` (SHL: ${group.primaryHomeroomPeriods})` : ""}
                        </span>
                        <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 font-bold text-indigo-800">
                          Cấp 2: {group.secondaryConfirmed}/{group.secondaryPeriods} tiết{group.secondaryHomeroomPeriods > 0 ? ` (SHL: ${group.secondaryHomeroomPeriods})` : ""}
                        </span>
                        <span>·</span>
                      </>
                    ) : (
                      <>
                        {group.primaryHomeroomPeriods > 0 || group.secondaryHomeroomPeriods > 0 ? (
                          <>
                            <span className="text-amber-800 font-medium">
                              SHL: {group.primaryHomeroomPeriods + group.secondaryHomeroomPeriods} tiết
                            </span>
                            <span>·</span>
                          </>
                        ) : null}
                      </>
                    )}
                    <span className="text-emerald-700 font-medium">Đã duyệt: {group.confirmedPeriods} tiết</span>
                    {group.pendingPastPeriods > 0 ? (
                      <>
                        <span>·</span>
                        <span className="font-bold text-amber-800">Chờ đối soát: {group.pendingPastPeriods} tiết</span>
                      </>
                    ) : null}
                    {group.absentPeriods > 0 ? (
                      <>
                        <span>·</span>
                        <span className="text-rose-700">Vắng / Nghỉ phép: {group.absentPeriods} tiết</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </button>

              {/* Action */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {group.pendingItems.length > 0 ? (
                  <Button
                    size="sm"
                    loading={actionLoading}
                    onClick={() => onBatchConfirmTeacher(group.pendingItems)}
                    className="h-8 gap-1.5 bg-amber-600 px-3 text-xs text-white hover:bg-amber-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xác nhận tất cả {group.pendingItems.length} tiết chờ
                  </Button>
                ) : null}
              </div>
            </div>

            {/* List */}
            {isOpen && (
              <div className="border-t border-border">
                {group.teachesBoth ? (
                  <div>
                    {/* Block Cấp 1 */}
                    {group.primaryItems.length > 0 && (
                      <div>
                        <div className="bg-teal-50/70 border-b border-teal-100 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-teal-700 text-white font-bold px-2 py-0.5 text-[10px] uppercase tracking-wider">
                              Cấp 1 · Tiểu học
                            </span>
                            <span className="font-semibold text-teal-950">
                              {group.primaryItems.length} buổi · {group.primaryPeriods} tiết thực dạy
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-teal-800">
                            <span>Đã duyệt: <strong>{group.primaryConfirmed}</strong> tiết</span>
                            {group.primaryHomeroomPeriods > 0 && (
                              <span className="rounded bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 font-semibold text-[11px]">
                                Sinh hoạt lớp: {group.primaryHomeroomPeriods} tiết
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="divide-y divide-border/60">
                          {group.primaryItems.map(renderScheduleRow)}
                        </div>
                      </div>
                    )}

                    {/* Block Cấp 2 */}
                    {group.secondaryItems.length > 0 && (
                      <div className={group.primaryItems.length > 0 ? "border-t-2 border-border" : ""}>
                        <div className="bg-indigo-50/70 border-b border-indigo-100 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-indigo-700 text-white font-bold px-2 py-0.5 text-[10px] uppercase tracking-wider">
                              Cấp 2 · THCS
                            </span>
                            <span className="font-semibold text-indigo-950">
                              {group.secondaryItems.length} buổi · {group.secondaryPeriods} tiết thực dạy
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-indigo-800">
                            <span>Đã duyệt: <strong>{group.secondaryConfirmed}</strong> tiết</span>
                            {group.secondaryHomeroomPeriods > 0 && (
                              <span className="rounded bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 font-semibold text-[11px]">
                                Sinh hoạt lớp: {group.secondaryHomeroomPeriods} tiết
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="divide-y divide-border/60">
                          {group.secondaryItems.map(renderScheduleRow)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {group.items.map(renderScheduleRow)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
