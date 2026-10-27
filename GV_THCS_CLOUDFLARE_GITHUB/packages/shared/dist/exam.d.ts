import { z } from "zod";
import type { AuditFields } from "./index.js";
export declare const examSessionStatuses: readonly ["draft", "scheduled", "published", "in_progress", "completed", "locked"];
export type ExamSessionStatus = (typeof examSessionStatuses)[number];
export declare const seatingArrangementTypes: readonly ["by_class", "mixed_grade_abc"];
export type SeatingArrangementType = (typeof seatingArrangementTypes)[number];
export declare const examSupervisorRoles: readonly ["chief", "assistant", "hall"];
export type ExamSupervisorRole = (typeof examSupervisorRoles)[number];
export declare const examCheckinStatuses: readonly ["not_started", "present", "late", "absent"];
export type ExamCheckinStatus = (typeof examCheckinStatuses)[number];
export declare const examSwapStatuses: readonly ["pending", "approved", "rejected", "cancelled"];
export type ExamSwapStatus = (typeof examSwapStatuses)[number];
export declare const examStudentAttendanceStatuses: readonly ["present", "absent_with_reason", "absent_without_reason"];
export type ExamStudentAttendanceStatus = (typeof examStudentAttendanceStatuses)[number];
export declare const examSessionSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    name: z.ZodString;
    schoolYearId: z.ZodString;
    semesterId: z.ZodString;
    schoolLevels: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
    }>>>;
    gradeLevels: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    startDate: z.ZodString;
    endDate: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        draft: "draft";
        scheduled: "scheduled";
        published: "published";
        locked: "locked";
        in_progress: "in_progress";
        completed: "completed";
    }>>;
    seatingArrangementType: z.ZodDefault<z.ZodEnum<{
        by_class: "by_class";
        mixed_grade_abc: "mixed_grade_abc";
    }>>;
    maxStudentsPerRoom: z.ZodDefault<z.ZodNumber>;
    mergeRemainderStudents: z.ZodDefault<z.ZodBoolean>;
    supervisorsPerRoom: z.ZodDefault<z.ZodNumber>;
    description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamSessionInput = z.input<typeof examSessionSchema>;
export interface ExamSession extends z.infer<typeof examSessionSchema>, AuditFields {
    id: string;
    requiresReallocation?: boolean;
    supervisorWarnings?: string[];
    operation?: {
        kind: string;
        status: string;
    };
}
export declare const examSlotSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    name: z.ZodString;
    date: z.ZodString;
    shiftNumber: z.ZodNumber;
    startTime: z.ZodString;
    endTime: z.ZodString;
    durationMinutes: z.ZodNumber;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamSlotInput = z.input<typeof examSlotSchema>;
export interface ExamSlot extends z.infer<typeof examSlotSchema>, AuditFields {
    id: string;
}
export declare const examSubjectSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    subjectId: z.ZodString;
    subjectName: z.ZodString;
    subjectCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    gradeLevel: z.ZodNumber;
    slotId: z.ZodString;
    durationMinutes: z.ZodDefault<z.ZodNumber>;
    paperFormat: z.ZodDefault<z.ZodString>;
    roomTypeRequired: z.ZodDefault<z.ZodString>;
    expectedStudentCount: z.ZodDefault<z.ZodNumber>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamSubjectInput = z.input<typeof examSubjectSchema>;
export interface ExamSubject extends z.infer<typeof examSubjectSchema>, AuditFields {
    id: string;
}
export declare const examRoomSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    slotId: z.ZodString;
    examSubjectId: z.ZodString;
    roomNumber: z.ZodNumber;
    roomCode: z.ZodString;
    physicalRoomId: z.ZodString;
    physicalRoomName: z.ZodString;
    gradeLevel: z.ZodNumber;
    studentCount: z.ZodDefault<z.ZodNumber>;
    supervisorIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hallSupervisorId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        in_progress: "in_progress";
        completed: "completed";
        ready: "ready";
    }>>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamRoomInput = z.input<typeof examRoomSchema>;
export interface ExamRoom extends z.infer<typeof examRoomSchema>, AuditFields {
    id: string;
}
export declare const examStudentAssignmentSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    examRoomId: z.ZodString;
    slotId: z.ZodString;
    examSubjectId: z.ZodString;
    studentId: z.ZodString;
    studentName: z.ZodString;
    studentCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    classId: z.ZodString;
    className: z.ZodString;
    gradeLevel: z.ZodNumber;
    candidateNumber: z.ZodString;
    deskNumber: z.ZodNumber;
    attendance: z.ZodDefault<z.ZodEnum<{
        present: "present";
        absent_with_reason: "absent_with_reason";
        absent_without_reason: "absent_without_reason";
    }>>;
    paperCount: z.ZodDefault<z.ZodNumber>;
    note: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamStudentAssignmentInput = z.input<typeof examStudentAssignmentSchema>;
export interface ExamStudentAssignment extends z.infer<typeof examStudentAssignmentSchema>, AuditFields {
    id: string;
}
export declare const examSupervisorAssignmentSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    slotId: z.ZodString;
    examRoomId: z.ZodString;
    teacherId: z.ZodString;
    teacherName: z.ZodString;
    teacherCode: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    role: z.ZodDefault<z.ZodEnum<{
        chief: "chief";
        assistant: "assistant";
        hall: "hall";
    }>>;
    date: z.ZodString;
    shiftNumber: z.ZodNumber;
    checkinStatus: z.ZodDefault<z.ZodEnum<{
        absent: "absent";
        not_started: "not_started";
        present: "present";
        late: "late";
    }>>;
    payrollRecorded: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamSupervisorAssignmentInput = z.input<typeof examSupervisorAssignmentSchema>;
export interface ExamSupervisorAssignment extends z.infer<typeof examSupervisorAssignmentSchema>, AuditFields {
    id: string;
}
export declare const examSwapRequestSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    requesterTeacherId: z.ZodString;
    requesterTeacherName: z.ZodString;
    requesterAssignmentId: z.ZodString;
    targetTeacherId: z.ZodString;
    targetTeacherName: z.ZodString;
    targetAssignmentId: z.ZodString;
    reason: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        cancelled: "cancelled";
        pending: "pending";
        approved: "approved";
        rejected: "rejected";
    }>>;
    reviewedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    reviewedAt: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    reviewNote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodUnknown>;
    createdBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodUnknown>;
    updatedBy: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ExamSwapRequestInput = z.input<typeof examSwapRequestSchema>;
export interface ExamSwapRequest extends z.infer<typeof examSwapRequestSchema>, AuditFields {
    id: string;
}
/**
 * Định dạng chuẩn Số báo danh (SBD) theo Khối và Số thứ tự
 * Ví dụ: Khối 9, STT 23 -> "09023"
 */
export declare function formatCandidateNumber(gradeLevel: number, orderIndex: number, padLength?: number): string;
/**
 * Phân tích và tách họ tên học sinh Việt Nam để sắp xếp thứ tự ABC chuẩn:
 * Tên -> Họ -> Tên đệm
 */
export declare function parseVietnameseName(fullName: string): {
    firstName: string;
    lastName: string;
    middleName: string;
};
/**
 * Hàm so sánh họ tên học sinh theo chuẩn tiếng Việt (so sánh Tên trước, rồi đến Họ, rồi đến Tên đệm)
 */
export declare function compareVietnameseNames(nameA: string, nameB: string): number;
/** Keep class boundaries when requested; merging above the configured maximum is opt-in. */
export declare function splitExamStudents<T extends {
    classId: string;
}>(students: T[], maxPerRoom: number, byClass?: boolean, mergeRemainder?: boolean): T[][];
/** Exam duties never become teaching periods. Missing rates remain explicit for review. */
export declare function summarizeExamPayroll(teacherId: string, month: string, checkins: Record<string, any>[], rates?: Record<string, unknown>): {
    examDutyCount: number;
    examSupervisionAmount: number;
    requiresExamRateReview: boolean;
};
/**
 * Kiểm tra xung đột điều kiện coi thi của giáo viên:
 * - Không coi thi môn mình đang dạy ở khối đó
 * - Không coi thi lớp mình chủ nhiệm (khi thi theo lớp)
 */
export declare function validateSupervisorEligibility(params: {
    teacherId: string;
    teacherSubjectIds: string[];
    teacherGradeLevels: number[];
    homeroomClassId?: string;
    examSubjectId: string;
    examGradeLevel: number;
    examClassId?: string;
}): {
    eligible: boolean;
    reason?: string;
};
