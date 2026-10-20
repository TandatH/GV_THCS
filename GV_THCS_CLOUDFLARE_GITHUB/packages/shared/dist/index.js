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
    homeroomDepartmentId: z.string().trim().optional().default(""),
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
    // Chuẩn lưu trữ: endPeriod là mốc sau tiết cuối (tiết 1–2 lưu 1–3).
    periodRangeConvention: z.literal("exclusive").optional(),
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
    teacherId: z.string().trim().nullable().optional(),
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
    substituteSubjectId: z.preprocess((value) => value == null || value === "" ? undefined : value, z.string().optional()),
});
export const approveLeaveSchema = z.object({
    leaveRequestId: z.string().min(1),
    decision: z.enum(["da_duyet", "tu_choi"]),
    note: z.preprocess((value) => value == null || value === "" ? undefined : value, z.string().trim().max(1000).optional()),
    /** Legacy compatibility: apply one substitute to every affected schedule. */
    substituteTeacherId: z.preprocess((value) => value == null || value === "" ? undefined : value, z.string().optional()),
    /** Preferred: one substitute decision per affected schedule. */
    substitutions: z.preprocess((value) => value == null ? undefined : value, z.array(substitutionDecisionSchema).max(50).optional()),
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
export function finiteNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "")
        return fallback;
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}
function id(value) {
    return typeof value === "string" ? value.trim() : "";
}
export function payrollScheduleDate(schedule) {
    if (typeof schedule.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(schedule.date))
        return schedule.date;
    const weekStart = id(schedule.weekStart).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
        return "";
    // Tính ngày bằng UTC để server và trình duyệt không lệch tháng do múi giờ.
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()))
        return "";
    date.setUTCDate(date.getUTCDate() + finiteNumber(schedule.dayOfWeek, 2) - 2);
    return date.toISOString().slice(0, 10);
}
export function resolveSchedulePeriodRange(schedule) {
    const start = finiteNumber(schedule.startPeriod);
    const rawEnd = finiteNumber(schedule.endPeriod);
    const storedCount = finiteNumber(schedule.periodCount);
    const validStart = Number.isInteger(start) && start > 0;
    const validEnd = Number.isInteger(rawEnd) && rawEnd > 0;
    const validStoredCount = Number.isInteger(storedCount) && storedCount > 0;
    // Lịch hiện tại lưu mốc kết thúc loại trừ: chọn tiết 1–2 => start=1, end=3.
    // Chỉ dùng quy ước bao gồm tiết cuối khi có cờ rõ ràng hoặc số tiết lịch cũ xác nhận.
    // Không thể suy ra ý định nhập tay chỉ từ cặp 1,2; mặc định giữ quy ước hệ thống.
    const convention = schedule.periodRangeConvention === "inclusive"
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
export function scheduledPeriodCount(schedule) {
    return resolveSchedulePeriodRange(schedule).count;
}
export function normalizeSchedulePeriodRange(schedule) {
    const range = resolveSchedulePeriodRange(schedule);
    // Chuẩn hóa bản đọc trong bộ nhớ cho lịch/bảng in; không tự ghi đổi dữ liệu Firestore.
    if (range.count <= 0 || range.start === null || range.end === null)
        return schedule;
    return { ...schedule, startPeriod: range.start, endPeriod: range.end,
        periodCount: range.count, periodRangeConvention: "exclusive" };
}
// Một hàm cho cả nhãn tiết và số tiết, tránh giao diện ghi 1 tiết nhưng lương tính 0.
export function formatPeriodDisplay(startOrSchedule, endPeriod, metadata = {}) {
    const schedule = typeof startOrSchedule === "object" && startOrSchedule !== null
        ? startOrSchedule : { ...metadata, startPeriod: startOrSchedule, endPeriod };
    const range = resolveSchedulePeriodRange(schedule);
    const label = range.count > 0 && range.start !== null && range.last !== null
        ? range.start === range.last ? `Tiết ${range.start}` : `Tiết ${range.start}–${range.last}`
        : range.count > 0 ? "Chưa rõ khoảng tiết" : "Khoảng tiết không hợp lệ";
    return { ...range, label, display: `${label} (${range.count} tiết)` };
}
export function payrollSchoolLevel(schedule, classDoc) {
    for (const level of [schedule.schoolLevel, classDoc?.schoolLevel]) {
        if (level === "primary" || level === "PRIMARY")
            return "PRIMARY";
        if (level === "secondary" || level === "SECONDARY")
            return "SECONDARY";
    }
    const grade = finiteNumber(classDoc?.grade ?? classDoc?.gradeLevel);
    if (grade >= 1 && grade <= 5)
        return "PRIMARY";
    if (grade >= 6 && grade <= 9)
        return "SECONDARY";
    const match = String(classDoc?.name || classDoc?.code || schedule.className || "").match(/^([1-9])/);
    return match && Number(match[1]) <= 5 ? "PRIMARY" : "SECONDARY";
}
function updateTime(record) {
    const timestamp = record.updatedAt;
    if (typeof timestamp?.toMillis === "function")
        return timestamp.toMillis();
    return finiteNumber(timestamp?.seconds) * 1000;
}
export function indexMonthlyCheckins(checkins, month) {
    const result = new Map();
    for (const checkin of checkins) {
        const scheduleId = id(checkin.scheduleId);
        if (!scheduleId || checkin.month !== month || checkin.isActive === false)
            continue;
        const previous = result.get(scheduleId);
        // Mỗi lịch chỉ có một bản ghi hiệu lực: ưu tiên bản mới nhất, rồi ID chuẩn.
        const comparison = previous ? updateTime(checkin) - updateTime(previous) : 1;
        const canonicalId = `${month}_${scheduleId}`;
        if (!previous || comparison > 0 || (comparison === 0 && (checkin.id === canonicalId || (previous.id !== canonicalId && id(checkin.id) > id(previous.id)))))
            result.set(scheduleId, checkin);
    }
    return result;
}
export function resolveTeachingAttendance(schedule, checkin, classDoc) {
    const originalTeacherId = id(schedule.originalTeacherId) || id(checkin?.originalTeacherId) || id(schedule.teacherId);
    const assignedTeacherId = id(schedule.actualTeacherId) || id(schedule.effectiveTeacherId) || id(schedule.teacherId);
    const recordedTeacherId = id(checkin?.actualTeacherId) || id(checkin?.effectiveTeacherId) || id(checkin?.teacherId);
    let effectiveTeacherId = recordedTeacherId || assignedTeacherId;
    const scheduledPeriods = scheduledPeriodCount(schedule);
    const periodCount = Math.max(0, finiteNumber(checkin?.periodCount, scheduledPeriods));
    const rawStatus = checkin ? checkin.status : (schedule.attendanceStatus ?? schedule.status);
    let status = "pending";
    if (rawStatus === "confirmed" || rawStatus === "adjusted" || rawStatus === "absent")
        status = rawStatus;
    // Lịch hủy/vắng luôn chặn trả tiền, kể cả còn bản chấm công cũ đã xác nhận.
    if (schedule.status === "absent" || schedule.attendanceStatus === "absent")
        status = "absent";
    if (schedule.status === "cancelled" || schedule.isActive === false)
        status = "cancelled";
    const staleAssignment = checkin && ((id(checkin.assignedTeacherId) && id(checkin.assignedTeacherId) !== assignedTeacherId)
        || (rawStatus === "confirmed" && recordedTeacherId && recordedTeacherId !== assignedTeacherId)
        || (recordedTeacherId === originalTeacherId && assignedTeacherId !== originalTeacherId));
    if (staleAssignment)
        effectiveTeacherId = assignedTeacherId;
    if (status !== "cancelled" && status !== "absent" && (staleAssignment || schedule.teacherUnassigned === true))
        status = "pending";
    const payable = (status === "confirmed" || status === "adjusted") && Boolean(effectiveTeacherId);
    return {
        originalTeacherId,
        effectiveTeacherId,
        isSubstituted: Boolean(originalTeacherId && effectiveTeacherId && originalTeacherId !== effectiveTeacherId),
        originalTeacherAbsent: Boolean(originalTeacherId && ((effectiveTeacherId && originalTeacherId !== effectiveTeacherId) || status === "absent" || schedule.teacherUnassigned === true)),
        status,
        periodCount: scheduledPeriods,
        payablePeriods: payable ? Math.min(scheduledPeriods, periodCount, Math.max(0, finiteNumber(checkin?.payablePeriods, periodCount))) : 0,
        schoolLevel: payrollSchoolLevel(schedule, classDoc),
    };
}
export function teacherAttendanceTotals(teacherId, records) {
    let primaryActual = 0;
    let secondaryActual = 0;
    let substituteCount = 0;
    let absentCount = 0;
    for (const record of records) {
        if (record.status === "cancelled")
            continue;
        // Bù–trừ tuyệt đối: chỉ người thực dạy hưởng tiết; người gốc không được cộng lại.
        if (record.effectiveTeacherId === teacherId) {
            if (record.schoolLevel === "PRIMARY")
                primaryActual += record.payablePeriods;
            else
                secondaryActual += record.payablePeriods;
            if (record.isSubstituted)
                substituteCount += record.payablePeriods;
        }
        // Người gốc được ghi nhận vắng khi bàn giao; người thay vắng cũng không hưởng tiền.
        if ((record.originalTeacherId === teacherId && record.originalTeacherAbsent)
            || (record.effectiveTeacherId === teacherId && record.status === "absent"))
            absentCount += record.periodCount;
    }
    return { primaryActual, secondaryActual, actualPeriods: primaryActual + secondaryActual, substituteCount, absentCount };
}
export function teacherPayrollAmounts(teacher, totals, payroll = {}, settings = {}) {
    const primaryRate = Math.max(0, finiteNumber(payroll.overridePrimaryRate, finiteNumber(teacher.primaryRatePerPeriod, finiteNumber(teacher.ratePerPeriod, finiteNumber(settings.primaryDefaultRate, 120000)))));
    const secondaryRate = Math.max(0, finiteNumber(payroll.overrideSecondaryRate, finiteNumber(teacher.secondaryRatePerPeriod, finiteNumber(teacher.ratePerPeriod, finiteNumber(settings.secondaryDefaultRate, 150000)))));
    // Có tiết có tiền cho cả cơ hữu và thỉnh giảng. Định mức chỉ dùng để đối chiếu.
    // Không dùng override số tiết hoặc amount cũ để hồi sinh tiết đã vắng/chuyển người.
    const primaryAmount = totals.primaryActual * primaryRate;
    const secondaryAmount = totals.secondaryActual * secondaryRate;
    const adjustmentAmount = finiteNumber(payroll.adjustmentAmount);
    return { primaryRate, secondaryRate, primaryAmount, secondaryAmount, adjustmentAmount,
        totalAmount: primaryAmount + secondaryAmount + adjustmentAmount };
}
export function teacherPayrollStandards(teacher, primaryActual, secondaryActual, weeks = 4) {
    const levels = Array.isArray(teacher.schoolLevels) ? teacher.schoolLevels : [teacher.schoolLevel];
    const both = levels.includes("all") || levels.includes("both")
        || (levels.includes("primary") && levels.includes("secondary")) || (primaryActual > 0 && secondaryActual > 0);
    const primary = levels.includes("primary") || (primaryActual > 0 && secondaryActual === 0);
    let primaryStandard = null;
    let secondaryStandard = null;
    if (teacher.teacherType !== "thinh_giang") {
        const weekly = Math.max(0, finiteNumber(teacher.standardPeriodsPerWeek, primary || both ? 20 : 19));
        const standard = Math.round(weekly * weeks * 100) / 100;
        if (both) {
            primaryStandard = Math.round(standard / 2 * 100) / 100;
            secondaryStandard = standard - primaryStandard;
        }
        else if (primary)
            primaryStandard = standard;
        else
            secondaryStandard = standard;
    }
    return { primaryStandard, secondaryStandard,
        standardPeriods: primaryStandard === null && secondaryStandard === null ? null : (primaryStandard ?? 0) + (secondaryStandard ?? 0),
        overtimePeriods: (primaryStandard === null ? 0 : Math.max(0, primaryActual - primaryStandard))
            + (secondaryStandard === null ? 0 : Math.max(0, secondaryActual - secondaryStandard)) };
}
export function summarizePayrollRows(rows) {
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
        if (row.status === "draft" || row.status === "pending_approval")
            total.pendingApprovalTeachers += 1;
        if (["approved", "locked", "paid"].includes(row.status))
            total.approvedTeachers += 1;
        if (row.status === "review_required")
            total.reviewRequiredTeachers += 1;
        return total;
    }, { totalTeachers: 0, primaryPeriods: 0, secondaryPeriods: 0, totalPeriods: 0, substitutePeriods: 0,
        absentPeriods: 0, pendingPastPeriods: 0, totalEstimatedPayroll: 0, pendingApprovalTeachers: 0,
        approvedTeachers: 0, reviewRequiredTeachers: 0 });
}
// ==========================================
// MODULE KỶ LUẬT & THI ĐUA (DISCIPLINE)
// ==========================================
export * from "./discipline.js";
