"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles, Users } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import type { ScheduleWithMeta } from "../types";

interface BatchConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetSchedules: ScheduleWithMeta[];
  onConfirm: () => void;
  loading: boolean;
}

export function BatchConfirmModal({
  open,
  onOpenChange,
  targetSchedules,
  onConfirm,
  loading,
}: BatchConfirmModalProps) {
  const stats = useMemo(() => {
    const totalCount = targetSchedules.length;
    const totalPeriods = targetSchedules.reduce((sum, s) => sum + s.periodCountNum, 0);
    const uniqueTeachers = new Set(targetSchedules.map((s) => s.actualTeacherId || s.teacherId)).size;
    const dates = targetSchedules.map((s) => s.calculatedDate).filter(Boolean).sort();
    const minDate = dates[0] || "—";
    const maxDate = dates[dates.length - 1] || "—";

    return {
      totalCount,
      totalPeriods,
      uniqueTeachers,
      minDate,
      maxDate,
    };
  }, [targetSchedules]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="⚡ Duyệt chấm công hàng loạt theo phân công"
      description="Xác nhận trạng thái 'Đã dạy' cho các lịch dạy đã diễn ra nhưng chưa có bản ghi chấm công."
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Hủy bỏ
          </Button>
          <Button
            loading={loading}
            onClick={onConfirm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            Xác nhận {stats.totalCount} lịch dạy
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Banner summary */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">
                Bạn sắp xác nhận {stats.totalCount} lịch dạy quá hạn
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Hệ thống sẽ tự động tạo bản ghi chấm công với trạng thái <strong>“Đã dạy”</strong> cho giáo viên được phân công. Sau khi duyệt xong, bảng lương tháng sẽ được <strong>mở khóa tính toán</strong> ngay lập tức.
              </p>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
            <span className="text-xs text-muted-foreground block">Số lịch dạy</span>
            <span className="text-xl font-bold text-foreground mt-0.5 block">{stats.totalCount}</span>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
            <span className="text-xs text-muted-foreground block">Tổng số tiết</span>
            <span className="text-xl font-bold text-foreground mt-0.5 block">{stats.totalPeriods} tiết</span>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
            <span className="text-xs text-muted-foreground block">Số giáo viên</span>
            <span className="text-xl font-bold text-foreground mt-0.5 block">{stats.uniqueTeachers} người</span>
          </div>
        </div>

        {/* Note */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card p-3 rounded-xl border border-border">
          <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
          <p>
            Lưu ý: Nếu có tiết nào trên thực tế bị vắng hoặc có giáo viên dạy thay, bạn vẫn có thể bấm nút <strong>“Sửa”</strong> tại tiết đó để điều chỉnh lại bất cứ lúc nào.
          </p>
        </div>
      </div>
    </Modal>
  );
}
