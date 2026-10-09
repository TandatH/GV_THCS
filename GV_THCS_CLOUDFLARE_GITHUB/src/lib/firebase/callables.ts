import type {
  ApproveLeaveInput,
  Role,
  ScheduleInput,
  SetUserRoleInput,
  SubstituteCandidate,
  TeacherInput,
} from "@school/shared";
import { FirebaseError } from "firebase/app";
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

export function firebaseErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error
      ? error.message
      : "Đã xảy ra lỗi không xác định.";
  }

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

  if (error.code.startsWith("functions/") && error.message) {
    return error.message;
  }

  return messages[error.code] || error.message;
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
