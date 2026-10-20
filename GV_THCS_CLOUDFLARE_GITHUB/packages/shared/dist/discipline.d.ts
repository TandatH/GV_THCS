import { z } from "zod";
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
        student: "student";
        class: "class";
        both: "both";
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
        discipline_committee: "discipline_committee";
        competition_committee: "competition_committee";
        teacher: "teacher";
        admin: "admin";
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
        student: "student";
        entry: "entry";
        weekly_approval: "weekly_approval";
        appeal: "appeal";
        criteria: "criteria";
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
