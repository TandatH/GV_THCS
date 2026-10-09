"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck,
  PencilLine,
  RotateCcw,
} from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import {
  type TeacherPayrollSummaryRow,
  payrollStatusBadgeTone,
  payrollStatusLabelVi,
} from "../types";

interface PrincipalPayrollTableProps {
  rows: TeacherPayrollSummaryRow[];
  onOpenEdit: (row: TeacherPayrollSummaryRow) => void;
  onQuickApprove: (row: TeacherPayrollSummaryRow) => void;
  onOpenDetail: (row: TeacherPayrollSummaryRow) => void;
  actionLoading: boolean;
  isPrincipal: boolean;
}

export function PrincipalPayrollTable({
  rows,
  onOpenEdit,
  onQuickApprove,
  onOpenDetail,
  actionLoading,
  isPrincipal,
}: PrincipalPayrollTableProps) {
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentRows = rows.slice(startIndex, startIndex + pageSize);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6 text-muted-foreground" />}
        title="Không có dữ liệu thù lao phù hợp"
        description="Thử thay đổi bộ lọc cấp học, tổ bộ môn hoặc tháng làm việc."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-3.5 py-3.5">Mã GV</th>
              <th className="px-3.5 py-3.5">Họ và Tên</th>
              <th className="px-3.5 py-3.5">Cấp dạy</th>
              <th className="px-3.5 py-3.5">Tổ BM</th>
              <th className="px-3.5 py-3.5 text-center">Tiết Cấp 1 (Thực/ĐM · Đơn giá)</th>
              <th className="px-3.5 py-3.5 text-center">Tiết Cấp 2 (Thực/ĐM · Đơn giá)</th>
              <th className="px-3.5 py-3.5 text-center">Dạy thay (+)</th>
              <th className="px-3.5 py-3.5 text-center">Báo vắng (-)</th>
              <th className="px-3.5 py-3.5 text-center">Tiết phụ trội</th>
              <th className="px-3.5 py-3.5 text-right">Tổng thù lao/Lương</th>
              <th className="px-3.5 py-3.5 text-center">Trạng thái</th>
              <th className="px-3.5 py-3.5 text-right">Thao tác ({isPrincipal ? "BGH" : "Admin"})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {currentRows.map((row) => {
              const teachesPrimary = row.teachingLevel === "PRIMARY" || row.teachingLevel === "BOTH";
              const teachesSecondary = row.teachingLevel === "SECONDARY" || row.teachingLevel === "BOTH";

              return (
                <tr
                  key={row.teacherId}
                  className={cn(
                    "transition hover:bg-muted/40",
                    row.status === "review_required" && "bg-rose-50/20",
                    row.status === "pending_approval" && "bg-amber-50/15"
                  )}
                >
                  {/* Mã GV */}
                  <td className="px-3.5 py-3 font-mono text-xs font-semibold text-slate-600">
                    {row.teacherCode || "—"}
                  </td>

                  {/* Họ và Tên */}
                  <td className="px-3.5 py-3">
                    <div className="font-bold text-foreground">{row.teacherName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.teacherType === "thinh_giang" ? (
                        <span className="text-purple-700 font-medium">Thỉnh giảng</span>
                      ) : (
                        <span className="text-slate-500">Cơ hữu</span>
                      )}
                    </div>
                  </td>

                  {/* Cấp dạy */}
                  <td className="px-3.5 py-3">
                    {row.teachingLevel === "BOTH" ? (
                      <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                        Cả 2 cấp
                      </span>
                    ) : row.teachingLevel === "PRIMARY" ? (
                      <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">
                        Cấp 1
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-800">
                        Cấp 2
                      </span>
                    )}
                  </td>

                  {/* Tổ BM */}
                  <td className="px-3.5 py-3 text-xs text-slate-700 font-medium">
                    {row.departmentName}
                  </td>

                  {/* Tiết Cấp 1 */}
                  <td className="px-3.5 py-3 text-center text-xs">
                    {teachesPrimary ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-block rounded-md bg-teal-50/80 px-2 py-0.5 font-medium text-teal-950">
                          <strong className="font-extrabold text-teal-700 text-sm">
                            {row.primaryActual}
                          </strong>
                          <span className="text-slate-400 mx-1">/</span>
                          <span>{row.primaryStandard ?? "—"}</span>
                        </span>
                        <div className="text-[11px] font-semibold text-teal-700">
                          {formatCurrency(row.primaryRate)}/t
                        </div>
                        <div className="text-[11px] font-bold text-slate-700">
                          = {formatCurrency(row.primaryAmount)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </td>

                  {/* Tiết Cấp 2 */}
                  <td className="px-3.5 py-3 text-center text-xs">
                    {teachesSecondary ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-block rounded-md bg-indigo-50/80 px-2 py-0.5 font-medium text-indigo-950">
                          <strong className="font-extrabold text-indigo-700 text-sm">
                            {row.secondaryActual}
                          </strong>
                          <span className="text-slate-400 mx-1">/</span>
                          <span>{row.secondaryStandard ?? "—"}</span>
                        </span>
                        <div className="text-[11px] font-semibold text-indigo-700">
                          {formatCurrency(row.secondaryRate)}/t
                        </div>
                        <div className="text-[11px] font-bold text-slate-700">
                          = {formatCurrency(row.secondaryAmount)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </td>

                  {/* Dạy thay (+) */}
                  <td className="px-3.5 py-3 text-center text-xs">
                    {row.substituteCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                        +{row.substituteCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  {/* Báo vắng (-) */}
                  <td className="px-3.5 py-3 text-center text-xs">
                    {row.absentCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                        -{row.absentCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  {/* Tiết phụ trội */}
                  <td className="px-3.5 py-3 text-center text-xs font-semibold">
                    {row.overtimePeriods > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                        +{row.overtimePeriods}
                      </span>
                    ) : row.overtimePeriods < 0 ? (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                        {row.overtimePeriods}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  {/* Tổng thù lao/Lương */}
                  <td className="px-3.5 py-3 text-right">
                    <div className="font-extrabold text-base text-primary tracking-tight">
                      {formatCurrency(row.totalAmount)}
                    </div>
                    {row.adjustmentAmount !== 0 ? (
                      <div
                        className={cn(
                          "text-[10px] font-semibold",
                          row.adjustmentAmount > 0 ? "text-emerald-700" : "text-rose-700"
                        )}
                        title={row.adjustmentReason || "Điều chỉnh thù lao"}
                      >
                        {row.adjustmentAmount > 0
                          ? `(+${formatCurrency(row.adjustmentAmount)})`
                          : `(${formatCurrency(row.adjustmentAmount)})`}
                      </div>
                    ) : (
                      teachesPrimary && teachesSecondary ? (
                        <div className="text-[10px] text-muted-foreground">
                          {formatCurrency(row.primaryAmount)} + {formatCurrency(row.secondaryAmount)}
                        </div>
                      ) : null
                    )}
                  </td>

                  {/* Trạng thái */}
                  <td className="px-3.5 py-3 text-center">
                    <Badge tone={payrollStatusBadgeTone(row.status)}>
                      {payrollStatusLabelVi(row.status)}
                    </Badge>
                  </td>

                  {/* Thao tác */}
                  <td className="px-3.5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* [Sửa] */}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenEdit(row)}
                        className="h-8 gap-1 px-2.5 text-xs font-semibold"
                        title="Điều chỉnh số tiết hoặc khoản tiền (+/-)"
                      >
                        <PencilLine className="h-3.5 w-3.5 text-slate-600" />
                        <span>Sửa</span>
                      </Button>

                      {/* [Duyệt] */}
                      {row.status !== "approved" ? (
                        <Button
                          size="sm"
                          loading={actionLoading}
                          onClick={() => onQuickApprove(row)}
                          className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          title="Phê duyệt chi trả lương"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Duyệt</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onQuickApprove(row)}
                          className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                          title="Đổi lại trạng thái"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}

                      {/* [Chi tiết] */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onOpenDetail(row)}
                        className="h-8 gap-1 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
                        title="Xem chi tiết từng tiết dạy"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Chi tiết</span>
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
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-2">
        <div>
          Hiển thị <strong>{startIndex + 1}</strong> –{" "}
          <strong>{Math.min(startIndex + pageSize, rows.length)}</strong> trên tổng số{" "}
          <strong>{rows.length}</strong> giáo viên
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
