"use client";

import { Calendar, CalendarDays, Filter, Layers, RotateCcw, Search, Table2, User, Users } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Row, StatusFilter, ViewMode } from "../types";

interface AttendanceToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  availableDates: Array<{ date: string; label: string; count: number }>;
  selectedTeacherId: string;
  onSelectedTeacherIdChange: (teacherId: string) => void;
  teachers: Row[];
  selectedClassId: string;
  onSelectedClassIdChange: (classId: string) => void;
  classes: Row[];
  counts: {
    total: number;
    pendingPast: number;
    confirmed: number;
    adjusted: number;
    absent: number;
    upcoming: number;
  };
  totalFilteredCount: number;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function AttendanceToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  selectedDate,
  onSelectedDateChange,
  availableDates,
  selectedTeacherId,
  onSelectedTeacherIdChange,
  teachers,
  selectedClassId,
  onSelectedClassIdChange,
  classes,
  counts,
  totalFilteredCount,
  onResetFilters,
  hasActiveFilters,
}: AttendanceToolbarProps) {
  return (
    <div className="space-y-4">
      {/* Top row: Status filter chips & View mode switcher */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStatusFilterChange("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Tất cả
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", statusFilter === "all" ? "bg-slate-800 text-slate-200" : "bg-muted text-muted-foreground")}>
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange("pending_past")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === "pending_past"
                ? "bg-amber-600 text-white shadow-sm"
                : counts.pendingPast > 0
                  ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            ⚠️ Cần xử lý
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", statusFilter === "pending_past" ? "bg-amber-700 text-white" : "bg-amber-200 text-amber-900 font-bold")}>
              {counts.pendingPast}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange("confirmed")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === "confirmed"
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700",
            )}
          >
            Đã dạy
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", statusFilter === "confirmed" ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-800")}>
              {counts.confirmed}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange("adjusted")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === "adjusted"
                ? "bg-blue-600 text-white shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-blue-50 hover:text-blue-700",
            )}
          >
            Dạy thay / Sửa
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", statusFilter === "adjusted" ? "bg-blue-700 text-white" : "bg-blue-100 text-blue-800")}>
              {counts.adjusted}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange("absent")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === "absent"
                ? "bg-rose-600 text-white shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-rose-50 hover:text-rose-700",
            )}
          >
            Vắng / Nghỉ
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", statusFilter === "absent" ? "bg-rose-700 text-white" : "bg-rose-100 text-rose-800")}>
              {counts.absent}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange("upcoming")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === "upcoming"
                ? "bg-slate-600 text-white shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Chưa tới hạn
            <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", statusFilter === "upcoming" ? "bg-slate-700 text-white" : "bg-muted text-muted-foreground")}>
              {counts.upcoming}
            </span>
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center self-start rounded-xl border border-border bg-card p-1 shadow-sm lg:self-auto">
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
              viewMode === "table"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title="Dạng bảng chi tiết"
          >
            <Table2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Danh sách</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("by_date")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
              viewMode === "by_date"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title="Gom nhóm theo ngày dạy"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Theo ngày</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("by_teacher")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
              viewMode === "by_teacher"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title="Gom nhóm theo giáo viên"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Theo giáo viên</span>
          </button>
        </div>
      </div>

      {/* Second row: Search bar & Dimensional dropdown filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9 text-xs"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm giáo viên, lớp, môn học..."
          />
        </div>

        {/* Date Filter */}
        <div className="relative">
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedDate}
            onChange={(e) => onSelectedDateChange(e.target.value)}
          >
            <option value="all">📅 Tất cả các ngày ({availableDates.length} ngày)</option>
            {availableDates.map((item) => (
              <option key={item.date} value={item.date}>
                {item.label} ({item.count} tiết)
              </option>
            ))}
          </select>
        </div>

        {/* Teacher Filter */}
        <div className="relative">
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedTeacherId}
            onChange={(e) => onSelectedTeacherIdChange(e.target.value)}
          >
            <option value="all">👨‍🏫 Tất cả giáo viên ({teachers.length})</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName || teacher.email || teacher.id}
              </option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div className="flex gap-2">
          <select
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-xs shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedClassId}
            onChange={(e) => onSelectedClassIdChange(e.target.value)}
          >
            <option value="all">🏫 Tất cả lớp học ({classes.length})</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name || cls.code || cls.id}
              </option>
            ))}
          </select>

          {hasActiveFilters ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onResetFilters}
              title="Đặt lại bộ lọc"
              className="h-10 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Filter summary caption */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Đang hiển thị <strong>{totalFilteredCount}</strong> lịch dạy
          {hasActiveFilters ? " (đã áp dụng bộ lọc)" : ""}
        </div>
      </div>
    </div>
  );
}
