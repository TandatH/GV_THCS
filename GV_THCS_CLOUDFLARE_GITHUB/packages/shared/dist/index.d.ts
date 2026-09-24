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
}, z.core.$strip>;
export declare const approveLeaveSchema: z.ZodObject<{
    leaveRequestId: z.ZodString;
    decision: z.ZodEnum<{
        tu_choi: "tu_choi";
        da_duyet: "da_duyet";
    }>;
    note: z.ZodOptional<z.ZodString>;
    substituteTeacherId: z.ZodOptional<z.ZodString>;
    substitutions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        scheduleId: z.ZodString;
        substituteTeacherId: z.ZodString;
    }, z.core.$strip>>>;
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
}
export declare function periodsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean;
export declare function scheduleResourceSlotKeys(input: Pick<ScheduleInput, "semesterId" | "weekStart" | "dayOfWeek" | "startPeriod" | "endPeriod" | "classId" | "roomId">, teacherId: string): string[];
export declare function scheduleSlotKeys(input: ScheduleInput): string[];
