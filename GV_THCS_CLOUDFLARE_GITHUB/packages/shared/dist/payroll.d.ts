export type PayrollRecord = Record<string, unknown>;
export type PayrollSchoolLevel = "PRIMARY" | "SECONDARY";
export type TeachingAttendanceStatus = "confirmed" | "adjusted" | "absent" | "pending" | "cancelled";
export declare function finiteNumber(value: unknown, fallback?: number): number;
export declare function payrollScheduleDate(schedule: PayrollRecord): string;
export type PeriodRangeConvention = "exclusive" | "inclusive";
export declare function resolveSchedulePeriodRange(schedule: PayrollRecord): {
    start: number | null;
    end: number | null;
    last: number | null;
    count: number;
    convention: PeriodRangeConvention;
};
export declare function scheduledPeriodCount(schedule: PayrollRecord): number;
export declare function normalizeSchedulePeriodRange<T extends PayrollRecord>(schedule: T): T;
export declare function formatPeriodDisplay(startOrSchedule: unknown, endPeriod?: unknown, metadata?: PayrollRecord): {
    label: string;
    display: string;
    start: number | null;
    end: number | null;
    last: number | null;
    count: number;
    convention: PeriodRangeConvention;
};
export declare function payrollSchoolLevel(schedule: PayrollRecord, classDoc?: PayrollRecord): PayrollSchoolLevel;
export declare function indexMonthlyCheckins(checkins: PayrollRecord[], month: string): Map<string, PayrollRecord>;
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
export declare function resolveTeachingAttendance(schedule: PayrollRecord, checkin?: PayrollRecord, classDoc?: PayrollRecord): ResolvedTeachingAttendance;
export declare function teacherAttendanceTotals(teacherId: string, records: ResolvedTeachingAttendance[]): {
    primaryActual: number;
    secondaryActual: number;
    actualPeriods: number;
    substituteCount: number;
    absentCount: number;
};
export declare function teacherPayrollAmounts(teacher: PayrollRecord, totals: ReturnType<typeof teacherAttendanceTotals>, payroll?: PayrollRecord, settings?: PayrollRecord): {
    primaryRate: number;
    secondaryRate: number;
    primaryAmount: number;
    secondaryAmount: number;
    adjustmentAmount: number;
    totalAmount: number;
};
export declare function teacherPayrollStandards(teacher: PayrollRecord, primaryActual: number, secondaryActual: number, weeks?: number): {
    primaryStandard: number | null;
    secondaryStandard: number | null;
    standardPeriods: number | null;
    overtimePeriods: number;
};
export interface PayrollSummaryInput {
    primaryActual: number;
    secondaryActual: number;
    substituteCount: number;
    absentCount: number;
    totalAmount: number;
    pendingPastPeriods?: number;
    status: string;
}
export declare function summarizePayrollRows(rows: PayrollSummaryInput[]): {
    totalTeachers: number;
    primaryPeriods: number;
    secondaryPeriods: number;
    totalPeriods: number;
    substitutePeriods: number;
    absentPeriods: number;
    pendingPastPeriods: number;
    totalEstimatedPayroll: number;
    pendingApprovalTeachers: number;
    approvedTeachers: number;
    reviewRequiredTeachers: number;
};
