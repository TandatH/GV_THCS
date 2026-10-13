"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { teacherAttendanceTotals } from "@school/shared";
import { Badge, Button } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { type ScheduleWithMeta, type TeacherPayrollSummaryRow, statusBadgeTone, statusLabelVi } from "../types";

interface TeacherScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
  teacherRow: TeacherPayrollSummaryRow | null;
  schedules: ScheduleWithMeta[];
}

export function TeacherScheduleDrawer({ open, onClose, teacherRow, schedules }: TeacherScheduleDrawerProps) {
  const [filterLevel, setFilterLevel] = useState<"ALL" | "PRIMARY" | "SECONDARY">("ALL");
  const [keyword, setKeyword] = useState("");
  useEffect(() => { setFilterLevel("ALL"); setKeyword(""); }, [teacherRow?.payrollDocId, open]);
  if (!teacherRow) return null;

  const teacherSchedules = schedules.filter((s) => s.effectiveTeacherId === teacherRow.teacherId
    || s.actualTeacherId === teacherRow.teacherId || s.teacherId === teacherRow.teacherId || s.originalTeacherId === teacherRow.teacherId);
  const filteredSchedules = teacherSchedules.filter((s) => {
    if (filterLevel !== "ALL" && s.schoolLevel !== filterLevel) return false;
    const pool = [s.resolvedClassName, s.resolvedSubjectName, s.formattedDate, s.dayName,
      s.effectiveTeacherName, s.originalTeacherName, s.cleanedNote].join(" ").toLocaleLowerCase("vi");
    return pool.includes(keyword.trim().toLocaleLowerCase("vi"));
  });
  const filteredTotals = teacherAttendanceTotals(teacherRow.teacherId, filteredSchedules.map((s) => s.attendance));
  const scheduledPeriods = filteredSchedules.reduce((sum, s) => sum + s.attendance.periodCount, 0);
  const regularActual = teacherRow.primaryActual + teacherRow.secondaryActual - teacherRow.substituteCount;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-background shadow-2xl focus:outline-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-payroll-detail]"))
              .find((button) => button.dataset.payrollDetail === teacherRow.teacherId);
            (opener ?? document.querySelector<HTMLElement>('[aria-label="Bảng tổng hợp công và thù lao"]'))?.focus();
          }}>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <Dialog.Title className="break-words text-lg font-bold">{teacherRow.teacherName}</Dialog.Title>
              <p className="mt-1 text-xs text-muted-foreground">{teacherRow.teacherCode || "Chưa có mã"} · {teacherRow.departmentName} · {teacherRow.teachingLevelLabel}</p>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">Đối chiếu buổi chính khóa, buổi dạy thay và buổi nghỉ trong tháng. Chỉ tiết đã xác nhận mới sinh thù lao.</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 px-0" aria-label="Đóng bảng chi tiết"><X className="h-5 w-5" /></Button></Dialog.Close>
          </div>
          <div className="shrink-0 border-b border-border bg-card px-4 py-3 sm:px-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Thực dạy Cấp 1", value: teacherRow.primaryActual, note: "Đã gồm dạy thay", color: "text-teal-700" },
                { label: "Thực dạy Cấp 2", value: teacherRow.secondaryActual, note: "Đã gồm dạy thay", color: "text-indigo-700" },
                { label: "Dạy thay", value: teacherRow.substituteCount, note: "Đã tính vào thực dạy", color: "text-blue-700" },
                { label: "Tiết vắng", value: teacherRow.absentCount, note: "Đã loại khỏi thực dạy", color: "text-rose-700" },
              ].map((metric) => <div key={metric.label} className="rounded-lg border border-border px-2 py-2">
                <p className="text-[11px] font-medium text-muted-foreground">{metric.label}</p>
                <p className={cn("mt-1 text-lg font-bold tabular-nums", metric.color)}>{metric.value}<span className="ml-1 text-[10px] font-normal">tiết</span></p>
                <p className="text-[10px] leading-4 text-muted-foreground">{metric.note}</p>
              </div>)}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Thực dạy: <strong className="text-foreground">{regularActual} chính khóa + {teacherRow.substituteCount} dạy thay = {teacherRow.primaryActual + teacherRow.secondaryActual} tiết.</strong></p>
            <p className="text-xs leading-5 text-muted-foreground">Thù lao: <strong className="text-primary">{formatCurrency(teacherRow.totalAmount)}</strong>. Định mức chỉ để tham khảo, không trừ khi tính tiền.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
            <div className="flex gap-1" role="group" aria-label="Lọc cấp học trong chi tiết">
              {(["ALL", "PRIMARY", "SECONDARY"] as const).map((level) => <button type="button" key={level} aria-pressed={filterLevel === level} onClick={() => setFilterLevel(level)} className={cn("rounded-lg px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", filterLevel === level ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {level === "ALL" ? "Tất cả" : level === "PRIMARY" ? "Cấp 1" : "Cấp 2"}
              </button>)}
            </div>
            <div className="relative min-w-0 flex-[1_1_180px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Tìm buổi dạy theo môn, lớp, ngày hoặc giáo viên" type="search" placeholder="Tìm môn, lớp, ngày, giáo viên..." value={keyword} onChange={(e) => setKeyword(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
            {!filteredSchedules.length ? <p className="py-10 text-center text-sm text-muted-foreground">Không có buổi dạy phù hợp.</p> : (
              <div className="space-y-3" role="list" aria-label="Các buổi dạy của giáo viên">
                {filteredSchedules.map((s) => {
                  const own = teacherAttendanceTotals(teacherRow.teacherId, [s.attendance]);
                  const wasReplaced = s.attendance.originalTeacherId === teacherRow.teacherId && s.attendance.isSubstituted;
                  const substitutes = s.effectiveTeacherId === teacherRow.teacherId && s.attendance.isSubstituted;
                  const isAbsent = own.absentCount > 0;
                  const kind = wasReplaced ? "Nghỉ / Được dạy thay" : substitutes ? "Dạy thay" : isAbsent ? "Nghỉ / Báo vắng"
                    : s.effectiveTeacherId !== teacherRow.teacherId ? "Phân công đã điều chỉnh" : "Chính khóa";
                  // Người thay vắng/chưa xác nhận vẫn ghi nhận 0; không hiển thị cộng tiền theo phân công.
                  const contribution = own.actualPeriods > 0 ? `${own.actualPeriods} tiết thực dạy đã xác nhận`
                    : isAbsent ? "0 tiết thực dạy · Đã loại khỏi công" : "0 tiết thực dạy · Chưa có công được xác nhận";
                  return (
                    <article key={s.id} role="listitem" className="min-w-0 rounded-xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">{s.dayName}, {s.formattedDate}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{s.periodLabel} · {s.attendance.periodCount} tiết theo lịch · {s.schoolLevelLabel}</p>
                        </div>
                        <Badge tone={wasReplaced || isAbsent ? "danger" : substitutes ? "info" : "neutral"}>{kind}</Badge>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">{s.resolvedClassName} · {s.resolvedSubjectName}</p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">{wasReplaced ? `Người dạy thay: ${s.effectiveTeacherName}`
                            : substitutes ? `Dạy thay cho: ${s.originalTeacherName || s.resolvedTeacherName}`
                              : `Người được ghi nhận: ${s.effectiveTeacherName}`}</p>
                          <p className={cn("mt-1 text-xs font-medium", own.actualPeriods > 0 ? "text-emerald-700" : isAbsent ? "text-rose-700" : "text-muted-foreground")}>{contribution}</p>
                        </div>
                        <div className="min-w-0 sm:text-right">
                          <Badge tone={statusBadgeTone(s.effectiveStatus)}>{statusLabelVi(s.effectiveStatus)}</Badge>
                          <p className="mt-1 text-[10px] text-muted-foreground">{wasReplaced ? "Trạng thái buổi được bố trí dạy thay" : "Trạng thái xác nhận buổi dạy"}</p>
                        </div>
                      </div>
                      {s.cleanedNote ? <p className="mt-2 break-words border-t border-border pt-2 text-xs leading-5 text-muted-foreground">{s.cleanedNote}</p> : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
            <p className="text-xs leading-5 text-muted-foreground">Hiển thị <strong>{filteredSchedules.length} buổi / {scheduledPeriods} tiết theo lịch</strong><br />Công của GV trong kết quả lọc: <strong>{filteredTotals.actualPeriods} tiết</strong></p>
            <Dialog.Close asChild><Button size="sm" variant="secondary">Đóng chi tiết</Button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
