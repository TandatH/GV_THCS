"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Eye, PencilLine, RotateCcw } from "lucide-react";
import { summarizePayrollRows } from "@school/shared";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { type TeacherPayrollSummaryRow, payrollStatusBadgeTone, payrollStatusLabelVi } from "../types";

interface PrincipalPayrollTableProps {
  rows: TeacherPayrollSummaryRow[];
  onOpenEdit: (row: TeacherPayrollSummaryRow) => void;
  onQuickApprove: (row: TeacherPayrollSummaryRow) => void;
  onOpenDetail: (row: TeacherPayrollSummaryRow) => void;
  actionLoading: boolean;
  isPrincipal: boolean;
}

function LevelPeriods({ actual, rate, standard, primary }: {
  actual: number; rate: number; standard: number | null; primary: boolean;
}) {
  return (
    <div className="space-y-0.5 whitespace-nowrap text-right tabular-nums">
      <div className="flex items-baseline justify-end gap-1">
        <strong className={cn("text-base", primary ? "text-teal-700" : "text-indigo-700")}>{actual}</strong>
        <span className="text-[10px] text-muted-foreground">tiết</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{formatCurrency(rate)}/tiết</p>
      {standard !== null ? <p className="text-[10px] text-muted-foreground/80" title="Định mức chỉ để tham khảo, không trừ khi tính tiền">Tham khảo: {standard} tiết</p> : null}
    </div>
  );
}

export function PrincipalPayrollTable({ rows, onOpenEdit, onQuickApprove, onOpenDetail, actionLoading, isPrincipal }: PrincipalPayrollTableProps) {
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const currentRows = rows.slice(startIndex, startIndex + pageSize);
  // Tổng cuối bảng và KPI dùng cùng toàn bộ dòng sau lọc, không chỉ trang đang mở.
  const totals = summarizePayrollRows(rows);

  if (!rows.length) return <EmptyState icon={<AlertCircle className="h-6 w-6" />} title="Không có dữ liệu thù lao phù hợp" description="Thử thay đổi cấp học, tổ bộ môn hoặc tháng làm việc." />;

  return (
    <div className="min-w-0 space-y-3">
      <p id="payroll-counting-note" className="text-xs leading-5 text-muted-foreground">
        <strong className="text-foreground">Thực dạy = Chính khóa đã dạy + Dạy thay đã xác nhận.</strong>{" "}
        Dạy thay đã tính vào thực dạy; tiết vắng đã loại khỏi thực dạy. Các chỉ số đối soát không được cộng/trừ lần nữa.
      </p>
      <div className="relative isolate max-w-full overflow-x-auto rounded-xl border border-border bg-card" role="region" aria-label="Bảng tổng hợp công và thù lao" aria-describedby="payroll-counting-note" tabIndex={0}>
        <table className="w-full min-w-[960px] table-fixed text-left text-xs tabular-nums">
          <caption className="sr-only">Công và thù lao của {rows.length} giáo viên theo bộ lọc; thao tác dành cho {isPrincipal ? "BGH" : "Admin"}.</caption>
          <colgroup><col className="w-[22%]" /><col className="w-[8%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[10%]" /><col className="w-[12%]" /></colgroup>
          <thead className="bg-muted text-[11px] text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-2 py-2">Giáo viên</th>
              <th scope="col" className="px-2 py-2 text-right">Thực dạy</th>
              <th scope="col" className="px-2 py-2 text-right">Cấp 1</th>
              <th scope="col" className="px-2 py-2 text-right">Cấp 2</th>
              <th scope="col" className="px-2 py-2 text-right">Đối soát công</th>
              <th scope="col" className="px-2 py-2 text-right">Thành tiền</th>
              <th scope="col" className="px-2 py-2 text-center">Trạng thái</th>
              <th scope="col" className="sticky right-0 z-20 bg-muted px-2 py-2 text-center shadow-[-4px_0_8px_rgba(0,0,0,0.05)]">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {currentRows.map((row) => {
              const totalActual = row.primaryActual + row.secondaryActual;
              const regularActual = totalActual - row.substituteCount;
              const immutable = row.status === "locked" || row.status === "paid";
              return (
                <tr key={row.teacherId} className={cn("group hover:bg-muted/40", row.status === "review_required" && "bg-rose-50/30")}>
                  <td className="px-2 py-2 align-top">
                    <p className="break-words font-semibold leading-5 text-foreground">{row.teacherName}</p>
                    <p className="break-words text-[10px] leading-4 text-muted-foreground">{row.teacherCode || "Chưa có mã"} · {row.departmentName}</p>
                    <p className="text-[10px] leading-4 text-muted-foreground">{row.teachingLevelLabel} · {row.teacherType === "thinh_giang" ? "Thỉnh giảng" : "Cơ hữu"}</p>
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <strong className="text-base text-foreground">{totalActual}</strong>
                    <p className="mt-0.5 text-[10px] text-muted-foreground" title="Phần thực dạy chính khóa, chưa gồm dạy thay">Chính khóa: {regularActual}</p>
                  </td>
                  <td className="px-2 py-2 align-top"><LevelPeriods actual={row.primaryActual} rate={row.primaryRate} standard={row.primaryStandard} primary /></td>
                  <td className="px-2 py-2 align-top"><LevelPeriods actual={row.secondaryActual} rate={row.secondaryRate} standard={row.secondaryStandard} primary={false} /></td>
                  <td className="px-2 py-2 text-right align-top">
                    <p className="whitespace-nowrap text-blue-700" title="Dạy thay: đã tính vào thực dạy, không cộng thêm">Dạy thay: <strong>{row.substituteCount}</strong></p>
                    <p className="mt-1 whitespace-nowrap text-rose-700" title="Tiết vắng: đã loại khỏi thực dạy, không trừ thêm">Vắng: <strong>{row.absentCount}</strong></p>
                    {row.pendingPastPeriods > 0 ? <p className="mt-1 text-[10px] text-amber-700">Chờ: {row.pendingPastPeriods} tiết</p> : null}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <p className="whitespace-nowrap text-sm font-bold text-primary" title={`${row.primaryActual} × ${formatCurrency(row.primaryRate)} + ${row.secondaryActual} × ${formatCurrency(row.secondaryRate)} + ${formatCurrency(row.adjustmentAmount)}`}>{formatCurrency(row.totalAmount)}</p>
                    {row.adjustmentAmount !== 0 ? <p className={cn("mt-1 whitespace-nowrap text-[10px]", row.adjustmentAmount > 0 ? "text-emerald-700" : "text-rose-700")} title={row.adjustmentReason}>Điều chỉnh: {row.adjustmentAmount > 0 ? "+" : ""}{formatCurrency(row.adjustmentAmount)}</p> : null}
                  </td>
                  <td className="px-2 py-2 text-center align-top"><Badge tone={payrollStatusBadgeTone(row.status)}>{payrollStatusLabelVi(row.status)}</Badge></td>
                  <td className="sticky right-0 z-10 bg-card px-2 py-2 align-top shadow-[-4px_0_8px_rgba(0,0,0,0.05)] group-hover:bg-muted">
                    <div className="flex justify-center gap-1">
                      <Button size="sm" variant="ghost" data-payroll-detail={row.teacherId} onClick={() => onOpenDetail(row)} className="h-8 w-8 shrink-0 px-0" title="Chi tiết tiết dạy" aria-label={`Chi tiết tiết dạy của ${row.teacherName}`}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="secondary" disabled={actionLoading || immutable} onClick={() => onOpenEdit(row)} className="h-8 w-8 shrink-0 px-0" title="Chỉnh sửa đơn giá và khoản điều chỉnh" aria-label={`Chỉnh sửa thù lao của ${row.teacherName}`}><PencilLine className="h-4 w-4" /></Button>
                      <Button size="sm" variant={row.status === "approved" ? "ghost" : "primary"} disabled={actionLoading || immutable} onClick={() => onQuickApprove(row)} className="h-8 w-8 shrink-0 px-0" title={row.status === "approved" ? "Chuyển về chờ duyệt" : "Duyệt thù lao"} aria-label={`${row.status === "approved" ? "Chuyển về chờ duyệt" : "Duyệt thù lao"} cho ${row.teacherName}`}>
                        {row.status === "approved" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/50 font-semibold">
            <tr>
              <th scope="row" className="px-2 py-2">Tổng theo bộ lọc <span className="block text-[10px] font-normal">{totals.totalTeachers} GV · tất cả {totalPages} trang</span></th>
              <td className="px-2 py-2 text-right">{totals.totalPeriods}</td>
              <td className="px-2 py-2 text-right">{totals.primaryPeriods}</td>
              <td className="px-2 py-2 text-right">{totals.secondaryPeriods}</td>
              <td className="px-2 py-2 text-right"><p>Thay: {totals.substitutePeriods}</p><p>Vắng: {totals.absentPeriods}</p></td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-primary">{formatCurrency(totals.totalEstimatedPayroll)}</td>
              <td />
              <td className="sticky right-0 z-10 bg-muted px-2 py-2 shadow-[-4px_0_8px_rgba(0,0,0,0.05)]" />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>Hiển thị {startIndex + 1}–{Math.min(startIndex + pageSize, rows.length)} / {rows.length} giáo viên</p>
        <div className="flex items-center gap-2">
          <select aria-label="Số giáo viên mỗi trang" className="h-8 rounded-lg border border-border bg-background px-2" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
            {[15, 25, 50, 100].map((size) => <option key={size} value={size}>{size} dòng/trang</option>)}
          </select>
          <Button size="sm" variant="secondary" className="h-8 w-8 px-0" disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)} aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="whitespace-nowrap">{safePage} / {totalPages}</span>
          <Button size="sm" variant="secondary" className="h-8 w-8 px-0" disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)} aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
