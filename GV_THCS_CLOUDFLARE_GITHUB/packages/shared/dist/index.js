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
// ============================================================================
// 1. CÁC HẰNG SỐ & ENUM CƠ BẢN
// ============================================================================
export const disciplineCategories = ["ky_luat", "hoc_tap", "ghi_chu"];
export const disciplineCategoryLabels = {
    ky_luat: "Kỷ luật",
    hoc_tap: "Học tập",
    ghi_chu: "Ghi chú",
};
export const disciplineUnitTypes = ["per_student", "per_occurrence", "per_unit"];
export const disciplineUnitTypeLabels = {
    per_student: "/ mỗi bạn",
    per_occurrence: "/ lần",
    per_unit: "/ cái",
};
export const disciplineEntryStatuses = ["pending", "approved", "returned", "rejected", "voided"];
export const disciplineEntryStatusLabels = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    returned: "Trả lại",
    rejected: "Từ chối",
    voided: "Đã hủy",
};
export const disciplineApprovalStatuses = ["draft", "signed", "locked", "superseded"];
export const disciplineApprovalStatusLabels = {
    draft: "Bản nháp",
    signed: "Đã ký xác nhận",
    locked: "Đã khóa sổ",
    superseded: "Đã thay thế",
};
export const DEFAULT_WEEKLY_BASE_SCORE = 600;
export const disciplineRoleTypes = [
    "discipline_committee",
    "competition_committee",
    "discipline_head",
    "competition_head",
    "discipline_and_competition_head",
];
export const disciplineRoleTypeLabels = {
    discipline_committee: "Ban Kỷ luật (Ghi nhận vi phạm)",
    competition_committee: "Ban Thi đua (Duyệt & Tổng kết)",
    discipline_head: "Trưởng ban Kỷ luật (Cài đặt & Quản trị kỷ luật)",
    competition_head: "Trưởng ban Thi đua (Cài đặt & Quản trị thi đua)",
    discipline_and_competition_head: "Trưởng ban Kỷ luật & Thi đua (Toàn quyền điều hành)",
};
export const disciplineAppealStatuses = ["pending", "approved", "rejected"];
export const studentStatuses = ["studying", "transferred", "graduated", "suspended"];
// ============================================================================
// 2. SCHEMA & TYPES: HỌC SINH (STUDENT)
// ============================================================================
export const studentSchema = z.object({
    id: z.string().optional(),
    studentCode: z.string().trim().min(1, "Mã học sinh không được để trống").max(30).transform((v) => v.toUpperCase()),
    fullName: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120),
    classId: z.string().trim().min(1, "Vui lòng chọn lớp"),
    className: z.string().trim().min(1, "Tên lớp không được để trống"),
    schoolYearId: z.string().trim().min(1, "Vui lòng chọn năm học"),
    gender: z.enum(["male", "female"]),
    dateOfBirth: z.string().date().optional().or(z.literal("")),
    status: z.enum(studentStatuses).default("studying"),
    parentPhone: z.string().trim().regex(/^[0-9+ ()-]{8,20}$/, "Số điện thoại không hợp lệ").optional().or(z.literal("")),
    parentName: z.string().trim().max(120).optional().default(""),
});
// ============================================================================
// 3. SCHEMA & TYPES: TIÊU CHÍ THI ĐUA (DISCIPLINE CRITERION)
// ============================================================================
export const disciplineCriterionSchema = z.object({
    id: z.string().optional(),
    code: z.string().trim().min(1, "Mã tiêu chí không được để trống").max(30).transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2, "Tên tiêu chí phải có ít nhất 2 ký tự").max(250),
    category: z.enum(disciplineCategories),
    unitType: z.enum(disciplineUnitTypes),
    type: z.enum(["minus", "plus"]),
    defaultPoints: z.number().int(),
    displayUnitText: z.string().trim().max(50),
    scope: z.enum(["student", "class", "both"]).default("both"),
    applicableGrades: z.array(z.number().int().min(1).max(9)).default([6, 7, 8, 9]),
    description: z.string().trim().max(500).optional().default(""),
    displayOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
});
export const DEFAULT_DISCIPLINE_CRITERIA = [
    // --- NHÓM 1: KỶ LUẬT (19 tiêu chí) ---
    {
        code: "KL-01",
        name: "Đồng phục (áo, quần, giày – đen, cặp)",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 1,
        isActive: true,
    },
    {
        code: "KL-02",
        name: "Nói chuyện, làm việc riêng trong lớp",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 2,
        isActive: true,
    },
    {
        code: "KL-03",
        name: "Ra ngoài quá 2 lần/buổi",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 3,
        isActive: true,
    },
    {
        code: "KL-04",
        name: "Ồn ào khi không có thầy cô",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 4,
        isActive: true,
    },
    {
        code: "KL-05",
        name: "Đi lấy nước ngoài giờ quy định",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 5,
        isActive: true,
    },
    {
        code: "KL-06",
        name: "Đi trễ",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -20,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 6,
        isActive: true,
    },
    {
        code: "KL-07",
        name: "Xếp hàng chậm và nói chuyện",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -20,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 7,
        isActive: true,
    },
    {
        code: "KL-08",
        name: "Đổi chỗ",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 8,
        isActive: true,
    },
    {
        code: "KL-09",
        name: "Di chuyển lên cầu thang: ồn ào trên đường di chuyển từ cầu thang về lớp",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 9,
        isActive: true,
    },
    {
        code: "KL-10",
        name: "Chửi thề",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -20,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 10,
        isActive: true,
    },
    {
        code: "KL-11",
        name: "Trốn học – cúp tiết",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -30,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 11,
        isActive: true,
    },
    {
        code: "KL-12",
        name: "Hành vi không lịch sự",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 12,
        isActive: true,
    },
    {
        code: "KL-13",
        name: "Vi phạm kỷ luật nặng như: đánh nhau, hút thuốc, ăn cắp",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -50,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 13,
        isActive: true,
    },
    {
        code: "KL-14",
        name: "Thiệt hại tài sản nhà trường",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -30,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 14,
        isActive: true,
    },
    {
        code: "KL-15",
        name: "Tụ tập trước cổng trường",
        category: "ky_luat",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 15,
        isActive: true,
    },
    {
        code: "KL-16",
        name: "Không cất đồ chơi",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -50,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 16,
        isActive: true,
    },
    {
        code: "KL-17",
        name: "Làm bẩn lớp, vứt rác",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 17,
        isActive: true,
    },
    {
        code: "KL-18",
        name: "Xếp dép lộn xộn",
        category: "ky_luat",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 18,
        isActive: true,
    },
    {
        code: "KL-19",
        name: "Không tắt đèn quạt khi ra ngoài",
        category: "ky_luat",
        unitType: "per_unit",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ cái",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 19,
        isActive: true,
    },
    // --- NHÓM 2: HỌC TẬP (11 tiêu chí) ---
    {
        code: "HT-01",
        name: "Không chép bài/không mang sách, vở,...",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6],
        displayOrder: 20,
        isActive: true,
    },
    {
        code: "HT-02",
        name: "Không chép bài/không mang sách, vở, không làm bài, thuộc bài,....",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [7, 8, 9],
        displayOrder: 21,
        isActive: true,
    },
    {
        code: "HT-03",
        name: "Chưa chuẩn bị lớp",
        category: "hoc_tap",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 22,
        isActive: true,
    },
    {
        code: "HT-04",
        name: "Sử dụng tài liệu khi làm bài kiểm tra",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -50,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 23,
        isActive: true,
    },
    {
        code: "HT-05",
        name: "Chép bài của nhau",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 24,
        isActive: true,
    },
    {
        code: "HT-06",
        name: "Hành lang có rác",
        category: "hoc_tap",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -5,
        displayUnitText: "/ lần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 25,
        isActive: true,
    },
    {
        code: "HT-07",
        name: "Không thuộc bài/không làm bài",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 26,
        isActive: true,
    },
    {
        code: "HT-08",
        name: "Vô lễ với thầy cô",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -50,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 27,
        isActive: true,
    },
    {
        code: "HT-09",
        name: "Bị phạt ra khỏi lớp",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 28,
        isActive: true,
    },
    {
        code: "HT-10",
        name: "Điểm dưới 5",
        category: "hoc_tap",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 29,
        isActive: true,
    },
    {
        code: "HT-11",
        name: "Điểm tốt (8, 9, 10, điểm cộng trong sổ đầu bài)",
        category: "hoc_tap",
        unitType: "per_occurrence",
        type: "plus",
        defaultPoints: 10,
        displayUnitText: "/ lượt",
        scope: "both",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 30,
        isActive: true,
    },
    // --- NHÓM 3: GHI CHÚ / NỀ NẾP KHÁC (3 tiêu chí) ---
    {
        code: "GC-01",
        name: "Số buổi vắng ít nhất",
        category: "ghi_chu",
        unitType: "per_occurrence",
        type: "plus",
        defaultPoints: 20,
        displayUnitText: "/ tuần",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 31,
        isActive: true,
    },
    {
        code: "GC-02",
        name: "Nghỉ học không phép",
        category: "ghi_chu",
        unitType: "per_student",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ mỗi bạn",
        scope: "student",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 32,
        isActive: true,
    },
    {
        code: "GC-03",
        name: "GV không ký tên hoặc không chấm điểm tiết dạy",
        category: "ghi_chu",
        unitType: "per_occurrence",
        type: "minus",
        defaultPoints: -10,
        displayUnitText: "/ tiết",
        scope: "class",
        applicableGrades: [6, 7, 8, 9],
        displayOrder: 33,
        isActive: true,
    },
];
// ============================================================================
// 5. SCHEMA & TYPES: PHÂN CÔNG NHIỆM VỤ (ASSIGNMENT)
// ============================================================================
export const disciplineAssignmentSchema = z.object({
    id: z.string().optional(),
    userUid: z.string().trim().min(1, "UID người dùng không được để trống"),
    userEmail: z.string().trim().email("Email không hợp lệ"),
    userFullName: z.string().trim().min(2, "Họ tên không được để trống"),
    roleType: z.enum(disciplineRoleTypes),
    assignedClassIds: z.array(z.string().trim()).default([]), // rỗng = toàn trường
    schoolYearId: z.string().trim().min(1, "Năm học không được để trống"),
    isSaoDo: z.boolean().optional(),
    studentClassId: z.string().trim().optional().nullable(),
    studentClassName: z.string().trim().optional(),
    isActive: z.boolean().default(true),
});
// ============================================================================
// 5.1. SCHEMA & TYPES: QUẢN LÝ TÀI KHOẢN SAO ĐỎ (ĐỘI CÁN SỰ SAO ĐỎ)
// ============================================================================
export const createSaoDoAccountSchema = z.object({
    fullName: z.string().trim().min(2, "Họ và tên học sinh phải có ít nhất 2 ký tự").max(120),
    username: z
        .string()
        .trim()
        .min(3, "Tên đăng nhập phải có ít nhất 3 ký tự")
        .max(50)
        .regex(/^[a-zA-Z0-9._@-]+$/, "Tên đăng nhập chỉ gồm chữ cái không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang"),
    password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(128).optional(),
    studentClassId: z.string().trim().optional().nullable(),
    studentClassName: z.string().trim().optional(),
    assignedClassIds: z.array(z.string().trim()).default([]),
    schoolYearId: z.string().trim().min(1, "Năm học không được để trống"),
    note: z.string().trim().max(500).optional(),
});
export const updateSaoDoAccountSchema = z.object({
    uid: z.string().trim().min(1, "UID không được để trống"),
    fullName: z.string().trim().min(2, "Họ và tên phải có ít nhất 2 ký tự").max(120).optional(),
    studentClassId: z.string().trim().optional().nullable(),
    studentClassName: z.string().trim().optional(),
    assignedClassIds: z.array(z.string().trim()),
    schoolYearId: z.string().trim().min(1, "Năm học không được để trống"),
    isActive: z.boolean().optional(),
    note: z.string().trim().max(500).optional(),
});
export const resetSaoDoPasswordSchema = z.object({
    uid: z.string().trim().min(1, "UID không được để trống"),
    password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(128).optional(),
});
export const deleteSaoDoAccountSchema = z.object({
    uid: z.string().trim().min(1, "UID không được để trống"),
});
// Bổ sung Yêu cầu 1: Phân công người tổng kết ký xác nhận theo từng lớp và từng tuần
export const disciplineWeeklySignerAssignmentSchema = z.object({
    id: z.string().optional(), // `${weekId}_${classId}`
    weekId: z.string().trim().min(1, "Tuần thi đua không được để trống"),
    weekNumber: z.number().int().min(1).max(52),
    classId: z.string().trim().min(1, "Lớp học không được để trống"),
    className: z.string().trim().min(1),
    schoolYearId: z.string().trim().min(1),
    assignedSignerUid: z.string().trim().min(1, "UID người ký không được để trống"),
    assignedSignerName: z.string().trim().min(2, "Tên người ký không được để trống"),
    assignedSignerEmail: z.string().trim().email("Email không hợp lệ"),
    notes: z.string().trim().max(500).optional().default(""),
    isActive: z.boolean().default(true),
});
// ============================================================================
// 6. SCHEMA & TYPES: PHIẾU GHI NHẬN VI PHẠM (DISCIPLINE ENTRY)
// ============================================================================
export const disciplineEntrySchema = z.object({
    id: z.string().optional(),
    weekId: z.string().trim().min(1, "Vui lòng chọn tuần"),
    schoolYearId: z.string().trim().min(1, "Vui lòng chọn năm học"),
    classId: z.string().trim().min(1, "Vui lòng chọn lớp"),
    className: z.string().trim().min(1),
    criterionId: z.string().trim().min(1, "Vui lòng chọn tiêu chí"),
    criterionCode: z.string().trim().min(1),
    criterionName: z.string().trim().min(1),
    category: z.enum(disciplineCategories),
    unitType: z.enum(disciplineUnitTypes),
    unitPoints: z.number().int(),
    quantity: z.number().int().min(1, "Số lượng/số lần phải lớn hơn hoặc bằng 1").default(1),
    totalPoints: z.number().int(),
    scope: z.enum(["student", "class"]),
    studentIds: z.array(z.string().trim()).default([]),
    studentNamesText: z.string().trim().default(""),
    occurredDate: z.string().date("Ngày vi phạm không đúng định dạng YYYY-MM-DD"),
    period: z.number().int().min(1).max(10).optional(),
    note: z.string().trim().max(1000).optional().default(""),
    attachmentUrls: z.array(z.string()).max(10).default([]),
    status: z.enum(disciplineEntryStatuses).default("pending"),
    reportedByUid: z.string().trim().min(1),
    reportedByName: z.string().trim().min(1),
    reporterRole: z.enum(["discipline_committee", "competition_committee", "teacher", "admin"]),
    reviewedByUid: z.string().trim().optional(),
    reviewedByName: z.string().trim().optional(),
    reviewedAt: z.unknown().optional(),
    reviewNote: z.string().trim().max(500).optional().default(""),
});
// Bổ sung Yêu cầu 2: Ràng buộc duyệt - Chặn người ghi nhận tự duyệt phiếu của chính mình
export const reviewDisciplineEntrySchema = z.object({
    entryId: z.string().trim().min(1, "Mã phiếu vi phạm không được để trống"),
    decision: z.enum(["approved", "returned", "rejected"]),
    reviewerUid: z.string().trim().min(1, "UID người duyệt không được để trống"),
    reviewerName: z.string().trim().min(1, "Tên người duyệt không được để trống"),
    reportedByUid: z.string().trim().min(1, "UID người lập phiếu không được để trống"),
    reviewNote: z.string().trim().max(500).optional().default(""),
}).superRefine((data, ctx) => {
    if (data.reviewerUid === data.reportedByUid) {
        ctx.addIssue({
            code: "custom",
            path: ["reviewerUid"],
            message: "Người ghi nhận không được phép tự duyệt phiếu vi phạm của chính mình (No Self-Approval).",
        });
    }
});
// Helper kiểm tra thẩm quyền duyệt
export function canReviewDisciplineEntry(reportedByUid, reviewerUid) {
    if (!reportedByUid || !reviewerUid)
        return false;
    return reportedByUid !== reviewerUid;
}
// ============================================================================
// 7. SCHEMA & TYPES: KHIẾU NẠI CỦA GVCN (APPEAL)
// ============================================================================
export const disciplineAppealSchema = z.object({
    id: z.string().optional(),
    entryId: z.string().trim().min(1, "Vui lòng chọn phiếu vi phạm khiếu nại"),
    classId: z.string().trim().min(1),
    className: z.string().trim().min(1),
    teacherId: z.string().trim().min(1),
    teacherName: z.string().trim().min(2),
    reason: z.string().trim().min(5, "Lý do khiếu nại phải có ít nhất 5 ký tự").max(1000),
    evidenceUrls: z.array(z.string()).max(5).default([]),
    status: z.enum(disciplineAppealStatuses).default("pending"),
    resolutionNote: z.string().trim().max(500).optional().default(""),
    resolvedByUid: z.string().trim().optional(),
    resolvedByName: z.string().trim().optional(),
    resolvedAt: z.unknown().optional(),
});
// ============================================================================
// 8. SCHEMA & TYPES: BẢN SNAPSHOT & KÝ XÁC NHẬN (WEEKLY APPROVAL & SIGNATURE)
// ============================================================================
export const disciplineWeeklySnapshotCriteriaRowSchema = z.object({
    criterionId: z.string(),
    criterionCode: z.string(),
    criterionName: z.string(),
    category: z.enum(disciplineCategories),
    unitType: z.enum(disciplineUnitTypes),
    unitPoints: z.number().int(),
    quantity: z.number().int().min(0),
    totalPoints: z.number().int(),
    studentNamesText: z.string(),
});
export const disciplineWeeklySnapshotSchema = z.object({
    weekId: z.string().trim().min(1),
    weekNumber: z.number().int().min(1).max(52),
    classId: z.string().trim().min(1),
    className: z.string().trim().min(1),
    schoolYearId: z.string().trim().min(1),
    basePoints: z.number().int().default(100),
    totalPlus: z.number().int().min(0).default(0),
    totalMinus: z.number().int().min(0).default(0), // Lưu giá trị dương tuyệt đối
    finalScore: z.number().int(),
    approvedEntryIds: z.array(z.string()).default([]),
    criteriaRows: z.array(disciplineWeeklySnapshotCriteriaRowSchema).default([]),
    pendingEntriesCount: z.number().int().default(0),
    unresolvedAppealsCount: z.number().int().default(0),
});
export const disciplineWeeklyApprovalSchema = z.object({
    id: z.string(), // `${weekId}_${classId}_v${version}`
    weekId: z.string().trim().min(1),
    classId: z.string().trim().min(1),
    className: z.string().trim().min(1),
    schoolYearId: z.string().trim().min(1),
    version: z.number().int().min(1).default(1),
    status: z.enum(disciplineApprovalStatuses).default("draft"),
    snapshot: disciplineWeeklySnapshotSchema,
    contentHashSha256: z.string().trim().length(64, "Mã băm SHA-256 phải đúng 64 ký tự hex"),
    signerUid: z.string().trim().min(1),
    signerName: z.string().trim().min(1),
    signerEmail: z.string().trim().email(),
    signedAt: z.unknown().optional(),
    lockedByUid: z.string().trim().optional(),
    lockedByName: z.string().trim().optional(),
    lockedAt: z.unknown().optional(),
    supersededById: z.string().trim().optional(),
    reopenReason: z.string().trim().max(1000).optional(),
    createdAt: z.unknown().optional(),
});
// ============================================================================
// 9. SCHEMA & TYPES: NHẬT KÝ KIỂM TOÁN (AUDIT TRAIL)
// ============================================================================
export const disciplineAuditActionSchema = z.enum([
    "create_violation",
    "review_violation",
    "sign_weekly_score",
    "lock_week",
    "reopen_week",
    "file_appeal",
    "resolve_appeal",
    "assign_role",
    "export_excel",
]);
export const disciplineAuditEventSchema = z.object({
    id: z.string().optional(),
    actorUid: z.string().trim().min(1),
    actorName: z.string().trim().min(1),
    action: disciplineAuditActionSchema,
    entityType: z.enum(["entry", "weekly_approval", "appeal", "criteria", "student", "assignment"]),
    entityId: z.string().trim().min(1),
    timestamp: z.unknown().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    beforeHash: z.string().optional(),
    afterHash: z.string().optional(),
    reason: z.string().trim().max(1000).optional(),
});
export function getExcelExportMetadata(approval) {
    if (approval && approval.status === "locked") {
        return {
            exportType: "official",
            watermarkText: "BẢN CHÍNH THỨC — ĐÃ KÝ & ĐÃ KHÓA SỔ",
            isSignedAndLocked: true,
            signerName: approval.signerName,
            signedAtFormatted: approval.signedAt ? String(approval.signedAt) : "",
            versionLabel: `Phiên bản v${approval.version}`,
            contentHashSha256: approval.contentHashSha256,
            hashVerificationNote: "Bản chính thức có mã SHA-256 bảo chứng tính toàn vẹn. Đối chiếu trực tiếp với máy chủ.",
        };
    }
    return {
        exportType: "draft",
        watermarkText: "BẢN TẠM TÍNH — CHƯA XÁC NHẬN CHÍNH THỨC",
        isSignedAndLocked: false,
        versionLabel: approval ? `Bản nháp v${approval.version}` : "Bản nháp tạm tính",
        contentHashSha256: approval?.contentHashSha256,
        hashVerificationNote: "Bản tạm tính dùng để đối soát nội bộ. Không có giá trị tổng kết chính thức.",
    };
}
// ============================================================================
// 11. CANONICAL SERIALIZATION & HASHING HELPER (YÊU CẦU 3 & 4)
// ============================================================================
/**
 * Chuẩn hóa đối tượng thành chuỗi JSON duy nhất (Canonical JSON)
 * Sắp xếp toàn bộ keys theo thứ tự alphabet đệ quy để đảm bảo cùng 1 dữ liệu
 * luôn sinh ra chuỗi ký tự giống nhau 100% bất kể thứ tự thuộc tính khi khởi tạo.
 */
export function canonicalJsonStringify(data) {
    if (data === null || data === undefined)
        return "null";
    if (typeof data !== "object")
        return JSON.stringify(data);
    if (Array.isArray(data)) {
        const serializedElements = data.map((item) => canonicalJsonStringify(item));
        return `[${serializedElements.join(",")}]`;
    }
    const obj = data;
    const sortedKeys = Object.keys(obj).sort();
    const serializedEntries = sortedKeys.map((key) => {
        return `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`;
    });
    return `{${serializedEntries.join(",")}}`;
}
/**
 * Tạo mã SHA-256 (64 hex characters) tương thích chuẩn Web Crypto API
 * Hoạt động thống nhất trên Trình duyệt, Cloudflare Workers và Node.js 18+.
 */
export async function computeSha256(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
/**
 * Tạo mã băm SHA-256 từ snapshot tổng kết lớp
 */
export async function computeSnapshotHash(snapshot) {
    const canonicalString = canonicalJsonStringify({
        weekId: snapshot.weekId,
        classId: snapshot.classId,
        schoolYearId: snapshot.schoolYearId,
        basePoints: snapshot.basePoints,
        totalPlus: snapshot.totalPlus,
        totalMinus: snapshot.totalMinus,
        finalScore: snapshot.finalScore,
        approvedEntryIds: [...snapshot.approvedEntryIds].sort(),
        criteriaRows: snapshot.criteriaRows.map((row) => ({
            criterionId: row.criterionId,
            criterionCode: row.criterionCode,
            unitPoints: row.unitPoints,
            quantity: row.quantity,
            totalPoints: row.totalPoints,
            studentNamesText: row.studentNamesText,
        })).sort((a, b) => a.criterionCode.localeCompare(b.criterionCode)),
    });
    return computeSha256(canonicalString);
}
/**
 * Xác minh tính toàn vẹn của snapshot so với mã băm SHA-256 mong đợi
 */
export async function verifySnapshotHash(snapshot, expectedHash) {
    const computedHash = await computeSnapshotHash(snapshot);
    return {
        isValid: computedHash.toLowerCase() === expectedHash.toLowerCase(),
        computedHash,
    };
}
