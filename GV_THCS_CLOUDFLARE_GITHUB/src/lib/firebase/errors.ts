import { FirebaseError } from "firebase/app";

export const firebaseUiMessages = {
  TEACHER_PROFILE_NOT_LINKED:
    "Tài khoản của bạn chưa được liên kết với hồ sơ giáo viên. Vui lòng liên hệ quản trị viên.",
  TEACHER_PROFILE_NOT_FOUND: "Không tìm thấy hồ sơ giáo viên tương ứng.",
  TEACHER_PROFILE_MISMATCH: "Liên kết tài khoản và hồ sơ giáo viên không hợp lệ.",
  PERMISSION_DENIED: "Tài khoản không có quyền truy cập dữ liệu này.",
  FAILED_PRECONDITION: "Truy vấn đang thiếu Firestore Index hoặc dữ liệu chưa đủ điều kiện.",
  NETWORK: "Không thể kết nối Firebase. Vui lòng thử lại.",
  UNKNOWN: "Đã xảy ra lỗi không xác định.",
} as const;

export type FirebaseUiErrorCode = keyof typeof firebaseUiMessages;

export class FirebaseUiError extends Error {
  code: FirebaseUiErrorCode;

  constructor(code: FirebaseUiErrorCode, message?: string) {
    super(message ?? firebaseUiMessages[code]);
    this.name = "FirebaseUiError";
    this.code = code;
  }
}

export function firebaseDataErrorMessage(error: unknown) {
  if (error instanceof FirebaseUiError) return error.message;
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") return firebaseUiMessages.PERMISSION_DENIED;
    if (error.code === "failed-precondition") return firebaseUiMessages.FAILED_PRECONDITION;
    if (error.code === "unavailable" || error.code === "deadline-exceeded") {
      return firebaseUiMessages.NETWORK;
    }
    return error.message || firebaseUiMessages.UNKNOWN;
  }
  return error instanceof Error ? error.message : firebaseUiMessages.UNKNOWN;
}
