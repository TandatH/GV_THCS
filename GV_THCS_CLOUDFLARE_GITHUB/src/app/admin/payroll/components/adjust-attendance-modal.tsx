"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, UserCheck, Users, XCircle } from "lucide-react";
import { Button, Input, Label, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Row, ScheduleWithMeta } from "../types";

interface AdjustAttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetSchedule: ScheduleWithMeta | null;
  teachers: Row[];
  onSubmit: (form: { status: "confirmed" | "adjusted" | "absent"; actualTeacherId: string; reason: string; note: string }) => Promise<void>;
  loading: boolean;
  error?: string;
}

export function AdjustAttendanceModal({
  open,
  onOpenChange,
  targetSchedule,
  teachers,
  onSubmit,
  loading,
  error,
}: AdjustAttendanceModalProps) {
  const [status, setStatus] = useState<"confirmed" | "adjusted" | "absent">("confirmed");
  const [actualTeacherId, setActualTeacherId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!targetSchedule) return;
    const existingCheckin = targetSchedule.checkinDoc;
    const assignedTeacherId = String(targetSchedule.actualTeacherId || targetSchedule.teacherId || "");
    const currentActualTeacherId = String(existingCheckin?.teacherId || existingCheckin?.actualTeacherId || assignedTeacherId);

    const initialStatus = (existingCheckin?.status as "confirmed" | "adjusted" | "absent") || (
      currentActualTeacherId !== assignedTeacherId ? "adjusted" : "confirmed"
    );

    setStatus(initialStatus);
    setActualTeacherId(currentActualTeacherId);
    setReason(String(existingCheckin?.adjustmentReason || (initialStatus === "confirmed" ? "Xác nhận đã dạy" : "")));
    setNote(String(existingCheckin?.note || ""));
    setLocalError("");
  }, [targetSchedule]);

  const assignedTeacherId = String(targetSchedule?.actualTeacherId || targetSchedule?.teacherId || "");

  const handleStatusChange = (newStatus: "confirmed" | "adjusted" | "absent") => {
    setStatus(newStatus);
    if (newStatus === "confirmed") {
      setActualTeacherId(assignedTeacherId);
      if (!reason || reason === "Báo vắng không dạy" || reason === "Dạy thay giáo viên") {
        setReason("Xác nhận đã dạy theo phân công");
      }
    } else if (newStatus === "adjusted") {
      if (!reason || reason === "Xác nhận đã dạy theo phân công" || reason === "Báo vắng không dạy") {
        setReason("Chỉ định giáo viên dạy thay");
      }
    } else if (newStatus === "absent") {
      if (!reason || reason === "Xác nhận đã dạy theo phân công" || reason === "Chỉ định giáo viên dạy thay") {
        setReason("Báo vắng / Nghỉ dạy");
      }
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setLocalError("Vui lòng nhập lý do điều chỉnh.");
      return;
    }

    if (status === "adjusted" && (!actualTeacherId || actualTeacherId === assignedTeacherId)) {
      setLocalError("Vui lòng chọn giáo viên thực tế dạy thay khác với giáo viên phân công.");
      return;
    }

    setLocalError("");
    await onSubmit({
      status,
      actualTeacherId: status === "confirmed" ? assignedTeacherId : actualTeacherId,
      reason: reason.trim(),
      note: note.trim(),
    });
  };

  if (!targetSchedule) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Điều chỉnh chấm công & Dạy thay"
      description="Cập nhật trạng thái thực tế của tiết dạy, chỉ định dạy thay hoặc báo vắng."
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Hủy
          </Button>
          <Button loading={loading} onClick={handleSubmit}>
            Lưu điều chỉnh
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Schedule Info Card */}
        <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs">
          <div className="font-bold text-sm text-foreground mb-1">
            {targetSchedule.dayName}, {targetSchedule.formattedDate} · {targetSchedule.periodLabel}
          </div>
          <div className="grid grid-cols-2 gap-2 text-muted-foreground mt-2">
            <div>
              <span>Lớp học: </span>
              <strong className="text-foreground">{targetSchedule.resolvedClassName}</strong>
            </div>
            <div>
              <span>Môn học: </span>
              <strong className="text-foreground">{targetSchedule.resolvedSubjectName}</strong>
            </div>
            <div className="col-span-2">
              <span>Giáo viên phân công: </span>
              <strong className="text-foreground">{targetSchedule.resolvedTeacherName}</strong>
              <span className="text-slate-500"> ({targetSchedule.resolvedDepartmentName})</span>
            </div>
          </div>
        </div>

        {/* Status Mode Selection */}
        <div>
          <Label>Trạng thái thực tế</Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleStatusChange("confirmed")}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition focus:outline-none",
                status === "confirmed"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-300 font-bold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-xs">Đã xác nhận</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange("adjusted")}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition focus:outline-none",
                status === "adjusted"
                  ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-300 font-bold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <UserCheck className="h-5 w-5 text-blue-600" />
              <span className="text-xs">Dạy thay</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange("absent")}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition focus:outline-none",
                status === "absent"
                  ? "border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-300 font-bold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <XCircle className="h-5 w-5 text-rose-600" />
              <span className="text-xs">Vắng / Nghỉ phép</span>
            </button>
          </div>
        </div>

        {/* Substitute Teacher selector (if status === adjusted) */}
        {status === "adjusted" ? (
          <div>
            <Label>Giáo viên thực tế dạy thay</Label>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={actualTeacherId}
              onChange={(e) => setActualTeacherId(e.target.value)}
            >
              <option value="">-- Chọn giáo viên dạy thay --</option>
              {teachers.map((teacher) => {
                const isAssigned = teacher.id === assignedTeacherId;
                return (
                  <option key={teacher.id} value={teacher.id} disabled={isAssigned}>
                    {teacher.fullName || teacher.email || teacher.id}
                    {isAssigned ? " (Giáo viên phân công ban đầu)" : ""}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Thù lao tiết dạy sẽ được ghi nhận cho giáo viên dạy thay.
            </p>
          </div>
        ) : null}

        {/* Reason */}
        <div>
          <Label>Lý do điều chỉnh *</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Dạy thay theo phân công, Báo vắng có phép..."
          />
        </div>

        {/* Note */}
        <div>
          <Label>Ghi chú</Label>
          <textarea
            className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhập thông tin bổ sung (nếu có)..."
          />
        </div>

        {/* Errors */}
        {localError || error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
            {localError || error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
