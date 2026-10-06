"use client";

import { AlertTriangle, CheckCircle2, Clock, UserCheck, Users, XCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { StatusFilter } from "../types";

interface AttendanceKpiRibbonProps {
  total: number;
  confirmed: number;
  pendingPast: number;
  upcoming: number;
  adjusted: number;
  absent: number;
  activeFilter: StatusFilter;
  onSelectFilter: (filter: StatusFilter) => void;
  onOpenBatchModal?: () => void;
}

export function AttendanceKpiRibbon({
  total,
  confirmed,
  pendingPast,
  upcoming,
  adjusted,
  absent,
  activeFilter,
  onSelectFilter,
  onOpenBatchModal,
}: AttendanceKpiRibbonProps) {
  const pastTotal = confirmed + pendingPast + adjusted + absent;
  const completionRate = pastTotal > 0 ? Math.round(((confirmed + adjusted) / pastTotal) * 100) : 100;

  return (
    <div className="mb-6 space-y-3">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Card */}
        <button
          type="button"
          onClick={() => onSelectFilter("all")}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:shadow-md",
            activeFilter === "all"
              ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
              : "border-border bg-card hover:border-slate-300",
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Tổng phân công</span>
            <Users className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">tiết</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Toàn bộ lịch trong tháng
          </div>
        </button>

        {/* Needs Action / Past Unconfirmed (CRITICAL) */}
        <button
          type="button"
          onClick={() => onSelectFilter("pending_past")}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:shadow-md",
            pendingPast > 0
              ? activeFilter === "pending_past"
                ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-400 shadow-sm"
                : "border-amber-300 bg-amber-50/40 hover:border-amber-400"
              : activeFilter === "pending_past"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border bg-card",
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn("text-xs font-bold uppercase tracking-wider", pendingPast > 0 ? "text-amber-800" : "text-muted-foreground")}>
              Chưa đối soát
            </span>
            <AlertTriangle className={cn("h-4 w-4", pendingPast > 0 ? "text-amber-600 animate-pulse" : "text-slate-400")} />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={cn("text-2xl font-extrabold tracking-tight", pendingPast > 0 ? "text-amber-700" : "text-foreground")}>
              {pendingPast}
            </span>
            <span className={cn("text-xs", pendingPast > 0 ? "text-amber-700 font-semibold" : "text-muted-foreground")}>
              tiết chưa đối soát
            </span>
          </div>
          <div className="mt-1 text-[11px] font-medium text-amber-700">
            {pendingPast > 0 ? "Cần xác nhận trước khi tính lương" : "Đã hoàn tất đối soát"}
          </div>
        </button>

        {/* Confirmed / Taught */}
        <button
          type="button"
          onClick={() => onSelectFilter("confirmed")}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:shadow-md",
            activeFilter === "confirmed"
              ? "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400 shadow-sm"
              : "border-border bg-card hover:border-emerald-300",
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-800">Đã xác nhận</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-emerald-700">{confirmed}</span>
            <span className="text-xs text-emerald-700 font-medium">tiết</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600">
            Sẵn sàng tính thù lao
          </div>
        </button>

        {/* Substituted / Adjusted */}
        <button
          type="button"
          onClick={() => onSelectFilter("adjusted")}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:shadow-md",
            activeFilter === "adjusted"
              ? "border-blue-500 bg-blue-50/80 ring-2 ring-blue-400 shadow-sm"
              : "border-border bg-card hover:border-blue-300",
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-blue-800">Dạy thay / Điều chỉnh</span>
            <UserCheck className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-blue-700">{adjusted}</span>
            <span className="text-xs text-blue-700 font-medium">tiết</span>
          </div>
          <div className="mt-1 text-[11px] text-blue-600">
            Có thay đổi giáo viên
          </div>
        </button>

        {/* Absent */}
        <button
          type="button"
          onClick={() => onSelectFilter("absent")}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:shadow-md",
            activeFilter === "absent"
              ? "border-rose-500 bg-rose-50/80 ring-2 ring-rose-400 shadow-sm"
              : "border-border bg-card hover:border-rose-300",
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-800">Vắng / Báo nghỉ</span>
            <XCircle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-rose-700">{absent}</span>
            <span className="text-xs text-rose-700 font-medium">tiết</span>
          </div>
          <div className="mt-1 text-[11px] text-rose-600">
            Không tính thù lao
          </div>
        </button>

        {/* Upcoming */}
        <button
          type="button"
          onClick={() => onSelectFilter("upcoming")}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all hover:shadow-md",
            activeFilter === "upcoming"
              ? "border-slate-500 bg-slate-100 ring-2 ring-slate-400 shadow-sm"
              : "border-border bg-card hover:border-slate-300",
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Chưa tới hạn</span>
            <Clock className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-slate-700">{upcoming}</span>
            <span className="text-xs text-muted-foreground">tiết sắp tới</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Lịch sắp tới
          </div>
        </button>
      </div>

      {/* Progress & Quick Batch Action Bar */}
      <Card className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              Tiến độ chốt công các tiết đã diễn ra:{" "}
              <strong className={cn(completionRate === 100 ? "text-emerald-700" : "text-amber-700")}>
                {completionRate}%
              </strong>{" "}
              ({confirmed + adjusted}/{pastTotal} tiết)
            </span>
            <span className="text-muted-foreground">
              {pendingPast > 0 ? `Còn ${pendingPast} tiết chờ xác nhận` : "Đã hoàn thành đối soát"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full transition-all duration-500",
                completionRate === 100
                  ? "bg-emerald-500"
                  : completionRate > 60
                    ? "bg-amber-500"
                    : "bg-rose-500",
              )}
              style={{ width: `${Math.min(100, Math.max(0, completionRate))}%` }}
            />
          </div>
        </div>

        {pendingPast > 0 && onOpenBatchModal ? (
          <button
            type="button"
            onClick={onOpenBatchModal}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          >
            Xác nhận nhanh {pendingPast} tiết đã qua
          </button>
        ) : null}
      </Card>
    </div>
  );
}
