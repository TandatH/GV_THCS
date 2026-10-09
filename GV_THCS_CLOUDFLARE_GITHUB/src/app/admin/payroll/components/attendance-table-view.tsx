"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, MoreHorizontal, PencilLine, UserCheck, XCircle } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import {
  type ScheduleWithMeta,
  cleanNoteText,
  getSubjectColorClasses,
  statusBadgeTone,
  statusLabelVi,
} from "../types";

interface AttendanceTableViewProps {
  schedules: ScheduleWithMeta[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllPage: (ids: string[]) => void;
  onClearSelection: () => void;
  onConfirmSchedule: (schedule: ScheduleWithMeta) => void;
  onAdjustSchedule: (schedule: ScheduleWithMeta) => void;
  onBatchConfirm: (ids: string[], status: "confirmed" | "absent") => void;
  actionLoading: boolean;
}

export function AttendanceTableView({
  schedules,
  selectedIds,
  onToggleSelect,
  onSelectAllPage,
  onClearSelection,
  onConfirmSchedule,
  onAdjustSchedule,
  onBatchConfirm,
  actionLoading,
}: AttendanceTableViewProps) {
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Pagination calculation
  const totalPages = Math.ceil(schedules.length / pageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentRows = schedules.slice(startIndex, startIndex + pageSize);

  const currentPageIds = currentRows.map((r) => r.id);
  const isAllCurrentSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));
  const isSomeCurrentSelected = currentPageIds.some((id) => selectedIds.has(id));

  const handleSelectAllChange = () => {
    if (isAllCurrentSelected) {
      onSelectAllPage([]);
    } else {
      onSelectAllPage(currentPageIds);
    }
  };

  if (schedules.length === 0) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6 text-muted-foreground" />}
        title="Không tìm thấy lịch dạy phù hợp"
        description="Thử thay đổi bộ lọc trạng thái, tìm kiếm hoặc chọn tháng khác."
      />
    );
  }

  return (
    <div className="relative">
      {/* Floating Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/95 px-4 py-2.5 text-white shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-primary">
              {selectedIds.size}
            </span>
            <span>lịch dạy đang được chọn</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={actionLoading}
              onClick={() => onBatchConfirm(Array.from(selectedIds), "confirmed")}
              className="h-8 border-none bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Xác nhận đã dạy ({selectedIds.size})
            </Button>

            <Button
              size="sm"
              variant="secondary"
              loading={actionLoading}
              onClick={() => onBatchConfirm(Array.from(selectedIds), "absent")}
              className="h-8 border-none bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <XCircle className="h-3.5 w-3.5" />
              Đánh dấu vắng ({selectedIds.size})
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onClearSelection}
              className="h-8 text-xs text-white/80 hover:bg-white/10 hover:text-white"
            >
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <th className="w-10 px-3 py-3.5 text-center">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả trên trang này"
                  checked={isAllCurrentSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isSomeCurrentSelected && !isAllCurrentSelected;
                  }}
                  onChange={handleSelectAllChange}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </th>
              <th className="px-3 py-3.5">Ngày & Tiết dạy</th>
              <th className="px-3 py-3.5">Cấp học</th>
              <th className="px-3 py-3.5">Lớp & Môn học</th>
              <th className="px-3 py-3.5">Giáo viên thực hiện</th>
              <th className="px-3 py-3.5">Trạng thái chấm công</th>
              <th className="px-3 py-3.5">Ghi chú / Điều chỉnh</th>
              <th className="w-48 px-3 py-3.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {currentRows.map((schedule) => {
              const isSelected = selectedIds.has(schedule.id);
              const subjectColors = getSubjectColorClasses(schedule.resolvedSubjectName);
              const isSubstituted =
                schedule.isSubstituted ||
                Boolean(
                  schedule.effectiveTeacherId &&
                  schedule.effectiveTeacherId !== (schedule.originalTeacherId || schedule.teacherId)
                );
              const noteText = cleanNoteText(schedule.checkinDoc?.adjustmentReason, schedule.checkinDoc?.note);

              return (
                <tr
                  key={schedule.id}
                  className={cn(
                    "transition-colors hover:bg-muted/40",
                    isSelected && "bg-primary/5",
                    schedule.effectiveStatus === "pending_past" && "bg-amber-50/25",
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Chọn lịch dạy"
                      checked={isSelected}
                      onChange={() => onToggleSelect(schedule.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </td>

                  {/* Ngày & Tiết */}
                  <td className="px-3 py-3">
                    <div className="font-semibold text-foreground">
                      {schedule.dayName}, {schedule.formattedDate}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{schedule.periodLabel}</span>
                      <span>·</span>
                      <span>{schedule.periodCountNum} tiết</span>
                      <span>·</span>
                      {schedule.isToday ? (
                        <span className="rounded bg-blue-100 px-1 py-0.2 text-[10px] font-bold text-blue-700">
                          Hôm nay
                        </span>
                      ) : schedule.isPast ? (
                        <span className="text-[11px] text-slate-500">Đã qua</span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sắp tới</span>
                      )}
                    </div>
                  </td>

                  {/* Cấp học */}
                  <td className="px-3 py-3">
                    {schedule.schoolLevel === "PRIMARY" ? (
                      <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">
                        Cấp 1
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-800">
                        Cấp 2
                      </span>
                    )}
                  </td>

                  {/* Lớp & Môn */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {schedule.resolvedClassName}
                      </span>
                      <span
                        className={cn(
                          "inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                          subjectColors.bg,
                          subjectColors.text,
                          subjectColors.border,
                        )}
                      >
                        {schedule.resolvedSubjectName}
                      </span>
                    </div>
                  </td>

                  {/* Giáo viên thực hiện (Gộp Giáo viên phân công & Giáo viên thực dạy) */}
                  <td className="px-3 py-3">
                    {isSubstituted ? (
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-1 flex-wrap">
                          <span className="text-slate-500 line-through text-xs">
                            {schedule.resolvedTeacherName}
                          </span>
                          <span className="text-blue-700 font-bold">
                            ➔ {schedule.effectiveTeacherName}
                          </span>
                          <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-800">
                            Dạy thay
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {schedule.resolvedDepartmentName}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials(schedule.resolvedTeacherName)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">
                            {schedule.resolvedTeacherName}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                            {schedule.resolvedTeacherCode ? <span>{schedule.resolvedTeacherCode} · </span> : null}
                            <span className="font-medium text-slate-600">{schedule.resolvedDepartmentName}</span>
                            {schedule.teacherType === "thinh_giang" ? (
                              <span className="rounded bg-purple-50 px-1 py-0.2 text-[10px] text-purple-700">Thỉnh giảng</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Trạng thái */}
                  <td className="px-3 py-3">
                    {schedule.effectiveStatus === "confirmed" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Đã xác nhận
                      </span>
                    ) : schedule.effectiveStatus === "adjusted" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        <UserCheck className="h-3.5 w-3.5" />
                        Dạy thay
                      </span>
                    ) : schedule.effectiveStatus === "absent" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                        <XCircle className="h-3.5 w-3.5" />
                        Vắng / Nghỉ phép
                      </span>
                    ) : schedule.effectiveStatus === "pending_past" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 animate-pulse">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                        Chưa đối soát
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        Sắp tới
                      </span>
                    )}
                  </td>

                  {/* Ghi chú / Điều chỉnh (Đã dọn text rác) */}
                  <td className="px-3 py-3 text-xs text-muted-foreground max-w-xs">
                    {noteText ? (
                      <p className="font-medium text-foreground truncate" title={noteText}>
                        {noteText}
                      </p>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  {/* Thao tác */}
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {schedule.effectiveStatus !== "confirmed" ? (
                        <Button
                          size="sm"
                          loading={actionLoading}
                          onClick={() => onConfirmSchedule(schedule)}
                          className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                          title="Xác nhận tiết đã dạy"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Duyệt</span>
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onAdjustSchedule(schedule)}
                        className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                        title="Điều chỉnh / Chỉ định dạy thay / Báo vắng"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        <span>Sửa</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          Hiển thị <strong>{startIndex + 1}</strong> – <strong>{Math.min(startIndex + pageSize, schedules.length)}</strong> trên tổng số <strong>{schedules.length}</strong> lịch dạy
        </div>

        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            <option value="15">15 dòng/trang</option>
            <option value="25">25 dòng/trang</option>
            <option value="50">50 dòng/trang</option>
            <option value="100">100 dòng/trang</option>
          </select>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-medium">
              Trang {safePage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
