"use client";

import { AlertTriangle, Award, CalendarDays, CheckCircle2, CircleDollarSign, Clock, Users, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PayrollKpiCardsProps {
  totalEstimatedPayroll: number;
  totalTeachers: number;
  totalPeriods: number;
  primaryPeriods: number;
  secondaryPeriods: number;
  substitutePeriods: number;
  absentPeriods: number;
  pendingPastPeriods: number;
  pendingApprovalTeachers: number;
  approvedTeachers: number;
  reviewRequiredTeachers: number;
  isPrincipal: boolean;
}

export function PayrollKpiCards({
  totalEstimatedPayroll,
  totalTeachers,
  totalPeriods,
  primaryPeriods,
  secondaryPeriods,
  substitutePeriods,
  absentPeriods,
  pendingPastPeriods,
  pendingApprovalTeachers,
  approvedTeachers,
  reviewRequiredTeachers,
  isPrincipal,
}: PayrollKpiCardsProps) {
  const isAllApproved = totalTeachers > 0 && approvedTeachers === totalTeachers;
  const hasAbnormalities = pendingPastPeriods > 0;

  return (
    <div className="mb-6 min-w-0">
      <p className="mb-2 text-xs text-muted-foreground">Tổng theo bộ lọc: {totalTeachers} giáo viên, gồm tất cả các trang trong bảng.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>div]:min-w-0 [&>div>div:first-child]:gap-2">
      {/* CARD 1: Tổng quỹ lương/thù lao dự kiến */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-blue-50/30 p-4 shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Tổng quỹ thù lao dự kiến
          </span>
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-blue-700">
            <CircleDollarSign className="h-4.5 w-4.5" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-[clamp(1.05rem,1.6vw,1.5rem)] font-black tracking-tight text-slate-900 tabular-nums">
            {formatCurrency(totalEstimatedPayroll)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5 text-blue-600" />
            <span>
              Áp dụng cho <strong className="font-semibold text-slate-700">{totalTeachers}</strong> giáo viên
            </span>
          </div>
        </div>
      </div>

      {/* CARD 2: Tổng tiết giảng dạy (Phân tách Cấp 1 & Cấp 2) */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-emerald-50/30 p-4 shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Tổng tiết giảng dạy
          </span>
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <CalendarDays className="h-4.5 w-4.5" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900">
              {totalPeriods}
            </span>
            <span className="text-xs font-semibold text-slate-500">tiết thực dạy</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 font-semibold text-teal-800 border border-teal-200/60">
              C1: {primaryPeriods} tiết
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-800 border border-indigo-200/60">
              C2: {secondaryPeriods} tiết
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Đã gồm tiết dạy thay được xác nhận.</p>
        </div>
      </div>

      {/* CARD 3: Cảnh báo bất thường */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${
          hasAbnormalities
            ? "border-amber-200/90 bg-gradient-to-br from-white to-amber-50/40"
            : "border-slate-200/80 bg-white"
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Đối soát công
          </span>
          <div
            className={`grid h-8 w-8 place-items-center rounded-xl ${
              hasAbnormalities ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <AlertTriangle className="h-4.5 w-4.5" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900">
              {pendingPastPeriods}
            </span>
            <span className="text-xs font-semibold text-slate-500">tiết chờ xác nhận</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span title="Đã tính vào thực dạy; không cộng thêm" className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700 border border-blue-200/60">
              Dạy thay: <strong>{substitutePeriods}</strong>
            </span>
            <span title="Đã loại khỏi thực dạy; không trừ thêm" className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 border border-rose-200/60">
              Báo vắng: <strong>{absentPeriods}</strong>
            </span>
            {pendingPastPeriods > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                Chưa đối soát: {pendingPastPeriods}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Dạy thay đã tính vào công; vắng đã loại khỏi công. Không cộng/trừ lại.</p>
        </div>
      </div>

      {/* CARD 4: Trạng thái duyệt */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${
          isAllApproved
            ? "border-emerald-200/90 bg-gradient-to-br from-white to-emerald-50/40"
            : reviewRequiredTeachers > 0
              ? "border-rose-200/90 bg-gradient-to-br from-white to-rose-50/40"
              : "border-amber-200/90 bg-gradient-to-br from-white to-amber-50/40"
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Trạng thái duyệt BGH
          </span>
          <div
            className={`grid h-8 w-8 place-items-center rounded-xl ${
              isAllApproved
                ? "bg-emerald-100 text-emerald-700"
                : reviewRequiredTeachers > 0
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700"
            }`}
          >
            {isAllApproved ? (
              <CheckCircle2 className="h-4.5 w-4.5" />
            ) : reviewRequiredTeachers > 0 ? (
              <XCircle className="h-4.5 w-4.5" />
            ) : (
              <Clock className="h-4.5 w-4.5" />
            )}
          </div>
        </div>
        <div className="mt-3">
          <div className="text-xl font-black tracking-tight text-slate-900">
            {isAllApproved ? (
              <span className="text-emerald-700">Đã phê duyệt toàn bộ</span>
            ) : pendingApprovalTeachers > 0 ? (
              <span className="text-amber-700">
                Chờ {isPrincipal ? "bạn duyệt" : "Hiệu trưởng duyệt"} ({pendingApprovalTeachers}/{totalTeachers})
              </span>
            ) : (
              <span className="text-slate-700">
                Đã duyệt {approvedTeachers}/{totalTeachers} GV
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-medium">
              Đã duyệt: <strong className="text-emerald-700">{approvedTeachers}</strong>
            </span>
            <span>·</span>
            <span className="font-medium">
              Chờ duyệt: <strong className="text-amber-700">{pendingApprovalTeachers}</strong>
            </span>
            {reviewRequiredTeachers > 0 ? (
              <>
                <span>·</span>
                <span className="font-medium text-rose-700">
                  Rà soát: <strong>{reviewRequiredTeachers}</strong>
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
