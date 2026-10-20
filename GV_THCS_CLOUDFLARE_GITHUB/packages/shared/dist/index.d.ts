import { z } from "zod";
export declare const roles: readonly ["admin", "bgh", "totruong", "giaovien"];
export declare const teacherTypes: readonly ["co_huu", "thinh_giang"];
export declare const activityStatuses: readonly ["active", "inactive"];
export declare const schoolLevels: readonly ["primary", "secondary"];
export declare const teachingRoles: readonly ["chu_nhiem", "bo_mon", "ca_hai"];
export declare const bghPositions: readonly ["hieutruong", "phohieutruong"];
export type Role = (typeof roles)[number];
export type TeacherType = (typeof teacherTypes)[number];
export type ActivityStatus = (typeof activityStatuses)[number];
export type SchoolLevel = (typeof schoolLevels)[number];
export type TeachingRole = (typeof teachingRoles)[number];
export type BghPosition = (typeof bghPositions)[number];
export interface AuditFields {
    createdAt?: unknown;
    createdBy: string;
    updatedAt?: unknown;
    updatedBy: string;
    isActive: boolean;
}
export interface AppUser extends AuditFields {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    departmentId?: string;
    teacherId?: string;
    bghPosition?: BghPosition;
    schoolLevel?: SchoolLevel | "all";
}
export declare const roleSchema: z.ZodEnum<{
    admin: "admin";
    bgh: "bgh";
    totruong: "totruong";
    giaovien: "giaovien";
}>;
export declare const teacherTypeSchema: z.ZodEnum<{
    co_huu: "co_huu";
    thinh_giang: "thinh_giang";
}>;
export declare const schoolLevelSchema: z.ZodEnum<{
    primary: "primary";
    secondary: "secondary";
}>;
export declare const teachingRoleSchema: z.ZodEnum<{
    chu_nhiem: "chu_nhiem";
    bo_mon: "bo_mon";
    ca_hai: "ca_hai";
}>;
export declare const bghPositionSchema: z.ZodEnum<{
    hieutruong: "hieutruong";
    phohieutruong: "phohieutruong";
}>;
export declare const teachingAssignmentSchema: z.ZodObject<{
    subjectId: z.ZodString;
    gradeLevels: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
export declare const teacherSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    teacherCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    userId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    fullName: z.ZodString;
    email: z.ZodEmail;
    phone: z.ZodString;
    departmentId: z.ZodString;
    homeroomDepartmentId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    subjectIds: z.ZodArray<z.ZodString>;
    schoolLevels: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
    }>>>;
    teachingRole: z.ZodDefault<z.ZodEnum<{
        chu_nhiem: "chu_nhiem";
        bo_mon: "bo_mon";
        ca_hai: "ca_hai";
    }>>;
    teachingAssignments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        subjectId: z.ZodString;
        gradeLevels: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>>>;
    specialization: z.ZodString;
    degree: z.ZodString;
    startDate: z.ZodString;
    teacherType: z.ZodEnum<{
        co_huu: "co_huu";
        thinh_giang: "thinh_giang";
    }>;
    standardPeriodsPerWeek: z.ZodNullable<z.ZodNumber>;
    ratePerPeriod: z.ZodNullable<z.ZodNumber>;
    campusId: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        inactive: "inactive";
    }>;
    avatarUrl: z.ZodDefault<z.ZodUnion<[z.ZodURL, z.ZodLiteral<"">]>>;
    contract: z.ZodObject<{
        type: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        number: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        expiresAt: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type TeacherInput = z.infer<typeof teacherSchema>;
export interface Teacher extends TeacherInput, AuditFields {
    id: string;
    averageRating?: number;
}
export declare const catalogCollections: readonly ["schoolYears", "departments", "subjects", "classes", "rooms", "campuses", "semesters", "timeSlots"];
export type CatalogCollection = (typeof catalogCollections)[number];
export declare const catalogSchema: z.ZodObject<{
    code: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    name: z.ZodString;
    schoolYearId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    departmentId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    campusId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type CatalogInput = z.infer<typeof catalogSchema>;
export declare const availabilitySchema: z.ZodObject<{
    teacherId: z.ZodString;
    teacherType: z.ZodOptional<z.ZodLiteral<"thinh_giang">>;
    semesterId: z.ZodString;
    schoolYearId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    slots: z.ZodArray<z.ZodString>;
    approvedSlots: z.ZodOptional<z.ZodArray<z.ZodString>>;
    status: z.ZodEnum<{
        draft: "draft";
        submitted: "submitted";
    }>;
}, z.core.$strip>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export declare const scheduleSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    teacherId: z.ZodString;
    subjectId: z.ZodString;
    classId: z.ZodString;
    roomId: z.ZodString;
    campusId: z.ZodString;
    departmentId: z.ZodString;
    semesterId: z.ZodString;
    schoolYearId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    weekStart: z.ZodString;
    dayOfWeek: z.ZodNumber;
    startPeriod: z.ZodNumber;
    periodRangeConvention: z.ZodOptional<z.ZodLiteral<"exclusive">>;
    endPeriod: z.ZodNumber;
    status: z.ZodDefault<z.ZodEnum<{
        scheduled: "scheduled";
        needs_attention: "needs_attention";
        cancelled: "cancelled";
    }>>;
    confirmationDeadline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancellationReason: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export declare const setUserRoleSchema: z.ZodObject<{
    uid: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<{
        admin: "admin";
        bgh: "bgh";
        totruong: "totruong";
        giaovien: "giaovien";
    }>;
    departmentId: z.ZodOptional<z.ZodString>;
    bghPosition: z.ZodOptional<z.ZodEnum<{
        hieutruong: "hieutruong";
        phohieutruong: "phohieutruong";
    }>>;
    schoolLevel: z.ZodOptional<z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
        all: "all";
    }>>;
    teacherId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;
export declare const scheduleResponseSchema: z.ZodObject<{
    scheduleId: z.ZodString;
    response: z.ZodEnum<{
        xac_nhan: "xac_nhan";
        tu_choi: "tu_choi";
    }>;
    reason: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
}, z.core.$strip>;
export declare const leaveRequestSchema: z.ZodObject<{
    teacherId: z.ZodString;
    scheduleIds: z.ZodArray<z.ZodString>;
    reason: z.ZodString;
    attachmentPaths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        nhap: "nhap";
        cho_duyet: "cho_duyet";
    }>>;
}, z.core.$strip>;
export declare const substitutionDecisionSchema: z.ZodObject<{
    scheduleId: z.ZodString;
    substituteTeacherId: z.ZodString;
    substituteSubjectId: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
}, z.core.$strip>;
export declare const approveLeaveSchema: z.ZodObject<{
    leaveRequestId: z.ZodString;
    decision: z.ZodEnum<{
        tu_choi: "tu_choi";
        da_duyet: "da_duyet";
    }>;
    note: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    substituteTeacherId: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    substitutions: z.ZodPreprocess<z.ZodOptional<z.ZodArray<z.ZodObject<{
        scheduleId: z.ZodString;
        substituteTeacherId: z.ZodString;
        substituteSubjectId: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    }, z.core.$strip>>>, unknown>;
}, z.core.$strip>;
export type ApproveLeaveInput = z.infer<typeof approveLeaveSchema>;
export declare const payrollSchema: z.ZodObject<{
    month: z.ZodString;
    schoolYearId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    teachingWeeks: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const suggestionSchema: z.ZodObject<{
    scheduleId: z.ZodString;
}, z.core.$strip>;
export declare const evaluationSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    teacherId: z.ZodString;
    periodId: z.ZodString;
    criteria: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        score: z.ZodNumber;
        weight: z.ZodNumber;
    }, z.core.$strip>>;
    notes: z.ZodDefault<z.ZodString>;
    status: z.ZodEnum<{
        draft: "draft";
        published: "published";
    }>;
}, z.core.$strip>;
export declare const attendanceSchema: z.ZodObject<{
    scheduleId: z.ZodString;
    status: z.ZodEnum<{
        confirmed: "confirmed";
        absent: "absent";
        adjusted: "adjusted";
    }>;
    actualTeacherId: z.ZodOptional<z.ZodString>;
    periodCount: z.ZodOptional<z.ZodNumber>;
    payablePeriods: z.ZodOptional<z.ZodNumber>;
    payable: z.ZodOptional<z.ZodBoolean>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ScheduleConflictCode = "TEACHER_BUSY" | "CLASS_BUSY" | "ROOM_BUSY" | "OUTSIDE_AVAILABILITY" | "OVERLOAD" | "TRAVEL_TIME" | "INACTIVE_RESOURCE" | "INVALID_PERIOD";
export interface SubstituteCandidate {
    teacherId: string;
    teacherName: string;
    score: number;
    reasons: string[];
    weeklyPeriods: number;
    departmentId?: string;
    departmentName?: string;
    primarySubjectId?: string;
    primarySubjectName?: string;
    subjectNames?: string[];
    isSameSubject?: boolean;
}
export declare function periodsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean;
export declare function scheduleResourceSlotKeys(input: Pick<ScheduleInput, "semesterId" | "weekStart" | "dayOfWeek" | "startPeriod" | "endPeriod" | "classId" | "roomId">, teacherId: string): string[];
export declare function scheduleSlotKeys(input: ScheduleInput): string[];
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
export declare const disciplineCategories: readonly ["ky_luat", "hoc_tap", "ghi_chu"];
export type DisciplineCategory = (typeof disciplineCategories)[number];
export declare const disciplineCategoryLabels: Record<DisciplineCategory, string>;
export declare const disciplineUnitTypes: readonly ["per_student", "per_occurrence", "per_unit"];
export type DisciplineUnitType = (typeof disciplineUnitTypes)[number];
export declare const disciplineUnitTypeLabels: Record<DisciplineUnitType, string>;
export declare const disciplineEntryStatuses: readonly ["pending", "approved", "returned", "rejected", "voided"];
export type DisciplineEntryStatus = (typeof disciplineEntryStatuses)[number];
export declare const disciplineEntryStatusLabels: Record<DisciplineEntryStatus, string>;
export declare const disciplineApprovalStatuses: readonly ["draft", "signed", "locked", "superseded"];
export type DisciplineApprovalStatus = (typeof disciplineApprovalStatuses)[number];
export declare const disciplineApprovalStatusLabels: Record<DisciplineApprovalStatus, string>;
export declare const disciplineRoleTypes: readonly ["discipline_committee", "competition_committee"];
export type DisciplineRoleType = (typeof disciplineRoleTypes)[number];
export declare const disciplineRoleTypeLabels: Record<DisciplineRoleType, string>;
export declare const disciplineAppealStatuses: readonly ["pending", "approved", "rejected"];
export type DisciplineAppealStatus = (typeof disciplineAppealStatuses)[number];
export declare const studentStatuses: readonly ["studying", "transferred", "graduated", "suspended"];
export type StudentStatus = (typeof studentStatuses)[number];
export declare const studentSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    studentCode: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    fullName: z.ZodString;
    classId: z.ZodString;
    className: z.ZodString;
    schoolYearId: z.ZodString;
    gender: z.ZodEnum<{
        male: "male";
        female: "female";
    }>;
    dateOfBirth: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    status: z.ZodDefault<z.ZodEnum<{
        studying: "studying";
        transferred: "transferred";
        graduated: "graduated";
        suspended: "suspended";
    }>>;
    parentPhone: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    parentName: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type StudentInput = z.infer<typeof studentSchema>;
export interface Student extends StudentInput {
    id: string;
    createdAt?: unknown;
    createdBy: string;
    updatedAt?: unknown;
    updatedBy: string;
    isActive: boolean;
}
export declare const disciplineCriterionSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    name: z.ZodString;
    category: z.ZodEnum<{
        ky_luat: "ky_luat";
        hoc_tap: "hoc_tap";
        ghi_chu: "ghi_chu";
    }>;
    unitType: z.ZodEnum<{
        per_student: "per_student";
        per_occurrence: "per_occurrence";
        per_unit: "per_unit";
    }>;
    type: z.ZodEnum<{
        minus: "minus";
        plus: "plus";
    }>;
    defaultPoints: z.ZodNumber;
    displayUnitText: z.ZodString;
    scope: z.ZodDefault<z.ZodEnum<{
        both: "both";
        student: "student";
        class: "class";
    }>>;
    applicableGrades: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    displayOrder: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type DisciplineCriterionInput = z.infer<typeof disciplineCriterionSchema>;
export type DisciplineCriterionRawInput = z.input<typeof disciplineCriterionSchema>;
export interface DisciplineCriterion extends DisciplineCriterionInput {
    id: string;
    createdAt?: unknown;
    createdBy: string;
    updatedAt?: unknown;
    updatedBy: string;
}
export type DefaultDisciplineCriterion = Omit<DisciplineCriterionRawInput, "id">;
export declare const DEFAULT_DISCIPLINE_CRITERIA: DefaultDisciplineCriterion[];
export declare const disciplineAssignmentSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    userUid: z.ZodString;
    userEmail: z.ZodString;
    userFullName: z.ZodString;
    roleType: z.ZodEnum<{
        discipline_committee: "discipline_committee";
        competition_committee: "competition_committee";
    }>;
    assignedClassIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    schoolYearId: z.ZodString;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type DisciplineAssignmentInput = z.infer<typeof disciplineAssignmentSchema>;
export interface DisciplineAssignment extends DisciplineAssignmentInput {
    id: string;
    assignedByUid: string;
    assignedByName?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}
export declare const disciplineWeeklySignerAssignmentSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    weekId: z.ZodString;
    weekNumber: z.ZodNumber;
    classId: z.ZodString;
    className: z.ZodString;
    schoolYearId: z.ZodString;
    assignedSignerUid: z.ZodString;
    assignedSignerName: z.ZodString;
    assignedSignerEmail: z.ZodString;
    notes: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type DisciplineWeeklySignerAssignmentInput = z.infer<typeof disciplineWeeklySignerAssignmentSchema>;
export interface DisciplineWeeklySignerAssignment extends DisciplineWeeklySignerAssignmentInput {
    id: string;
    assignedByUid: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}
export declare const disciplineEntrySchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    weekId: z.ZodString;
    schoolYearId: z.ZodString;
    classId: z.ZodString;
    className: z.ZodString;
    criterionId: z.ZodString;
    criterionCode: z.ZodString;
    criterionName: z.ZodString;
    category: z.ZodEnum<{
        ky_luat: "ky_luat";
        hoc_tap: "hoc_tap";
        ghi_chu: "ghi_chu";
    }>;
    unitType: z.ZodEnum<{
        per_student: "per_student";
        per_occurrence: "per_occurrence";
        per_unit: "per_unit";
    }>;
    unitPoints: z.ZodNumber;
    quantity: z.ZodDefault<z.ZodNumber>;
    totalPoints: z.ZodNumber;
    scope: z.ZodEnum<{
        student: "student";
        class: "class";
    }>;
    studentIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    studentNamesText: z.ZodDefault<z.ZodString>;
    occurredDate: z.ZodString;
    period: z.ZodOptional<z.ZodNumber>;
    note: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    attachmentUrls: z.ZodDefault<z.ZodArray<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        approved: "approved";
        returned: "returned";
        rejected: "rejected";
        voided: "voided";
    }>>;
    reportedByUid: z.ZodString;
    reportedByName: z.ZodString;
    reporterRole: z.ZodEnum<{
        admin: "admin";
        discipline_committee: "discipline_committee";
        competition_committee: "competition_committee";
        teacher: "teacher";
    }>;
    reviewedByUid: z.ZodOptional<z.ZodString>;
    reviewedByName: z.ZodOptional<z.ZodString>;
    reviewedAt: z.ZodOptional<z.ZodUnknown>;
    reviewNote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type DisciplineEntryInput = z.infer<typeof disciplineEntrySchema>;
export interface DisciplineEntry extends DisciplineEntryInput {
    id: string;
    createdAt?: unknown;
    createdBy: string;
    updatedAt?: unknown;
    updatedBy: string;
}
export declare const reviewDisciplineEntrySchema: z.ZodObject<{
    entryId: z.ZodString;
    decision: z.ZodEnum<{
        approved: "approved";
        returned: "returned";
        rejected: "rejected";
    }>;
    reviewerUid: z.ZodString;
    reviewerName: z.ZodString;
    reportedByUid: z.ZodString;
    reviewNote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type ReviewDisciplineEntryInput = z.infer<typeof reviewDisciplineEntrySchema>;
export declare function canReviewDisciplineEntry(reportedByUid: string, reviewerUid: string): boolean;
export declare const disciplineAppealSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    entryId: z.ZodString;
    classId: z.ZodString;
    className: z.ZodString;
    teacherId: z.ZodString;
    teacherName: z.ZodString;
    reason: z.ZodString;
    evidenceUrls: z.ZodDefault<z.ZodArray<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        approved: "approved";
        rejected: "rejected";
    }>>;
    resolutionNote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    resolvedByUid: z.ZodOptional<z.ZodString>;
    resolvedByName: z.ZodOptional<z.ZodString>;
    resolvedAt: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type DisciplineAppealInput = z.infer<typeof disciplineAppealSchema>;
export interface DisciplineAppeal extends DisciplineAppealInput {
    id: string;
    createdAt?: unknown;
    createdBy: string;
    updatedAt?: unknown;
    updatedBy: string;
}
export declare const disciplineWeeklySnapshotCriteriaRowSchema: z.ZodObject<{
    criterionId: z.ZodString;
    criterionCode: z.ZodString;
    criterionName: z.ZodString;
    category: z.ZodEnum<{
        ky_luat: "ky_luat";
        hoc_tap: "hoc_tap";
        ghi_chu: "ghi_chu";
    }>;
    unitType: z.ZodEnum<{
        per_student: "per_student";
        per_occurrence: "per_occurrence";
        per_unit: "per_unit";
    }>;
    unitPoints: z.ZodNumber;
    quantity: z.ZodNumber;
    totalPoints: z.ZodNumber;
    studentNamesText: z.ZodString;
}, z.core.$strip>;
export type DisciplineWeeklySnapshotCriteriaRow = z.infer<typeof disciplineWeeklySnapshotCriteriaRowSchema>;
export declare const disciplineWeeklySnapshotSchema: z.ZodObject<{
    weekId: z.ZodString;
    weekNumber: z.ZodNumber;
    classId: z.ZodString;
    className: z.ZodString;
    schoolYearId: z.ZodString;
    basePoints: z.ZodDefault<z.ZodNumber>;
    totalPlus: z.ZodDefault<z.ZodNumber>;
    totalMinus: z.ZodDefault<z.ZodNumber>;
    finalScore: z.ZodNumber;
    approvedEntryIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    criteriaRows: z.ZodDefault<z.ZodArray<z.ZodObject<{
        criterionId: z.ZodString;
        criterionCode: z.ZodString;
        criterionName: z.ZodString;
        category: z.ZodEnum<{
            ky_luat: "ky_luat";
            hoc_tap: "hoc_tap";
            ghi_chu: "ghi_chu";
        }>;
        unitType: z.ZodEnum<{
            per_student: "per_student";
            per_occurrence: "per_occurrence";
            per_unit: "per_unit";
        }>;
        unitPoints: z.ZodNumber;
        quantity: z.ZodNumber;
        totalPoints: z.ZodNumber;
        studentNamesText: z.ZodString;
    }, z.core.$strip>>>;
    pendingEntriesCount: z.ZodDefault<z.ZodNumber>;
    unresolvedAppealsCount: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type DisciplineWeeklySnapshot = z.infer<typeof disciplineWeeklySnapshotSchema>;
export declare const disciplineWeeklyApprovalSchema: z.ZodObject<{
    id: z.ZodString;
    weekId: z.ZodString;
    classId: z.ZodString;
    className: z.ZodString;
    schoolYearId: z.ZodString;
    version: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<{
        draft: "draft";
        signed: "signed";
        locked: "locked";
        superseded: "superseded";
    }>>;
    snapshot: z.ZodObject<{
        weekId: z.ZodString;
        weekNumber: z.ZodNumber;
        classId: z.ZodString;
        className: z.ZodString;
        schoolYearId: z.ZodString;
        basePoints: z.ZodDefault<z.ZodNumber>;
        totalPlus: z.ZodDefault<z.ZodNumber>;
        totalMinus: z.ZodDefault<z.ZodNumber>;
        finalScore: z.ZodNumber;
        approvedEntryIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        criteriaRows: z.ZodDefault<z.ZodArray<z.ZodObject<{
            criterionId: z.ZodString;
            criterionCode: z.ZodString;
            criterionName: z.ZodString;
            category: z.ZodEnum<{
                ky_luat: "ky_luat";
                hoc_tap: "hoc_tap";
                ghi_chu: "ghi_chu";
            }>;
            unitType: z.ZodEnum<{
                per_student: "per_student";
                per_occurrence: "per_occurrence";
                per_unit: "per_unit";
            }>;
            unitPoints: z.ZodNumber;
            quantity: z.ZodNumber;
            totalPoints: z.ZodNumber;
            studentNamesText: z.ZodString;
        }, z.core.$strip>>>;
        pendingEntriesCount: z.ZodDefault<z.ZodNumber>;
        unresolvedAppealsCount: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    contentHashSha256: z.ZodString;
    signerUid: z.ZodString;
    signerName: z.ZodString;
    signerEmail: z.ZodString;
    signedAt: z.ZodOptional<z.ZodUnknown>;
    lockedByUid: z.ZodOptional<z.ZodString>;
    lockedByName: z.ZodOptional<z.ZodString>;
    lockedAt: z.ZodOptional<z.ZodUnknown>;
    supersededById: z.ZodOptional<z.ZodString>;
    reopenReason: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type DisciplineWeeklyApproval = z.infer<typeof disciplineWeeklyApprovalSchema>;
export declare const disciplineAuditActionSchema: z.ZodEnum<{
    create_violation: "create_violation";
    review_violation: "review_violation";
    sign_weekly_score: "sign_weekly_score";
    lock_week: "lock_week";
    reopen_week: "reopen_week";
    file_appeal: "file_appeal";
    resolve_appeal: "resolve_appeal";
    assign_role: "assign_role";
    export_excel: "export_excel";
}>;
export type DisciplineAuditAction = z.infer<typeof disciplineAuditActionSchema>;
export declare const disciplineAuditEventSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    actorUid: z.ZodString;
    actorName: z.ZodString;
    action: z.ZodEnum<{
        create_violation: "create_violation";
        review_violation: "review_violation";
        sign_weekly_score: "sign_weekly_score";
        lock_week: "lock_week";
        reopen_week: "reopen_week";
        file_appeal: "file_appeal";
        resolve_appeal: "resolve_appeal";
        assign_role: "assign_role";
        export_excel: "export_excel";
    }>;
    entityType: z.ZodEnum<{
        criteria: "criteria";
        student: "student";
        entry: "entry";
        weekly_approval: "weekly_approval";
        appeal: "appeal";
        assignment: "assignment";
    }>;
    entityId: z.ZodString;
    timestamp: z.ZodOptional<z.ZodUnknown>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    beforeHash: z.ZodOptional<z.ZodString>;
    afterHash: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DisciplineAuditEvent = z.infer<typeof disciplineAuditEventSchema>;
export type ExcelExportStatus = "draft" | "official";
export interface ExcelExportMetadata {
    exportType: ExcelExportStatus;
    watermarkText: string;
    isSignedAndLocked: boolean;
    signerName?: string;
    signedAtFormatted?: string;
    versionLabel: string;
    contentHashSha256?: string;
    hashVerificationNote: string;
}
export declare function getExcelExportMetadata(approval?: DisciplineWeeklyApproval | null): ExcelExportMetadata;
/**
 * Chuẩn hóa đối tượng thành chuỗi JSON duy nhất (Canonical JSON)
 * Sắp xếp toàn bộ keys theo thứ tự alphabet đệ quy để đảm bảo cùng 1 dữ liệu
 * luôn sinh ra chuỗi ký tự giống nhau 100% bất kể thứ tự thuộc tính khi khởi tạo.
 */
export declare function canonicalJsonStringify(data: unknown): string;
/**
 * Tạo mã SHA-256 (64 hex characters) tương thích chuẩn Web Crypto API
 * Hoạt động thống nhất trên Trình duyệt, Cloudflare Workers và Node.js 18+.
 */
export declare function computeSha256(input: string): Promise<string>;
/**
 * Tạo mã băm SHA-256 từ snapshot tổng kết lớp
 */
export declare function computeSnapshotHash(snapshot: DisciplineWeeklySnapshot): Promise<string>;
/**
 * Xác minh tính toàn vẹn của snapshot so với mã băm SHA-256 mong đợi
 */
export declare function verifySnapshotHash(snapshot: DisciplineWeeklySnapshot, expectedHash: string): Promise<{
    isValid: boolean;
    computedHash: string;
}>;
