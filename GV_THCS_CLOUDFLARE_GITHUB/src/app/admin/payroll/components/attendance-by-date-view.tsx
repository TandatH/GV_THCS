"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, PencilLine, UserCheck, XCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import {
  type ScheduleWithMeta,
  getSubjectColorClasses,
} from "../types";

interface AttendanceByDateViewProps {
  schedules: ScheduleWithMeta[];
  onConfirmSchedule: (schedule: ScheduleWithMeta) => void;
  onAdjustSchedule: (schedule: ScheduleWithMeta) => void;
  onBatchConfirmDate: (dateSchedules: ScheduleWithMeta[]) => void;
  actionLoading: boolean;
}

export function AttendanceByDateView({
  schedules,
  onConfirmSchedule,
  onAdjustSchedule,
  onBatchConfirmDate,
  actionLoading,
}: AttendanceByDateViewProps) {
  // Group schedules by calculated date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, ScheduleWithMeta[]>();
    for (const schedule of schedules) {
      const date = schedule.calculatedDate || "unknown";
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(schedule);
    }

    return Array.from(map.entries())
      .map(([date, items]) => {
        const sortedItems = [...items].sort((a, b) => a.startPeriodNum - b.startPeriodNum);
        const dayMeta = items[0];
        const pendingCount = items.filter((i) => i.effectiveStatus === "pending_past").length;
        const confirmedCount = items.filter((i) => i.effectiveStatus === "confirmed" || i.effectiveStatus === "adjusted").length;
        const totalCount = items.length;
        const isAllDone = pendingCount === 0;

        return {
          date,
          dayName: dayMeta?.dayName || "—",
          formattedDate: dayMeta?.formattedDate || date,
          isToday: dayMeta?.isToday || false,
          isPast: dayMeta?.isPast || false,
          items: sortedItems,
          pendingCount,
          confirmedCount,
          totalCount,
          isAllDone,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules]);

  // Collapsible state for each date (default open dates that have pending items)
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});

  const toggleDate = (date: string) => {
    setOpenDates((prev) => ({
      ...prev,
      [date]: prev[date] !== undefined ? !prev[date] : false, // if undefined, initial state is open
    }));
  };

  const isDateOpen = (date: string, hasPending: boolean) => {
    if (openDates[date] !== undefined) return openDates[date];
    // Default open if it has pending items or is today
    return hasPending;
  };

  if (groupedByDate.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Không có lịch dạy nào phù hợp với bộ lọc hiện tại.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groupedByDate.map((group) => {
        const isOpen = isDateOpen(group.date, group.pendingCount > 0);
        const pendingSchedules = group.items.filter((i) => i.effectiveStatus === "pending_past");

        return (
          <div
            key={group.date}
            className={cn(
              "overflow-hidden rounded-xl border transition-all",
              group.pendingCount > 0
                ? "border-amber-300 bg-card shadow-sm"
                : "border-border bg-card",
            )}
          >
            {/* Date Header Card */}
            <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between bg-muted/30">
              <button
                type="button"
                onClick={() => toggleDate(group.date)}
                className="flex items-center gap-3 text-left focus:outline-none"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-card border border-border text-muted-foreground shadow-xs">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-foreground">
                      {group.dayName}, {group.formattedDate}
                    </span>
                    {group.isToday ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                        Hôm nay
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{group.totalCount} tiết dạy</span>
                    <span>·</span>
                    <span className={group.isAllDone ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                      Đã duyệt {group.confirmedCount}/{group.totalCount}
                    </span>
                    {group.pendingCount > 0 ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[11px] font-bold text-amber-800">
                        Còn {group.pendingCount} tiết chờ duyệt
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-medium">Đã hoàn tất</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Action for the day */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {group.pendingCount > 0 ? (
                  <Button
                    size="sm"
                    loading={actionLoading}
                    onClick={() => onBatchConfirmDate(pendingSchedules)}
                    className="h-8 gap-1.5 bg-amber-600 px-3 text-xs text-white hover:bg-amber-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Duyệt tất cả {group.pendingCount} tiết chờ
                  </Button>
                ) : null}
              </div>
            </div>

            {/* List of schedules in this date */}
            {isOpen && (
              <div className="divide-y divide-border/60 border-t border-border">
                {group.items.map((schedule) => {
                  const subjectColors = getSubjectColorClasses(schedule.resolvedSubjectName);

                  return (
                    <div
                      key={schedule.id}
                      className={cn(
                        "flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/30",
                        schedule.effectiveStatus === "pending_past" && "bg-amber-50/20",
                      )}
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        {/* Period badge */}
                        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-center shrink-0">
                          <span className="text-xs font-bold text-foreground">{schedule.periodLabel}</span>
                          <span className="text-[10px] text-muted-foreground">{schedule.periodCountNum} tiết</span>
                        </div>

                        {/* Details */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-foreground">
                              {schedule.resolvedTeacherName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({schedule.resolvedDepartmentName})
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
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            {schedule.effectiveStatus === "confirmed" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <CheckCircle2 className="h-3 w-3" /> Đã xác nhận
                              </span>
                            ) : schedule.effectiveStatus === "adjusted" ? (
                              <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                                <UserCheck className="h-3 w-3" /> Dạy thay: {schedule.effectiveTeacherName}
                              </span>
                            ) : schedule.effectiveStatus === "absent" ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                                <XCircle className="h-3 w-3" /> Vắng / Nghỉ phép
                              </span>
                            ) : schedule.effectiveStatus === "pending_past" ? (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                                <AlertCircle className="h-3 w-3 text-amber-600" /> Chưa đối soát
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <Clock className="h-3 w-3" /> Sắp tới
                              </span>
                            )}

                            {schedule.checkinDoc?.adjustmentReason ? (
                              <span className="text-muted-foreground">· Lý do: {schedule.checkinDoc.adjustmentReason}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {schedule.effectiveStatus !== "confirmed" ? (
                          <Button
                            size="sm"
                            loading={actionLoading}
                            onClick={() => onConfirmSchedule(schedule)}
                            className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Duyệt
                          </Button>
                        ) : null}

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onAdjustSchedule(schedule)}
                          className="h-8 gap-1 px-2.5 text-xs"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
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
