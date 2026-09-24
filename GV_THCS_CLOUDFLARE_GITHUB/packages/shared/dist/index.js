import { z } from "zod";
export const roles = ["admin", "bgh", "totruong", "giaovien"];
export const teacherTypes = ["co_huu", "thinh_giang"];
export const activityStatuses = ["active", "inactive"];
export const schoolLevels = ["primary", "secondary"];
export const teachingRoles = ["chu_nhiem", "bo_mon", "ca_hai"];
export const bghPositions = ["hieutruong", "phohieutruong"];
export const roleSchema = z.enum(roles);
export const teacherTypeSchema = z.enum(teacherTypes);
export const schoolLevelSchema = z.enum(schoolLevels);
export const teachingRoleSchema = z.enum(teachingRoles);
export const bghPositionSchema = z.enum(bghPositions);
export const teachingAssignmentSchema = z.object({
    subjectId: z.string().trim().min(1),
    gradeLevels: z.array(z.number().int().min(1).max(9)).min(1, "Chọn ít nhất một khối").max(9),
});
const optionalText = z.string().trim().max(500).optional().default("");
export const teacherSchema = z.object({
    id: z.string().optional(),
    teacherCode: z.string().trim().max(30).optional().default(""),
    userId: z.string().trim().optional().default(""),
    fullName: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120),
    email: z.email("Email không hợp lệ"),
    phone: z.string().trim().regex(/^[0-9+ ()-]{8,20}$/, "Số điện thoại không hợp lệ"),
    departmentId: z.string().trim().min(1, "Vui lòng chọn bộ môn"),
    subjectIds: z.array(z.string()).min(1, "Chọn ít nhất một môn"),
    schoolLevels: z.array(schoolLevelSchema).min(1, "Chọn ít nhất một cấp học").max(2).default(["secondary"]),
    teachingRole: teachingRoleSchema.default("bo_mon"),
    teachingAssignments: z.array(teachingAssignmentSchema).max(100).default([]),
    specialization: z.string().trim().min(2).max(200),
    degree: z.string().trim().min(2).max(100),
    startDate: z.string().date(),
    teacherType: teacherTypeSchema,
    standardPeriodsPerWeek: z.number().int().min(0).max(60).nullable(),
    ratePerPeriod: z.number().min(0).nullable(),
    campusId: z.string().trim().min(1),
    status: z.enum(activityStatuses),
    avatarUrl: z.url().or(z.literal("")).default(""),
    contract: z.object({ type: optionalText, number: optionalText, expiresAt: z.string().optional().default("") }),
}).superRefine((value, ctx) => {
    if (value.teacherType === "co_huu" && !value.standardPeriodsPerWeek) {
        ctx.addIssue({ code: "custom", path: ["standardPeriodsPerWeek"], message: "Giáo viên cơ hữu cần số tiết chuẩn" });
    }
    if (value.teacherType === "thinh_giang" && !value.ratePerPeriod) {
        ctx.addIssue({ code: "custom", path: ["ratePerPeriod"], message: "Giáo viên thỉnh giảng cần đơn giá" });
    }
    const assignmentSubjectIds = new Set();
    for (const assignment of value.teachingAssignments) {
        if (assignmentSubjectIds.has(assignment.subjectId)) {
            ctx.addIssue({ code: "custom", path: ["teachingAssignments"], message: "Mỗi môn chỉ nên có một dòng phân công khối." });
            continue;
        }
        assignmentSubjectIds.add(assignment.subjectId);
        if (!value.subjectIds.includes(assignment.subjectId)) {
            ctx.addIssue({ code: "custom", path: ["teachingAssignments"], message: "Phân công khối chứa môn chưa được chọn." });
        }
        for (const grade of assignment.gradeLevels) {
            const level = grade <= 5 ? "primary" : "secondary";
            if (!value.schoolLevels.includes(level)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["teachingAssignments"],
                    message: `Khối ${grade} không thuộc cấp học giáo viên đang phụ trách.`,
                });
            }
        }
    }
    for (const subjectId of value.subjectIds) {
        if (!assignmentSubjectIds.has(subjectId)) {
            ctx.addIssue({ code: "custom", path: ["teachingAssignments"], message: "Mỗi môn đã chọn cần có ít nhất một khối giảng dạy." });
        }
    }
});
export const catalogCollections = ["schoolYears", "departments", "subjects", "classes", "rooms", "campuses", "semesters", "timeSlots"];
export const catalogSchema = z.object({
    code: z.string().trim().min(1).max(30).transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2).max(150),
    schoolYearId: z.string().trim().optional().default(""),
    departmentId: z.string().trim().optional().default(""),
    campusId: z.string().trim().optional().default(""),
    isActive: z.boolean().default(true),
});
export const availabilitySchema = z.object({
    teacherId: z.string().min(1),
    teacherType: z.literal("thinh_giang").optional(),
    semesterId: z.string().min(1),
    schoolYearId: z.string().optional().default(""),
    slots: z.array(z.string().regex(/^[2-7]:[1-9][0-9]?$/)).max(100),
    approvedSlots: z.array(z.string().regex(/^[2-7]:[1-9][0-9]?$/)).max(100).optional(),
    status: z.enum(["draft", "submitted"]),
});
export const scheduleSchema = z.object({
    id: z.string().optional(),
    teacherId: z.string().min(1),
    subjectId: z.string().min(1),
    classId: z.string().min(1),
    roomId: z.string().min(1),
    campusId: z.string().min(1),
    departmentId: z.string().min(1),
    semesterId: z.string().min(1),
    schoolYearId: z.string().optional().default(""),
    weekStart: z.string().date(),
    dayOfWeek: z.number().int().min(2).max(7),
    startPeriod: z.number().int().min(1).max(20),
    endPeriod: z.number().int().min(2).max(21),
    status: z.enum(["scheduled", "needs_attention", "cancelled"]).default("scheduled"),
    confirmationDeadline: z.string().datetime().nullish(),
    cancellationReason: z.string().trim().max(500).optional().default(""),
}).refine((v) => v.startPeriod < v.endPeriod, { path: ["endPeriod"], message: "Tiết kết thúc phải lớn hơn tiết bắt đầu" });
export const setUserRoleSchema = z.object({
    uid: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    role: roleSchema,
    departmentId: z.string().trim().optional(),
    bghPosition: bghPositionSchema.optional(),
    schoolLevel: z.enum(["primary", "secondary", "all"]).optional(),
}).refine((value) => Boolean(value.uid || value.email), {
    message: "Cần cung cấp UID hoặc email người dùng.",
    path: ["email"],
});
export const scheduleResponseSchema = z.object({
    scheduleId: z.string().min(1),
    response: z.enum(["xac_nhan", "tu_choi"]),
    reason: z.preprocess((value) => value == null || value === "" ? undefined : value, z.string().trim().max(500).optional()),
});
export const leaveRequestSchema = z.object({
    teacherId: z.string().min(1),
    scheduleIds: z.array(z.string().min(1)).min(1),
    reason: z.string().trim().min(5).max(1000),
    attachmentPaths: z.array(z.string()).max(5).default([]),
    status: z.enum(["nhap", "cho_duyet"]).default("nhap"),
});
export const substitutionDecisionSchema = z.object({
    scheduleId: z.string().min(1),
    substituteTeacherId: z.string().min(1),
});
export const approveLeaveSchema = z.object({
    leaveRequestId: z.string().min(1),
    decision: z.enum(["da_duyet", "tu_choi"]),
    note: z.string().trim().max(1000).optional(),
    /** Legacy compatibility: apply one substitute to every affected schedule. */
    substituteTeacherId: z.string().optional(),
    /** Preferred: one substitute decision per affected schedule. */
    substitutions: z.array(substitutionDecisionSchema).max(50).optional(),
}).superRefine((value, ctx) => {
    if (value.decision === "da_duyet" && !value.substituteTeacherId && (!value.substitutions || value.substitutions.length === 0)) {
        ctx.addIssue({ code: "custom", path: ["substitutions"], message: "Cần chọn giáo viên dạy thay trước khi duyệt" });
    }
});
export const payrollSchema = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    schoolYearId: z.string().trim().optional().default(""),
    teachingWeeks: z.number().min(0).max(6).optional(),
});
export const suggestionSchema = z.object({ scheduleId: z.string().min(1) });
export const evaluationSchema = z.object({ id: z.string().optional(), teacherId: z.string().min(1), periodId: z.string().min(1), criteria: z.array(z.object({ name: z.string().trim().min(2).max(100), score: z.number().min(0).max(10), weight: z.number().min(1).max(100) })).min(1).max(20), notes: z.string().trim().max(2000).default(""), status: z.enum(["draft", "published"]) });
export const attendanceSchema = z.object({
    scheduleId: z.string().min(1),
    status: z.enum(["confirmed", "absent", "adjusted"]),
    actualTeacherId: z.string().min(1).optional(),
    periodCount: z.number().int().min(0).max(20).optional(),
    payablePeriods: z.number().int().min(0).max(20).optional(),
    payable: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
});
export function periodsOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}
export function scheduleResourceSlotKeys(input, teacherId) {
    const keys = [];
    for (let period = input.startPeriod; period < input.endPeriod; period += 1) {
        const base = `${input.semesterId}_${input.weekStart}_${input.dayOfWeek}_${period}`;
        if (teacherId)
            keys.push(`teacher_${teacherId}_${base}`);
        keys.push(`class_${input.classId}_${base}`, `room_${input.roomId}_${base}`);
    }
    return keys;
}
export function scheduleSlotKeys(input) {
    return scheduleResourceSlotKeys(input, input.teacherId);
}
