import type {
  ApproveLeaveInput,
  CreateSaoDoAccountInput,
  DeleteSaoDoAccountInput,
  ResetSaoDoPasswordInput,
  Role,
  ScheduleInput,
  SetUserRoleInput,
  SubstituteCandidate,
  TeacherInput,
  UpdateSaoDoAccountInput,
} from "@school/shared";
import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "./client";

type CallableResult<T> = { ok: true } & T;

type ScheduleAssignmentResponseInput = {
  scheduleId: string;
  response: "xac_nhan" | "tu_choi";
  reason?: string;
};

type AvailabilityReviewInput = {
  availabilityId: string;
  decision: "approved" | "rejected";
  note?: string;
};

type TeacherAvailabilitySaveInput = {
  semesterId: string;
  slots: string[];
  status: "draft" | "submitted";
};

function callable<TInput, TOutput>(name: string) {
  return httpsCallable<TInput, CallableResult<TOutput>>(
    firebaseFunctions,
    name,
  );
}

const createTeacherAccountCallable = callable<
  {
    teacher: TeacherInput & { homeroomDepartmentId?: string };
    password?: string;
    role?: Role;
    bghPosition?: "hieutruong" | "phohieutruong";
    schoolLevel?: "primary" | "secondary" | "all";
    isTeaching?: boolean;
  },
  { uid: string; teacherId: string }
>("createTeacherAccount");

const createOrUpdateScheduleCallable = callable<
  ScheduleInput,
  { scheduleId: string }
>("createOrUpdateSchedule");

const reviewTeacherAvailabilityCallable = callable<
  AvailabilityReviewInput,
  Record<string, never>
>("reviewTeacherAvailability");

const saveTeacherAvailabilityCallable = callable<
  TeacherAvailabilitySaveInput,
  { availabilityId: string }
>("saveTeacherAvailability");

const approveLeaveRequestCallable = callable<
  ApproveLeaveInput,
  Record<string, never>
>("approveLeaveRequest");

const setUserRoleCallable = callable<
  SetUserRoleInput,
  Record<string, never>
>("setUserRole");

const suggestSubstituteTeachersCallable = callable<
  { scheduleId: string },
  { candidates: SubstituteCandidate[] }
>("suggestSubstituteTeachers");

const calculateMonthlyPayrollCallable = callable<
  { month: string },
  { count: number }
>("calculateMonthlyPayroll");

const respondToScheduleAssignmentCallable = callable<
  ScheduleAssignmentResponseInput,
  Record<string, never>
>("respondToScheduleAssignment");

export function firebaseErrorMessage(error: unknown): string {
  const messages: Record<string, string> = {
    "functions/unauthenticated":
      "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    "functions/permission-denied":
      "Bạn không có quyền thực hiện thao tác này.",
    "functions/already-exists":
      "Dữ liệu đã tồn tại hoặc đang bị trùng.",
    "functions/failed-precondition":
      "Dữ liệu chưa đáp ứng điều kiện xử lý.",
    "functions/invalid-argument":
      "Thông tin gửi lên chưa hợp lệ.",
    "auth/invalid-credential":
      "Email hoặc mật khẩu không chính xác.",
    "auth/popup-closed-by-user":
      "Cửa sổ đăng nhập Google đã bị đóng.",
    "auth/network-request-failed":
      "Không thể kết nối mạng. Vui lòng thử lại.",
    "auth/too-many-requests":
      "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.",
  };

  if (typeof error === "object" && error !== null) {
    const callableError = error as {
      code?: unknown;
      details?: unknown;
      message?: unknown;
    };

    if (typeof callableError.details === "string" && callableError.details.trim()) {
      return callableError.details;
    }
    if (
      typeof callableError.details === "object" &&
      callableError.details !== null &&
      "message" in callableError.details &&
      typeof callableError.details.message === "string" &&
      callableError.details.message.trim()
    ) {
      return callableError.details.message;
    }

    const code = typeof callableError.code === "string" ? callableError.code : "";
    if (!code.startsWith("functions/") && messages[code]) return messages[code];

    if (typeof callableError.message === "string" && callableError.message.trim()) {
      return callableError.message
        .replace(/^FirebaseError:\s*/i, "")
        .replace(/^functions\/[a-z-]+:\s*/i, "");
    }

    if (messages[code]) return messages[code];
  }

  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

export async function createTeacherAccount(input: {
  teacher: TeacherInput & { homeroomDepartmentId?: string };
  password?: string;
  role?: Role;
  bghPosition?: "hieutruong" | "phohieutruong";
  schoolLevel?: "primary" | "secondary" | "all";
  isTeaching?: boolean;
}) {
  const payload: Record<string, unknown> = {
    teacher: input.teacher,
    role: input.role || "giaovien",
    isTeaching: input.isTeaching !== false,
  };
  if (input.password) payload.password = input.password;
  if (input.bghPosition) payload.bghPosition = input.bghPosition;
  if (input.schoolLevel) payload.schoolLevel = input.schoolLevel;

  return (await createTeacherAccountCallable(payload as any)).data;
}

export async function createOrUpdateSchedule(input: ScheduleInput) {
  return (await createOrUpdateScheduleCallable(input)).data;
}

export async function reviewTeacherAvailability(
  input: AvailabilityReviewInput,
) {
  return (await reviewTeacherAvailabilityCallable(input)).data;
}

export async function saveTeacherAvailability(
  input: TeacherAvailabilitySaveInput,
) {
  return (await saveTeacherAvailabilityCallable(input)).data;
}

export async function approveLeaveRequest(input: ApproveLeaveInput) {
  const payload: Record<string, unknown> = {
    leaveRequestId: input.leaveRequestId,
    decision: input.decision,
  };
  if (input.note && typeof input.note === "string" && input.note.trim()) {
    payload.note = input.note.trim();
  }
  if (input.decision === "da_duyet") {
    if (input.substituteTeacherId) {
      payload.substituteTeacherId = input.substituteTeacherId;
    }
    if (Array.isArray(input.substitutions) && input.substitutions.length > 0) {
      payload.substitutions = input.substitutions;
    }
  }
  return (await approveLeaveRequestCallable(payload as ApproveLeaveInput)).data;
}

export async function setUserRole(input: SetUserRoleInput) {
  const payload: Record<string, unknown> = { ...input };
  if (!payload.bghPosition) delete payload.bghPosition;
  if (!payload.schoolLevel) delete payload.schoolLevel;
  if (!payload.departmentId) delete payload.departmentId;
  if (!payload.teacherId) delete payload.teacherId;
  return (await setUserRoleCallable(payload as SetUserRoleInput)).data;
}

export async function suggestSubstituteTeachers(scheduleId: string) {
  return (
    await suggestSubstituteTeachersCallable({
      scheduleId,
    })
  ).data;
}

export async function calculateMonthlyPayroll(month: string) {
  return (
    await calculateMonthlyPayrollCallable({
      month,
    })
  ).data;
}

export async function respondToScheduleAssignment(
  input: ScheduleAssignmentResponseInput,
) {
  const payload: ScheduleAssignmentResponseInput = input.reason
    ? {
        scheduleId: input.scheduleId,
        response: input.response,
        reason: input.reason,
      }
    : {
        scheduleId: input.scheduleId,
        response: input.response,
      };

  return (
    await respondToScheduleAssignmentCallable(payload)
  ).data;
}

// ============================================================================
// MODULE KỶ LUẬT & THI ĐUA (DISCIPLINE & EMULATION CALLABLES)
// ============================================================================

export type AssignDisciplineRoleInput = {
  userUid: string;
  roleType:
    | "discipline_committee"
    | "competition_committee"
    | "discipline_head"
    | "competition_head"
    | "discipline_and_competition_head";
  action: "assign" | "revoke";
  assignedClassIds?: string[];
  schoolYearId: string;
};

export type AssignWeeklyDisciplineSignerInput = {
  schoolYearId: string;
  weekId: string;
  classId: string;
  signerUid: string;
  signerName: string;
  signerEmail: string;
};

export type RecordDisciplineViolationInput = {
  entryId?: string;
  classId: string;
  weekId: string;
  schoolYearId: string;
  criterionId: string;
  criterionCode?: string;
  scope?: "student" | "class";
  studentIds?: string[];
  studentNamesText?: string;
  students?: { studentId: string; studentName: string }[];
  quantity?: number;
  occurredDate?: string;
  date?: string;
  period?: number;
  note?: string;
  attachmentUrls?: string[];
  idempotencyKey?: string;
};

export type ReviewDisciplineViolationInput = {
  entryId: string;
  decision?: "approved" | "returned" | "rejected";
  status?: "approved" | "returned" | "rejected";
  reviewNote?: string;
};

export type SignWeeklyDisciplineScoreInput = {
  weekId: string;
  classId: string;
};

export type LockWeeklyDisciplineInput = {
  weekId: string;
};

export type ReopenWeeklyDisciplineInput = {
  weekId: string;
  classId?: string;
  reason: string;
};

export type VerifyWeeklyDisciplineSignatureInput = {
  approvalId?: string;
  weekId?: string;
  classId?: string;
  version?: number;
  expectedHash: string;
};

export type SubmitDisciplineAppealInput = {
  entryId: string;
  reason: string;
  evidenceUrls?: string[];
};

export type ReviewDisciplineAppealInput = {
  appealId: string;
  decision: "approved" | "rejected";
  actionOnEntry?: "void" | "return";
  resolutionNote: string;
};

const assignDisciplineRoleCallable = callable<AssignDisciplineRoleInput, { message: string }>("assignDisciplineRole");
const assignWeeklyDisciplineSignerCallable = callable<AssignWeeklyDisciplineSignerInput, { assignmentId: string }>("assignWeeklyDisciplineSigner");
const recordDisciplineViolationCallable = callable<RecordDisciplineViolationInput, { entryId: string; totalPoints: number }>("recordDisciplineViolation");
const reviewDisciplineViolationCallable = callable<ReviewDisciplineViolationInput, { entryId: string; status: string }>("reviewDisciplineViolation");
const signWeeklyDisciplineScoreCallable = callable<SignWeeklyDisciplineScoreInput, { approvalId: string; contentHashSha256: string; finalScore: number }>("signWeeklyDisciplineScore");
const lockWeeklyDisciplineCallable = callable<LockWeeklyDisciplineInput, { weekId: string; totalClasses: number; leaderboardCount: number; message?: string }>("lockWeeklyDiscipline");
const reopenWeeklyDisciplineCallable = callable<ReopenWeeklyDisciplineInput, { weekId: string; newVersion: number; message?: string }>("reopenWeeklyDiscipline");
const verifyWeeklyDisciplineSignatureCallable = callable<VerifyWeeklyDisciplineSignatureInput, { status: string; isValid: boolean; match?: boolean; storedHash: string; message?: string }>("verifyWeeklyDisciplineSignature");
const submitDisciplineAppealCallable = callable<SubmitDisciplineAppealInput, { appealId: string; message: string }>("submitDisciplineAppeal");
const reviewDisciplineAppealCallable = callable<ReviewDisciplineAppealInput, { appealId: string; decision: string; message: string }>("reviewDisciplineAppeal");

export async function assignDisciplineRole(input: AssignDisciplineRoleInput) {
  return (await assignDisciplineRoleCallable(input)).data;
}

export async function assignWeeklyDisciplineSigner(input: AssignWeeklyDisciplineSignerInput) {
  return (await assignWeeklyDisciplineSignerCallable(input)).data;
}

export async function recordDisciplineViolation(input: RecordDisciplineViolationInput) {
  const normalized = {
    entryId: input.entryId,
    classId: input.classId,
    weekId: input.weekId,
    schoolYearId: input.schoolYearId,
    criterionId: input.criterionId,
    scope: input.scope || (input.students && input.students.length > 0 ? "student" : "class"),
    studentIds: input.studentIds || (input.students ? input.students.map((s) => s.studentId) : []),
    studentNamesText: input.studentNamesText || (input.students ? input.students.map((s) => s.studentName).join("; ") : ""),
    // quantity là số lần vi phạm trên mỗi học sinh; số học sinh được backend
    // nhân riêng, vì vậy mặc định luôn là 1 thay vì dùng độ dài danh sách.
    quantity: input.quantity ?? 1,
    occurredDate: input.occurredDate || input.date,
    period: input.period,
    note: input.note || "",
    attachmentUrls: input.attachmentUrls || [],
    idempotencyKey: input.idempotencyKey,
  };
  return (await recordDisciplineViolationCallable(normalized as any)).data;
}

export async function reviewDisciplineViolation(input: ReviewDisciplineViolationInput) {
  const payload = {
    entryId: input.entryId,
    decision: input.decision || input.status || "approved",
    reviewNote: input.reviewNote || "",
  };
  return (await reviewDisciplineViolationCallable(payload as any)).data;
}

export async function signWeeklyDisciplineScore(input: SignWeeklyDisciplineScoreInput) {
  return (await signWeeklyDisciplineScoreCallable(input)).data;
}

export async function lockWeeklyDiscipline(input: LockWeeklyDisciplineInput) {
  return (await lockWeeklyDisciplineCallable(input)).data;
}

export async function reopenWeeklyDiscipline(input: ReopenWeeklyDisciplineInput) {
  return (await reopenWeeklyDisciplineCallable(input)).data;
}

export async function verifyWeeklyDisciplineSignature(input: VerifyWeeklyDisciplineSignatureInput) {
  const approvalId = input.approvalId || (input.weekId && input.classId ? `${input.weekId}_${input.classId}_v${input.version || 1}` : "");
  return (await verifyWeeklyDisciplineSignatureCallable({ approvalId, expectedHash: input.expectedHash } as any)).data;
}

export async function submitDisciplineAppeal(input: SubmitDisciplineAppealInput) {
  return (await submitDisciplineAppealCallable(input)).data;
}

export async function reviewDisciplineAppeal(input: ReviewDisciplineAppealInput) {
  return (await reviewDisciplineAppealCallable(input)).data;
}

// ============================================================================
// Quản lý Tài khoản Đội Sao Đỏ (Callables)
// ============================================================================

const createSaoDoAccountCallable = callable<
  CreateSaoDoAccountInput,
  { uid: string; email: string; username: string; temporaryPassword?: string; assignedClassIds: string[]; message: string }
>("createSaoDoAccount");

const updateSaoDoAccountCallable = callable<
  UpdateSaoDoAccountInput,
  { message: string }
>("updateSaoDoAccount");

const resetSaoDoPasswordCallable = callable<
  ResetSaoDoPasswordInput,
  { temporaryPassword: string; message: string }
>("resetSaoDoPassword");

const deleteSaoDoAccountCallable = callable<
  DeleteSaoDoAccountInput,
  { action: string; message: string }
>("deleteSaoDoAccount");

export type {
  CreateSaoDoAccountInput,
  UpdateSaoDoAccountInput,
  ResetSaoDoPasswordInput,
  DeleteSaoDoAccountInput,
};

export async function createSaoDoAccount(input: CreateSaoDoAccountInput) {
  return (await createSaoDoAccountCallable(input)).data;
}

export async function updateSaoDoAccount(input: UpdateSaoDoAccountInput) {
  return (await updateSaoDoAccountCallable(input)).data;
}

export async function resetSaoDoPassword(input: ResetSaoDoPasswordInput) {
  return (await resetSaoDoPasswordCallable(input)).data;
}

export async function deleteSaoDoAccount(input: DeleteSaoDoAccountInput) {
  return (await deleteSaoDoAccountCallable(input)).data;
}

export type InitializeDisciplineWeeksInput = {
  schoolYearId?: string;
  schoolLevel?: "primary" | "secondary";
  upToWeek?: number;
  activeWeekNumber?: number;
};

const initializeDisciplineWeeksCallable = callable<
  InitializeDisciplineWeeksInput,
  {
    ok: boolean;
    schoolYearId: string;
    totalWeeks: number;
    activeWeekNumber: number;
    activeWeekId: string;
    message: string;
  }
>("initializeDisciplineWeeks");

export async function initializeDisciplineWeeks(input?: InitializeDisciplineWeeksInput) {
  return (await initializeDisciplineWeeksCallable(input || {})).data;
}

export type CreateDisciplineWeekInput = {
  schoolYearId?: string;
  schoolLevel?: "primary" | "secondary";
  weekNumber: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  setActive?: boolean;
};

const createDisciplineWeekCallable = callable<
  CreateDisciplineWeekInput,
  {
    ok: boolean;
    weekId: string;
    weekNumber: number;
    name: string;
    message: string;
  }
>("createDisciplineWeek");

export async function createDisciplineWeek(input: CreateDisciplineWeekInput) {
  return (await createDisciplineWeekCallable(input)).data;
}

// ===============================================================
// Module Xếp Lịch Kiểm Tra & Thi (Exam Scheduling Callables)
// ===============================================================

import type {
  ExamSessionInput,
  ExamSwapRequestInput,
} from "@school/shared";

export type AllocateStudentsInput = {
  sessionId: string;
  clearExisting?: boolean;
};

export type AssignSupervisorsInput = {
  sessionId: string;
  clearExisting?: boolean;
};

export type ReviewExamSwapInput = {
  swapRequestId: string;
  action: "approved" | "rejected";
  reviewNote?: string;
};

const createOrUpdateExamSessionCallable = callable<
  ExamSessionInput,
  { success: boolean; sessionId: string; action: string }
>("createOrUpdateExamSession");

export async function createOrUpdateExamSession(input: ExamSessionInput) {
  return (await createOrUpdateExamSessionCallable(input)).data;
}

const deleteExamSessionCallable = callable<
  { sessionId: string },
  { success: boolean; sessionId: string }
>("deleteExamSession");

export async function deleteExamSession(sessionId: string) {
  return (await deleteExamSessionCallable({ sessionId })).data;
}

const generateExamRoomsAndSeatingCallable = callable<
  AllocateStudentsInput,
  { success: boolean; sessionId: string; totalRooms: number; totalStudentsAssigned: number }
>("generateExamRoomsAndSeating");

export async function generateExamRoomsAndSeating(input: AllocateStudentsInput) {
  return (await generateExamRoomsAndSeatingCallable(input)).data;
}

const assignExamSupervisorsCallable = callable<
  AssignSupervisorsInput,
  { success: boolean; sessionId: string; totalSupervisorsAssigned: number; totalRoomsCovered: number; warnings: string[] }
>("assignExamSupervisors");

export async function assignExamSupervisors(input: AssignSupervisorsInput) {
  return (await assignExamSupervisorsCallable(input)).data;
}

const requestExamSwapCallable = callable<
  ExamSwapRequestInput,
  { success: boolean; swapRequestId: string }
>("requestExamSwap");

export async function requestExamSwap(input: ExamSwapRequestInput) {
  return (await requestExamSwapCallable(input)).data;
}

const reviewExamSwapCallable = callable<
  ReviewExamSwapInput,
  { success: boolean; status: string }
>("reviewExamSwap");

export async function reviewExamSwap(input: ReviewExamSwapInput) {
  return (await reviewExamSwapCallable(input)).data;
}

import type { ExamSlotInput, ExamSubjectInput } from "@school/shared";

const createOrUpdateExamSlotCallable = callable<
  ExamSlotInput,
  { success: boolean; slotId: string; action: string }
>("createOrUpdateExamSlot");

export async function createOrUpdateExamSlot(input: ExamSlotInput) {
  return (await createOrUpdateExamSlotCallable(input)).data;
}

const deleteExamSlotCallable = callable<
  { slotId: string },
  { success: boolean; slotId: string }
>("deleteExamSlot");

export async function deleteExamSlot(slotId: string) {
  return (await deleteExamSlotCallable({ slotId })).data;
}

const createOrUpdateExamSubjectCallable = callable<
  ExamSubjectInput,
  { success: boolean; examSubjectId: string; action: string }
>("createOrUpdateExamSubject");

export async function createOrUpdateExamSubject(input: ExamSubjectInput) {
  return (await createOrUpdateExamSubjectCallable(input)).data;
}

const deleteExamSubjectCallable = callable<
  { examSubjectId: string },
  { success: boolean; examSubjectId: string }
>("deleteExamSubject");

export async function deleteExamSubject(examSubjectId: string) {
  return (await deleteExamSubjectCallable({ examSubjectId })).data;
}

const finalizeExamDutyToPayrollCallable = callable<
  { sessionId: string },
  { success: boolean; message: string; totalDutiesRecorded: number; totalTeachers: number }
>("finalizeExamDutyToPayroll");

export async function finalizeExamDutyToPayroll(sessionId: string) {
  return (await finalizeExamDutyToPayrollCallable({ sessionId })).data;
}

const getExamSwapCandidatesCallable = callable<{ assignmentId: string }, { assignments: Array<{ id: string; teacherId: string; teacherName: string; date: string; shiftNumber: number; role: string }> }>("getExamSwapCandidates");
export async function getExamSwapCandidates(assignmentId: string) {
  return (await getExamSwapCandidatesCallable({ assignmentId })).data.assignments;
}

const recordExamDutyAttendanceCallable = callable<{ assignmentId: string; checkinStatus: "not_started" | "present" | "late" | "absent" }, { success: boolean }>("recordExamDutyAttendance");
export async function recordExamDutyAttendance(assignmentId: string, checkinStatus: "not_started" | "present" | "late" | "absent") {
  return (await recordExamDutyAttendanceCallable({ assignmentId, checkinStatus })).data;
}

const configureExamPayrollRatesCallable = callable<{ chief: number; assistant: number; hall: number }, { success: boolean }>("configureExamPayrollRates");
export async function configureExamPayrollRates(input: { chief: number; assistant: number; hall: number }) {
  return (await configureExamPayrollRatesCallable(input)).data;
}
