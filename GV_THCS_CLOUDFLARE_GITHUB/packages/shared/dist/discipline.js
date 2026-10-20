import { z } from "zod";
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
export const disciplineRoleTypes = ["discipline_committee", "competition_committee"];
export const disciplineRoleTypeLabels = {
    discipline_committee: "Ban Kỷ luật (Ghi nhận vi phạm)",
    competition_committee: "Ban Thi đua (Duyệt & Tổng kết)",
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
    isActive: z.boolean().default(true),
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
