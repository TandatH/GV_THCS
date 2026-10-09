"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, CircleDollarSign, Info } from "lucide-react";
import { Badge, Button, Input, Label, Modal } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import {
  type PayrollApprovalStatus,
  type TeacherPayrollSummaryRow,
} from "../types";

interface PrincipalAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: TeacherPayrollSummaryRow | null;
  onSubmit: (data: {
    primaryActual: number;
    secondaryActual: number;
    adjustmentAmount: number;
    adjustmentReason: string;
    status: PayrollApprovalStatus;
  }) => Promise<void>;
  loading: boolean;
}

export function PrincipalAdjustmentModal({
  open,
  onOpenChange,
  row,
  onSubmit,
  loading,
}: PrincipalAdjustmentModalProps) {
  const [primaryActual, setPrimaryActual] = useState<number>(0);
  const [secondaryActual, setSecondaryActual] = useState<number>(0);
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>("");
  const [status, setStatus] = useState<PayrollApprovalStatus>("approved");
  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    if (row) {
      setPrimaryActual(row.primaryActual);
      setSecondaryActual(row.secondaryActual);
      setAdjustmentAmount(row.adjustmentAmount || 0);
      setAdjustmentReason(row.adjustmentReason || "");
      setStatus(row.status || "approved");
      setValidationError("");
    }
  }, [row]);

  if (!row) return null;

  // Real-time calculation of new estimated amount
  const newPrimaryAmount =
    row.primaryRate > 0
      ? primaryActual * row.primaryRate
      : row.primaryAmount;
  const newSecondaryAmount =
    row.secondaryRate > 0
      ? secondaryActual * row.secondaryRate
      : row.secondaryAmount;
  const newTotalAmount = Math.max(
    0,
    newPrimaryAmount + newSecondaryAmount + Number(adjustmentAmount || 0)
  );

  const handleSubmit = async () => {
    if (adjustmentAmount !== 0 && !adjustmentReason.trim()) {
      setValidationError("Vui lòng nhập lý do điều chỉnh khi có thay đổi khoản tiền +/-.");
      return;
    }
    setValidationError("");
    await onSubmit({
      primaryActual: Number(primaryActual || 0),
      secondaryActual: Number(secondaryActual || 0),
      adjustmentAmount: Number(adjustmentAmount || 0),
      adjustmentReason: adjustmentReason.trim(),
      status,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Điều chỉnh công & Thù lao giáo viên"
      description="Cho phép Hiệu trưởng / BGH can thiệp trực tiếp số tiết thực dạy, nhập khoản tiền điều chỉnh (+/-) kèm lý do."
      wide
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Hủy bỏ
          </Button>
          <Button loading={loading} onClick={handleSubmit}>
            <CheckCircle2 className="h-4 w-4" />
            Lưu điều chỉnh
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Teacher Info Card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-foreground">{row.teacherName}</span>
                {row.teacherCode ? (
                  <span className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-slate-700 border">
                    {row.teacherCode}
                  </span>
                ) : null}
                <Badge
                  tone={
                    row.teachingLevel === "BOTH"
                      ? "warning"
                      : row.teachingLevel === "PRIMARY"
                        ? "info"
                        : "neutral"
                  }
                >
                  {row.teachingLevelLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tổ bộ môn: <strong>{row.departmentName}</strong> · Loại HĐ:{" "}
                <strong>{row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground block">Thù lao hiện tại</span>
              <span className="text-base font-bold text-primary">
                {formatCurrency(row.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Cấp 1 hours override */}
          <div className="space-y-1.5 rounded-xl border border-teal-200/80 bg-teal-50/30 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-teal-900 uppercase">
                Tiết thực dạy Cấp 1
              </Label>
              <span className="text-xs text-teal-700">
                Định mức: {row.primaryStandard ?? "—"}
              </span>
            </div>
            <Input
              type="number"
              min="0"
              value={primaryActual}
              onChange={(e) => setPrimaryActual(Math.max(0, Number(e.target.value)))}
              disabled={row.teachingLevel === "SECONDARY"}
              placeholder="Nhập số tiết C1"
            />
            <p className="text-[11px] text-teal-700">
              Đơn giá C1: {row.primaryRate > 0 ? formatCurrency(row.primaryRate) : "Chưa cài đặt"}/tiết
            </p>
          </div>

          {/* Cấp 2 hours override */}
          <div className="space-y-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/30 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-indigo-900 uppercase">
                Tiết thực dạy Cấp 2
              </Label>
              <span className="text-xs text-indigo-700">
                Định mức: {row.secondaryStandard ?? "—"}
              </span>
            </div>
            <Input
              type="number"
              min="0"
              value={secondaryActual}
              onChange={(e) => setSecondaryActual(Math.max(0, Number(e.target.value)))}
              disabled={row.teachingLevel === "PRIMARY"}
              placeholder="Nhập số tiết C2"
            />
            <p className="text-[11px] text-indigo-700">
              Đơn giá C2: {row.secondaryRate > 0 ? formatCurrency(row.secondaryRate) : "Chưa cài đặt"}/tiết
            </p>
          </div>
        </div>

        {/* Amount adjustment (+/-) */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-bold uppercase text-slate-700">
                Khoản tiền điều chỉnh (+/- VND)
              </Label>
              <div className="mt-1 relative">
                <Input
                  type="number"
                  step="10000"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                  placeholder="Ví dụ: +500000 hoặc -200000"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Dương (+) là phụ cấp/thưởng bổ sung; Âm (-) là khấu trừ/phạt vi phạm.
              </p>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase text-slate-700">
                Trạng thái phê duyệt
              </Label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"
                value={status}
                onChange={(e) => setStatus(e.target.value as PayrollApprovalStatus)}
              >
                <option value="approved">Đã duyệt (Phê chuẩn chi trả)</option>
                <option value="pending_approval">Chờ duyệt (Chưa chốt)</option>
                <option value="review_required">Yêu cầu rà soát (Trả về kế toán)</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase text-slate-700">
              Lý do điều chỉnh / Ghi chú của Hiệu trưởng
            </Label>
            <Input
              className="mt-1"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Ví dụ: Thưởng hoàn thành xuất sắc chuyên đề liên cấp..."
            />
          </div>
        </div>

        {validationError ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        ) : null}

        {/* Summary preview */}
        <div className="flex items-center justify-between rounded-xl bg-primary/5 border border-primary/20 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Calculator className="h-4 w-4" />
            <span>Tổng thù lao sau điều chỉnh (Dự kiến):</span>
          </div>
          <div className="text-lg font-black text-primary">
            {formatCurrency(newTotalAmount)}
          </div>
        </div>
      </div>
    </Modal>
  );
}
