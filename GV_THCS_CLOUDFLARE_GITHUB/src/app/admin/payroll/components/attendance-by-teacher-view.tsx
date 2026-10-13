"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, PencilLine, UserCheck, XCircle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import {
  type ScheduleWithMeta,
  getSubjectColorClasses,
} from "../types";

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

        return {
          teacherId,
          teacherName,
          departmentName,
          teacherType,
          totalPeriods,
          confirmedPeriods,
          pendingPastPeriods,
          absentPeriods,
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
                    {group.teacherType === "thinh_giang" ? (
                      <span className="rounded bg-purple-50 px-1.5 py-0.2 text-[10px] font-semibold text-purple-700">
                        Thỉnh giảng
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>Tổng {group.totalPeriods} tiết</span>
                    <span>·</span>
                    <span className="text-emerald-700 font-medium">Đã xác nhận: {group.confirmedPeriods} tiết</span>
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
              <div className="divide-y divide-border/60 border-t border-border">
                {group.items.map((schedule) => {
                  const subjectColors = getSubjectColorClasses(schedule.resolvedSubjectName);

                  return (
                    <div
                      key={schedule.id}
                      className={cn(
                        "flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/30",
                        schedule.effectiveStatus === "pending_past" && "bg-amber-50/20",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-semibold text-foreground w-36">
                          {schedule.dayName}, {schedule.formattedDate}
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-foreground">{schedule.periodLabel}</span>
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
                        </div>

                        {schedule.effectiveStatus === "confirmed" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Đã xác nhận
                          </span>
                        ) : schedule.effectiveStatus === "adjusted" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-semibold">
                            <UserCheck className="h-3 w-3" /> {schedule.isSubstituted ? `Dạy thay cho ${schedule.originalTeacherName || schedule.resolvedTeacherName}` : `Dạy thay: ${schedule.effectiveTeacherName}`}
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
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
