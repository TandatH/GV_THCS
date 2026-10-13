// Quy tắc dùng chung cho giao diện và Cloud Functions, không phụ thuộc Firebase.
export type PayrollRecord = Record<string, unknown>;
export type PayrollSchoolLevel = "PRIMARY" | "SECONDARY";
export type TeachingAttendanceStatus = "confirmed" | "adjusted" | "absent" | "pending" | "cancelled";

export function finiteNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function id(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function payrollScheduleDate(schedule: PayrollRecord): string {
  if (typeof schedule.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(schedule.date)) return schedule.date;
  const weekStart = id(schedule.weekStart).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return "";
  // Tính ngày bằng UTC để server và trình duyệt không lệch tháng do múi giờ.
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + finiteNumber(schedule.dayOfWeek, 2) - 2);
  return date.toISOString().slice(0, 10);
}

export type PeriodRangeConvention = "exclusive" | "inclusive";

export function resolveSchedulePeriodRange(schedule: PayrollRecord) {
  const start = finiteNumber(schedule.startPeriod);
  const rawEnd = finiteNumber(schedule.endPeriod);
  const storedCount = finiteNumber(schedule.periodCount);
  const validStart = Number.isInteger(start) && start > 0;
  const validEnd = Number.isInteger(rawEnd) && rawEnd > 0;
  const validStoredCount = Number.isInteger(storedCount) && storedCount > 0;
  // Lịch hiện tại lưu mốc kết thúc loại trừ: chọn tiết 1–2 => start=1, end=3.
  // Chỉ dùng quy ước bao gồm tiết cuối khi có cờ rõ ràng hoặc số tiết lịch cũ xác nhận.
  // Không thể suy ra ý định nhập tay chỉ từ cặp 1,2; mặc định giữ quy ước hệ thống.
  const convention: PeriodRangeConvention = schedule.periodRangeConvention === "inclusive"
    || (schedule.periodRangeConvention !== "exclusive" && validStart && validEnd
      && validStoredCount && storedCount === rawEnd - start + 1) ? "inclusive" : "exclusive";
  if (validStart && validEnd) {
    const end = rawEnd + (convention === "inclusive" ? 1 : 0);
    const count = Math.max(0, end - start);
    return { start, end, last: count > 0 ? end - 1 : null, count, convention };
  }
  // Không hồi sinh khoảng tiết đảo ngược/thập phân bằng periodCount cũ.
  const malformedRange = (schedule.startPeriod != null && schedule.startPeriod !== "" && !validStart)
    || (schedule.endPeriod != null && schedule.endPeriod !== "" && !validEnd);
  const count = !malformedRange && validStoredCount ? storedCount : 0;
  return { start: validStart ? start : null, end: validStart && count > 0 ? start + count : null,
    last: validStart && count > 0 ? start + count - 1 : null, count, convention };
}

export function scheduledPeriodCount(schedule: PayrollRecord): number {
  return resolveSchedulePeriodRange(schedule).count;
}

export function normalizeSchedulePeriodRange<T extends PayrollRecord>(schedule: T): T {
  const range = resolveSchedulePeriodRange(schedule);
  // Chuẩn hóa bản đọc trong bộ nhớ cho lịch/bảng in; không tự ghi đổi dữ liệu Firestore.
  if (range.count <= 0 || range.start === null || range.end === null) return schedule;
  return { ...schedule, startPeriod: range.start, endPeriod: range.end,
    periodCount: range.count, periodRangeConvention: "exclusive" };
}

// Một hàm cho cả nhãn tiết và số tiết, tránh giao diện ghi 1 tiết nhưng lương tính 0.
export function formatPeriodDisplay(startOrSchedule: unknown, endPeriod?: unknown, metadata: PayrollRecord = {}) {
  const schedule = typeof startOrSchedule === "object" && startOrSchedule !== null
    ? startOrSchedule as PayrollRecord : { ...metadata, startPeriod: startOrSchedule, endPeriod };
  const range = resolveSchedulePeriodRange(schedule);
  const label = range.count > 0 && range.start !== null && range.last !== null
    ? range.start === range.last ? `Tiết ${range.start}` : `Tiết ${range.start}–${range.last}`
    : range.count > 0 ? "Chưa rõ khoảng tiết" : "Khoảng tiết không hợp lệ";
  return { ...range, label, display: `${label} (${range.count} tiết)` };
}

export function payrollSchoolLevel(schedule: PayrollRecord, classDoc?: PayrollRecord): PayrollSchoolLevel {
  for (const level of [schedule.schoolLevel, classDoc?.schoolLevel]) {
    if (level === "primary" || level === "PRIMARY") return "PRIMARY";
    if (level === "secondary" || level === "SECONDARY") return "SECONDARY";
  }
  const grade = finiteNumber(classDoc?.grade ?? classDoc?.gradeLevel);
  if (grade >= 1 && grade <= 5) return "PRIMARY";
  if (grade >= 6 && grade <= 9) return "SECONDARY";
  const match = String(classDoc?.name || classDoc?.code || schedule.className || "").match(/^([1-9])/);
  return match && Number(match[1]) <= 5 ? "PRIMARY" : "SECONDARY";
}

function updateTime(record: PayrollRecord): number {
  const timestamp = record.updatedAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (typeof timestamp?.toMillis === "function") return timestamp.toMillis();
  return finiteNumber(timestamp?.seconds) * 1000;
}

export function indexMonthlyCheckins(checkins: PayrollRecord[], month: string): Map<string, PayrollRecord> {
  const result = new Map<string, PayrollRecord>();
  for (const checkin of checkins) {
    const scheduleId = id(checkin.scheduleId);
    if (!scheduleId || checkin.month !== month || checkin.isActive === false) continue;
    const previous = result.get(scheduleId);
    // Mỗi lịch chỉ có một bản ghi hiệu lực: ưu tiên bản mới nhất, rồi ID chuẩn.
    const comparison = previous ? updateTime(checkin) - updateTime(previous) : 1;
    const canonicalId = `${month}_${scheduleId}`;
    if (!previous || comparison > 0 || (comparison === 0 && (
      checkin.id === canonicalId || (previous.id !== canonicalId && id(checkin.id) > id(previous.id))
    ))) result.set(scheduleId, checkin);
  }
  return result;
}

export interface ResolvedTeachingAttendance {
  originalTeacherId: string;
  effectiveTeacherId: string;
  isSubstituted: boolean;
  originalTeacherAbsent: boolean;
  status: TeachingAttendanceStatus;
  periodCount: number;
  payablePeriods: number;
  schoolLevel: PayrollSchoolLevel;
}

export function resolveTeachingAttendance(
  schedule: PayrollRecord, checkin?: PayrollRecord, classDoc?: PayrollRecord,
): ResolvedTeachingAttendance {
  const originalTeacherId = id(schedule.originalTeacherId) || id(checkin?.originalTeacherId) || id(schedule.teacherId);
  const assignedTeacherId = id(schedule.actualTeacherId) || id(schedule.effectiveTeacherId) || id(schedule.teacherId);
  const recordedTeacherId = id(checkin?.actualTeacherId) || id(checkin?.effectiveTeacherId) || id(checkin?.teacherId);
  let effectiveTeacherId = recordedTeacherId || assignedTeacherId;
  const scheduledPeriods = scheduledPeriodCount(schedule);
  const periodCount = Math.max(0, finiteNumber(checkin?.periodCount, scheduledPeriods));
  const rawStatus = checkin ? checkin.status : (schedule.attendanceStatus ?? schedule.status);
  let status: TeachingAttendanceStatus = "pending";
  if (rawStatus === "confirmed" || rawStatus === "adjusted" || rawStatus === "absent") status = rawStatus;
  // Lịch hủy/vắng luôn chặn trả tiền, kể cả còn bản chấm công cũ đã xác nhận.
  if (schedule.status === "absent" || schedule.attendanceStatus === "absent") status = "absent";
  if (schedule.status === "cancelled" || schedule.isActive === false) status = "cancelled";
  const staleAssignment = checkin && (
    (id(checkin.assignedTeacherId) && id(checkin.assignedTeacherId) !== assignedTeacherId)
    || (rawStatus === "confirmed" && recordedTeacherId && recordedTeacherId !== assignedTeacherId)
    || (recordedTeacherId === originalTeacherId && assignedTeacherId !== originalTeacherId)
  );
  if (staleAssignment) effectiveTeacherId = assignedTeacherId;
  if (status !== "cancelled" && status !== "absent" && (staleAssignment || schedule.teacherUnassigned === true)) status = "pending";
  const payable = (status === "confirmed" || status === "adjusted") && Boolean(effectiveTeacherId);
  return {
    originalTeacherId,
    effectiveTeacherId,
    isSubstituted: Boolean(originalTeacherId && effectiveTeacherId && originalTeacherId !== effectiveTeacherId),
    originalTeacherAbsent: Boolean(originalTeacherId && (
      (effectiveTeacherId && originalTeacherId !== effectiveTeacherId) || status === "absent" || schedule.teacherUnassigned === true)),
    status,
    periodCount: scheduledPeriods,
    payablePeriods: payable ? Math.min(scheduledPeriods, periodCount, Math.max(0, finiteNumber(checkin?.payablePeriods, periodCount))) : 0,
    schoolLevel: payrollSchoolLevel(schedule, classDoc),
  };
}

export function teacherAttendanceTotals(teacherId: string, records: ResolvedTeachingAttendance[]) {
  let primaryActual = 0;
  let secondaryActual = 0;
  let substituteCount = 0;
  let absentCount = 0;
  for (const record of records) {
    if (record.status === "cancelled") continue;
    // Bù–trừ tuyệt đối: chỉ người thực dạy hưởng tiết; người gốc không được cộng lại.
    if (record.effectiveTeacherId === teacherId) {
      if (record.schoolLevel === "PRIMARY") primaryActual += record.payablePeriods;
      else secondaryActual += record.payablePeriods;
      if (record.isSubstituted) substituteCount += record.payablePeriods;
    }
    // Người gốc được ghi nhận vắng khi bàn giao; người thay vắng cũng không hưởng tiền.
    if ((record.originalTeacherId === teacherId && record.originalTeacherAbsent)
      || (record.effectiveTeacherId === teacherId && record.status === "absent")) absentCount += record.periodCount;
  }
  return { primaryActual, secondaryActual, actualPeriods: primaryActual + secondaryActual, substituteCount, absentCount };
}

export function teacherPayrollAmounts(
  teacher: PayrollRecord,
  totals: ReturnType<typeof teacherAttendanceTotals>,
  payroll: PayrollRecord = {},
  settings: PayrollRecord = {},
) {
  const primaryRate = Math.max(0, finiteNumber(payroll.overridePrimaryRate,
    finiteNumber(teacher.primaryRatePerPeriod, finiteNumber(teacher.ratePerPeriod, finiteNumber(settings.primaryDefaultRate, 120000)))));
  const secondaryRate = Math.max(0, finiteNumber(payroll.overrideSecondaryRate,
    finiteNumber(teacher.secondaryRatePerPeriod, finiteNumber(teacher.ratePerPeriod, finiteNumber(settings.secondaryDefaultRate, 150000)))));
  // Có tiết có tiền cho cả cơ hữu và thỉnh giảng. Định mức chỉ dùng để đối chiếu.
  // Không dùng override số tiết hoặc amount cũ để hồi sinh tiết đã vắng/chuyển người.
  const primaryAmount = totals.primaryActual * primaryRate;
  const secondaryAmount = totals.secondaryActual * secondaryRate;
  const adjustmentAmount = finiteNumber(payroll.adjustmentAmount);
  return { primaryRate, secondaryRate, primaryAmount, secondaryAmount, adjustmentAmount,
    totalAmount: primaryAmount + secondaryAmount + adjustmentAmount };
}

export function teacherPayrollStandards(teacher: PayrollRecord, primaryActual: number, secondaryActual: number, weeks = 4) {
  const levels = Array.isArray(teacher.schoolLevels) ? teacher.schoolLevels : [teacher.schoolLevel];
  const both = levels.includes("all") || levels.includes("both")
    || (levels.includes("primary") && levels.includes("secondary")) || (primaryActual > 0 && secondaryActual > 0);
  const primary = levels.includes("primary") || (primaryActual > 0 && secondaryActual === 0);
  let primaryStandard: number | null = null;
  let secondaryStandard: number | null = null;
  if (teacher.teacherType !== "thinh_giang") {
    const weekly = Math.max(0, finiteNumber(teacher.standardPeriodsPerWeek, primary || both ? 20 : 19));
    const standard = Math.round(weekly * weeks * 100) / 100;
    if (both) { primaryStandard = Math.round(standard / 2 * 100) / 100; secondaryStandard = standard - primaryStandard; }
    else if (primary) primaryStandard = standard;
    else secondaryStandard = standard;
  }
  return { primaryStandard, secondaryStandard,
    standardPeriods: primaryStandard === null && secondaryStandard === null ? null : (primaryStandard ?? 0) + (secondaryStandard ?? 0),
    overtimePeriods: (primaryStandard === null ? 0 : Math.max(0, primaryActual - primaryStandard))
      + (secondaryStandard === null ? 0 : Math.max(0, secondaryActual - secondaryStandard)) };
}

export interface PayrollSummaryInput {
  primaryActual: number;
  secondaryActual: number;
  substituteCount: number;
  absentCount: number;
  totalAmount: number;
  pendingPastPeriods?: number;
  status: string;
}

export function summarizePayrollRows(rows: PayrollSummaryInput[]) {
  // KPI và chân bảng cùng cộng các dòng sau lọc, không cộng/trừ lại chỉ số đối soát.
  return rows.reduce((total, row) => {
    total.totalTeachers += 1;
    total.primaryPeriods += row.primaryActual;
    total.secondaryPeriods += row.secondaryActual;
    total.totalPeriods += row.primaryActual + row.secondaryActual;
    total.substitutePeriods += row.substituteCount;
    total.absentPeriods += row.absentCount;
    total.pendingPastPeriods += row.pendingPastPeriods ?? 0;
    total.totalEstimatedPayroll += row.totalAmount;
    if (row.status === "draft" || row.status === "pending_approval") total.pendingApprovalTeachers += 1;
    if (["approved", "locked", "paid"].includes(row.status)) total.approvedTeachers += 1;
    if (row.status === "review_required") total.reviewRequiredTeachers += 1;
    return total;
  }, { totalTeachers: 0, primaryPeriods: 0, secondaryPeriods: 0, totalPeriods: 0, substitutePeriods: 0,
    absentPeriods: 0, pendingPastPeriods: 0, totalEstimatedPayroll: 0, pendingApprovalTeachers: 0,
    approvedTeachers: 0, reviewRequiredTeachers: 0 });
}
