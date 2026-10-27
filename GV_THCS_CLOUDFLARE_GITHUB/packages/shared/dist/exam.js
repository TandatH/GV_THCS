import { z } from "zod";
export const examSessionStatuses = [
    "draft",
    "scheduled",
    "published",
    "in_progress",
    "completed",
    "locked",
];
export const seatingArrangementTypes = [
    "by_class",
    "mixed_grade_abc",
];
export const examSupervisorRoles = [
    "chief", // Giám thị 1
    "assistant", // Giám thị 2
    "hall", // Giám thị hành lang
];
export const examCheckinStatuses = [
    "not_started",
    "present",
    "late",
    "absent",
];
export const examSwapStatuses = [
    "pending",
    "approved",
    "rejected",
    "cancelled",
];
export const examStudentAttendanceStatuses = [
    "present",
    "absent_with_reason",
    "absent_without_reason",
];
// -------------------------------------------------------------
// SCHEMAS
// -------------------------------------------------------------
export const examSessionSchema = z.object({
    id: z.string().optional(),
    code: z.string().trim().min(2, "Mã đợt thi tối thiểu 2 ký tự").max(30),
    name: z.string().trim().min(3, "Tên đợt kiểm tra tối thiểu 3 ký tự").max(150),
    schoolYearId: z.string().trim().min(1, "Vui lòng chọn năm học"),
    semesterId: z.string().trim().min(1, "Vui lòng chọn học kỳ"),
    schoolLevels: z.array(z.enum(["primary", "secondary"])).min(1, "Chọn ít nhất 1 cấp học").default(["secondary"]),
    gradeLevels: z.array(z.number().int().min(1).max(9)).min(1, "Chọn ít nhất 1 khối").default([6, 7, 8, 9]),
    startDate: z.string().date(),
    endDate: z.string().date(),
    status: z.enum(examSessionStatuses).default("draft"),
    seatingArrangementType: z.enum(seatingArrangementTypes).default("mixed_grade_abc"),
    maxStudentsPerRoom: z.number().int().min(10).max(60).default(24),
    mergeRemainderStudents: z.boolean().default(false),
    supervisorsPerRoom: z.number().int().min(1).max(3).default(2),
    description: z.string().trim().max(500).optional().default(""),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
}).refine((value) => value.startDate <= value.endDate, { path: ["endDate"], message: "Ngày kết thúc phải từ ngày bắt đầu trở đi" });
export const examSlotSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(100),
    date: z.string().date(),
    shiftNumber: z.number().int().min(1).max(10), // Ca 1, Ca 2, Ca 3...
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Định dạng giờ HH:mm"),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Định dạng giờ HH:mm"),
    durationMinutes: z.number().int().min(15).max(180),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
}).superRefine((value, ctx) => {
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (value.startTime >= value.endTime || minutes(value.endTime) - minutes(value.startTime) !== value.durationMinutes) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "Giờ kết thúc và thời lượng ca thi không khớp" });
    }
});
export const examSubjectSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string().trim().min(1),
    subjectId: z.string().trim().min(1),
    subjectName: z.string().trim().min(1),
    subjectCode: z.string().trim().optional().default(""),
    gradeLevel: z.number().int().min(1).max(9),
    slotId: z.string().trim().min(1),
    durationMinutes: z.number().int().min(15).max(180).default(45),
    paperFormat: z.string().trim().max(50).default("Trắc nghiệm + Tự luận"),
    roomTypeRequired: z.string().trim().default("normal"),
    expectedStudentCount: z.number().int().min(0).default(0),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
});
export const examRoomSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string().trim().min(1),
    slotId: z.string().trim().min(1),
    examSubjectId: z.string().trim().min(1),
    roomNumber: z.number().int().min(1), // Phòng số 01, 02...
    roomCode: z.string().trim().min(1), // e.g. "PT01"
    physicalRoomId: z.string().trim().min(1), // Reference to rooms collection
    physicalRoomName: z.string().trim().min(1),
    gradeLevel: z.number().int().min(1).max(9),
    studentCount: z.number().int().min(0).default(0),
    supervisorIds: z.array(z.string()).default([]),
    hallSupervisorId: z.string().trim().optional().default(""),
    status: z.enum(["ready", "in_progress", "completed"]).default("ready"),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
});
export const examStudentAssignmentSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string().trim().min(1),
    examRoomId: z.string().trim().min(1),
    slotId: z.string().trim().min(1),
    examSubjectId: z.string().trim().min(1),
    studentId: z.string().trim().min(1),
    studentName: z.string().trim().min(1),
    studentCode: z.string().trim().optional().default(""),
    classId: z.string().trim().min(1),
    className: z.string().trim().min(1),
    gradeLevel: z.number().int().min(1).max(9),
    candidateNumber: z.string().trim().min(1), // Số báo danh (SBD)
    deskNumber: z.number().int().min(1), // Vị trí bàn thi
    attendance: z.enum(examStudentAttendanceStatuses).default("present"),
    paperCount: z.number().int().min(0).default(1),
    note: z.string().trim().max(200).optional().default(""),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
});
export const examSupervisorAssignmentSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string().trim().min(1),
    slotId: z.string().trim().min(1),
    examRoomId: z.string().trim().min(1),
    teacherId: z.string().trim().min(1),
    teacherName: z.string().trim().min(1),
    teacherCode: z.string().trim().optional().default(""),
    role: z.enum(examSupervisorRoles).default("chief"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftNumber: z.number().int().min(1),
    checkinStatus: z.enum(examCheckinStatuses).default("not_started"),
    payrollRecorded: z.boolean().default(false),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
});
export const examSwapRequestSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string().trim().min(1),
    requesterTeacherId: z.string().trim().min(1),
    requesterTeacherName: z.string().trim().min(1),
    requesterAssignmentId: z.string().trim().min(1),
    targetTeacherId: z.string().trim().min(1),
    targetTeacherName: z.string().trim().min(1),
    targetAssignmentId: z.string().trim().min(1),
    reason: z.string().trim().min(3, "Lý do xin đổi ca tối thiểu 3 ký tự").max(300),
    status: z.enum(examSwapStatuses).default("pending"),
    reviewedBy: z.string().trim().optional().default(""),
    reviewedAt: z.string().optional().default(""),
    reviewNote: z.string().trim().max(300).optional().default(""),
    createdAt: z.unknown().optional(),
    createdBy: z.string().optional().default(""),
    updatedAt: z.unknown().optional(),
    updatedBy: z.string().optional().default(""),
    isActive: z.boolean().default(true),
});
// -------------------------------------------------------------
// HELPER FUNCTIONS & LOGIC
// -------------------------------------------------------------
/**
 * Định dạng chuẩn Số báo danh (SBD) theo Khối và Số thứ tự
 * Ví dụ: Khối 9, STT 23 -> "09023"
 */
export function formatCandidateNumber(gradeLevel, orderIndex, padLength = 3) {
    const gradePrefix = String(gradeLevel).padStart(2, "0");
    const order = String(orderIndex).padStart(padLength, "0");
    return `${gradePrefix}${order}`;
}
/**
 * Phân tích và tách họ tên học sinh Việt Nam để sắp xếp thứ tự ABC chuẩn:
 * Tên -> Họ -> Tên đệm
 */
export function parseVietnameseName(fullName) {
    const parts = fullName.normalize("NFC").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return { firstName: "", lastName: "", middleName: "" };
    if (parts.length === 1)
        return { firstName: parts[0], lastName: "", middleName: "" };
    const firstName = parts[parts.length - 1];
    const lastName = parts[0];
    const middleName = parts.slice(1, parts.length - 1).join(" ");
    return { firstName, lastName, middleName };
}
/**
 * Hàm so sánh họ tên học sinh theo chuẩn tiếng Việt (so sánh Tên trước, rồi đến Họ, rồi đến Tên đệm)
 */
export function compareVietnameseNames(nameA, nameB) {
    const parsedA = parseVietnameseName(nameA);
    const parsedB = parseVietnameseName(nameB);
    const cmpFirst = parsedA.firstName.localeCompare(parsedB.firstName, "vi", { sensitivity: "base" });
    if (cmpFirst !== 0)
        return cmpFirst;
    const cmpLast = parsedA.lastName.localeCompare(parsedB.lastName, "vi", { sensitivity: "base" });
    if (cmpLast !== 0)
        return cmpLast;
    return parsedA.middleName.localeCompare(parsedB.middleName, "vi", { sensitivity: "base" });
}
/** Keep class boundaries when requested; merging above the configured maximum is opt-in. */
export function splitExamStudents(students, maxPerRoom, byClass = false, mergeRemainder = false) {
    if (!Number.isInteger(maxPerRoom) || maxPerRoom < 1)
        throw new Error("Sĩ số phòng thi không hợp lệ");
    const groups = new Map();
    for (const student of students) {
        const key = byClass ? student.classId : "all";
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(student);
    }
    return [...groups.values()].flatMap((group) => {
        let roomCount = Math.ceil(group.length / maxPerRoom);
        const remainder = group.length % maxPerRoom;
        const merge = mergeRemainder && roomCount > 1 && remainder > 0 && remainder < 6
            && Math.ceil(group.length / (roomCount - 1)) <= 28;
        if (merge)
            roomCount--;
        const result = [];
        let offset = 0;
        for (let i = 0; i < roomCount; i++) {
            const size = merge ? Math.ceil((group.length - offset) / (roomCount - i)) : maxPerRoom;
            result.push(group.slice(offset, offset + size));
            offset += size;
        }
        return result;
    });
}
/** Exam duties never become teaching periods. Missing rates remain explicit for review. */
export function summarizeExamPayroll(teacherId, month, checkins, rates = {}) {
    const seen = new Set();
    let examDutyCount = 0;
    let examSupervisionAmount = 0;
    let requiresExamRateReview = false;
    for (const record of checkins) {
        if (record.teacherId !== teacherId || record.type !== "exam_supervision" || record.isActive === false
            || record.status !== "confirmed" || !String(record.date ?? "").startsWith(`${month}-`))
            continue;
        const key = String(record.assignmentId || record.id || "");
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        examDutyCount++;
        const rate = record.ratePerDuty ?? rates[String(record.role)];
        if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0)
            requiresExamRateReview = true;
        else
            examSupervisionAmount += rate;
    }
    return { examDutyCount, examSupervisionAmount, requiresExamRateReview };
}
/**
 * Kiểm tra xung đột điều kiện coi thi của giáo viên:
 * - Không coi thi môn mình đang dạy ở khối đó
 * - Không coi thi lớp mình chủ nhiệm (khi thi theo lớp)
 */
export function validateSupervisorEligibility(params) {
    const { teacherSubjectIds, teacherGradeLevels, homeroomClassId, examSubjectId, examGradeLevel, examClassId, } = params;
    // 1. Ràng buộc môn dạy và khối dạy
    const teachesExamSubject = teacherSubjectIds.includes(examSubjectId);
    const teachesExamGrade = teacherGradeLevels.includes(examGradeLevel);
    if (teachesExamSubject && teachesExamGrade) {
        return {
            eligible: false,
            reason: `Giáo viên đang trực tiếp giảng dạy môn thi ở khối ${examGradeLevel}`,
        };
    }
    // 2. Ràng buộc chủ nhiệm (nếu phòng thi theo lớp cụ thể)
    if (homeroomClassId && examClassId && homeroomClassId === examClassId) {
        return {
            eligible: false,
            reason: "Giáo viên là giáo viên chủ nhiệm của lớp trong phòng thi này",
        };
    }
    return { eligible: true };
}
