import type { DocumentData } from "firebase/firestore";
import { format, isValid, parseISO } from "date-fns";
import { dateOnlyFromDate } from "@/lib/date-only";
import { payrollScheduleDate, payrollSchoolLevel, type ResolvedTeachingAttendance } from "@school/shared";
export { formatPeriodDisplay } from "@school/shared";

export type Row = DocumentData & { id: string };

export type AttendanceDisplayStatus = "confirmed" | "adjusted" | "absent" | "pending_past" | "upcoming";

export type ViewMode = "table" | "by_date" | "by_teacher";

export type StatusFilter = "all" | "pending_past" | "confirmed" | "adjusted" | "absent" | "upcoming";

export type TeachingLevel = "PRIMARY" | "SECONDARY" | "BOTH";

export type PayrollApprovalStatus = "draft" | "pending_approval" | "approved" | "review_required" | "locked" | "paid";

export interface ScheduleWithMeta extends Row {
  attendance: ResolvedTeachingAttendance;
  calculatedDate: string;
  dayOfWeekNumber: number;
  dayName: string;
  formattedDate: string;
  isPast: boolean;
  isToday: boolean;
  isUpcoming: boolean;
  originalTeacherId?: string;
  originalTeacherName?: string;
  resolvedTeacherName: string;
  resolvedTeacherCode: string;
  resolvedDepartmentName: string;
  resolvedClassName: string;
  resolvedSubjectName: string;
  startPeriodNum: number;
  endPeriodNum: number;
  periodLabel: string;
  periodCountNum: number;
  checkinDoc?: Row;
  effectiveStatus: AttendanceDisplayStatus;
  effectiveTeacherId: string;
  effectiveTeacherName: string;
  isSubstituted: boolean;
  schoolLevel: "PRIMARY" | "SECONDARY";
  schoolLevelLabel: string;
  cleanedNote: string;
}

export interface TeacherPayrollSummaryRow {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  teachingLevel: TeachingLevel;
  teachingLevelLabel: string;
  departmentId: string;
  departmentName: string;
  teacherType: "co_huu" | "thinh_giang" | string;
  primaryActual: number;
  primaryStandard: number | null;
  primaryRate: number;
  primaryAmount: number;
  secondaryActual: number;
  secondaryStandard: number | null;
  secondaryRate: number;
  secondaryAmount: number;
  substituteCount: number;
  absentCount: number;
  pendingPastPeriods: number;
  overtimePeriods: number;
  adjustmentAmount: number;
  adjustmentReason: string;
  examDutyCount?: number;
  examSupervisionAmount?: number;
  requiresExamRateReview?: boolean;
  totalAmount: number;
  status: PayrollApprovalStatus;
  approvedBy?: string;
  approvedAt?: unknown;
  payrollDocId: string;
  schedules: ScheduleWithMeta[];
}

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

export function currentMonthString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function localTodayDateOnly() {
  return dateOnlyFromDate(new Date());
}

export function dateFromScheduleRow(schedule: Row): string {
  return payrollScheduleDate(schedule);
}

const DAY_NAMES_VI: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

export function parseScheduleDateDetails(dateStr: string) {
  if (!dateStr) return { dayName: "—", formattedDate: "—", dayOfWeek: 2 };
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return { dayName: "—", formattedDate: dateStr, dayOfWeek: 2 };
  const dayOfWeek = parsed.getDay();
  return {
    dayName: DAY_NAMES_VI[dayOfWeek] || `Thứ ${dayOfWeek + 1}`,
    formattedDate: format(parsed, "dd/MM/yyyy"),
    dayOfWeek,
  };
}

export function resolveScheduleSchoolLevel(
  schedule: Row,
  classDoc?: Row
): "PRIMARY" | "SECONDARY" {
  return payrollSchoolLevel(schedule, classDoc);
}

export function resolveTeacherLevel(
  teacher: Row,
  primaryHours: number,
  secondaryHours: number
): TeachingLevel {
  const levels = Array.isArray(teacher.schoolLevels)
    ? (teacher.schoolLevels as string[])
    : typeof teacher.schoolLevel === "string"
      ? [teacher.schoolLevel]
      : [];

  const declaredBoth =
    levels.includes("all") ||
    levels.includes("both") ||
    (levels.includes("primary") && levels.includes("secondary"));

  if (declaredBoth || (primaryHours > 0 && secondaryHours > 0)) {
    return "BOTH";
  }
  if (levels.includes("primary") || (primaryHours > 0 && secondaryHours === 0)) {
    return "PRIMARY";
  }
  return "SECONDARY";
}

export function teachingLevelLabelVi(level: TeachingLevel): string {
  switch (level) {
    case "PRIMARY":
      return "Cấp 1";
    case "SECONDARY":
      return "Cấp 2";
    case "BOTH":
      return "Cả 2 cấp";
    default:
      return "—";
  }
}

const AUTOMATED_NOTE_PREFIXES = [
  "Duyệt nhanh tất cả lịch đã qua",
  "Xác nhận đã dạy",
  "Xác nhận hàng loạt theo phân công",
  "Duyệt nhanh lịch ngày",
  "Duyệt nhanh lịch của",
  "Xác nhận hàng loạt đã dạy",
];

export function cleanNoteText(reason?: unknown, note?: unknown): string {
  const r = typeof reason === "string" ? reason.trim() : "";
  const n = typeof note === "string" ? note.trim() : "";
  const isAutomated = AUTOMATED_NOTE_PREFIXES.some((prefix) => r.startsWith(prefix));
  if (isAutomated) {
    return n;
  }
  if (r && n && r !== n) {
    return `${r} (${n})`;
  }
  return r || n || "";
}

export function statusLabelVi(status: AttendanceDisplayStatus | unknown): string {
  switch (status) {
    case "confirmed":
      return "Đã dạy";
    case "adjusted":
      return "Dạy thay / Điều chỉnh";
    case "absent":
      return "Vắng / Báo nghỉ";
    case "pending_past":
      return "Cần xử lý (Quá hạn)";
    case "upcoming":
      return "Chưa tới hạn";
    case "paid":
      return "Đã chi trả";
    case "locked":
      return "Đã khóa";
    case "draft":
      return "Nháp";
    default:
      return "Chưa xác nhận";
  }
}

export function statusBadgeTone(status: AttendanceDisplayStatus | unknown): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "confirmed":
      return "success";
    case "adjusted":
      return "info";
    case "absent":
      return "danger";
    case "pending_past":
      return "warning";
    case "upcoming":
    default:
      return "neutral";
  }
}

export function payrollStatusLabelVi(status: PayrollApprovalStatus | string | unknown): string {
  switch (status) {
    case "approved":
      return "Đã duyệt";
    case "pending_approval":
      return "Chờ duyệt";
    case "review_required":
      return "Yêu cầu rà soát";
    case "paid":
      return "Đã chi trả";
    case "locked":
      return "Đã khóa";
    case "draft":
      return "Nháp";
    default:
      return "Chờ duyệt";
  }
}

export function payrollStatusBadgeTone(status: PayrollApprovalStatus | string | unknown): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "approved":
    case "paid":
      return "success";
    case "review_required":
      return "danger";
    case "pending_approval":
      return "warning";
    case "draft":
    default:
      return "neutral";
  }
}

// Subject color theme helper for visual distinction
export function getSubjectColorClasses(subjectName: string = ""): {
  bg: string;
  text: string;
  border: string;
} {
  const norm = subjectName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

  if (norm.includes("toan")) {
    return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
  }
  if (norm.includes("tieng viet") || norm.includes("viet")) {
    return { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" };
  }
  if (norm.includes("van") || norm.includes("ngu van")) {
    return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  }
  if (norm.includes("anh") || norm.includes("tieng anh") || norm.includes("english")) {
    return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" };
  }
  if (norm.includes("khoa hoc") || norm.includes("khtn") || norm.includes("ly") || norm.includes("hoa") || norm.includes("sinh")) {
    return { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" };
  }
  if (norm.includes("su") || norm.includes("lich su") || norm.includes("dia") || norm.includes("dia ly")) {
    return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
  }
  if (norm.includes("tin") || norm.includes("tin hoc") || norm.includes("cong nghe")) {
    return { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" };
  }
  if (norm.includes("nhac") || norm.includes("am nhac") || norm.includes("my thuat")) {
    return { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200" };
  }
  if (norm.includes("the duc") || norm.includes("gdtc") || norm.includes("the chat")) {
    return { bg: "bg-lime-50", text: "text-lime-800", border: "border-lime-200" };
  }
  if (norm.includes("gdcd") || norm.includes("dao duc") || norm.includes("hdtn")) {
    return { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200" };
  }

  return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
}
