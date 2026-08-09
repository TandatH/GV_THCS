import { firebaseAuth } from "@/lib/firebase/client";

import type { AiScheduleRequest, AiScheduleResponse } from "./types";

type CallableErrorBody = {
  error?: {
    status?: string;
    message?: string;
    details?: unknown;
  };
  data?: AiScheduleResponse;
  result?: AiScheduleResponse;
  response?: AiScheduleResponse;
};

export async function generateScheduleWithCpSat(
  input: AiScheduleRequest,
): Promise<AiScheduleResponse> {
  // Đợi Firebase Auth khôi phục phiên đăng nhập trên trình duyệt.
  await firebaseAuth.authStateReady();

  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error(
      "Phiên đăng nhập chưa sẵn sàng. Hãy đăng xuất rồi đăng nhập lại tài khoản quản trị.",
    );
  }

  // Lấy ID token mới nhất và tự gắn Authorization.
  // Không log token ra Console.
  const idToken = await user.getIdToken(true);

  const projectId = firebaseAuth.app.options.projectId;
  if (!projectId) {
    throw new Error("Không xác định được Firebase projectId.");
  }

  const endpoint =
    `https://asia-southeast1-${projectId}.cloudfunctions.net/` +
    "generateScheduleWithCpSat";

  console.info("[CP-SAT] Calling authenticated function", {
    uid: user.uid,
    projectId,
    functionName: "generateScheduleWithCpSat",
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      data: input,
    }),
  });

  let payload: CallableErrorBody;
  try {
    payload = (await response.json()) as CallableErrorBody;
  } catch {
    throw new Error(
      `Cloud Function trả HTTP ${response.status} nhưng response không phải JSON.`,
    );
  }

  if (!response.ok || payload.error) {
    const status = payload.error?.status || `HTTP_${response.status}`;
    const message =
      payload.error?.message ||
      `Cloud Function trả lỗi HTTP ${response.status}.`;

    if (status === "UNAUTHENTICATED") {
      throw new Error(
        "Firebase không xác thực được tài khoản Admin cho CP-SAT. " +
          "Hãy đăng xuất, đăng nhập lại rồi thử lại.",
      );
    }

    if (status === "PERMISSION_DENIED") {
      throw new Error(
        "Tài khoản đã đăng nhập nhưng không có quyền Admin để chạy CP-SAT.",
      );
    }

    throw new Error(`${status}: ${message}`);
  }

  const result = payload.data ?? payload.result ?? payload.response;

  if (!result) {
    throw new Error("Cloud Function không trả về dữ liệu lịch đề xuất.");
  }

  return result;
}
