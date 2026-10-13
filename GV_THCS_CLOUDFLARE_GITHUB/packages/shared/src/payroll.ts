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

export function scheduledPeriodCount(schedule: PayrollRecord): number {
  const start = finiteNumber(schedule.startPeriod);
  const end = finiteNumber(schedule.endPeriod);
  return Math.max(0, end > start && start > 0 ? end - start : finiteNumber(schedule.periodCount));
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
