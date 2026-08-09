import { getIdTokenResult } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { firebaseAuth, firebaseFunctions } from "@/lib/firebase/client";

import type { AiScheduleRequest, AiScheduleResponse } from "./types";

const generateScheduleWithCpSatCallable = httpsCallable<
  AiScheduleRequest,
  AiScheduleResponse
>(
  firebaseFunctions,
  "generateScheduleWithCpSat",
);

export async function generateScheduleWithCpSat(input: AiScheduleRequest) {
  // Đợi Firebase Auth khôi phục phiên đăng nhập trên trình duyệt.
  await firebaseAuth.authStateReady();

  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error(
      "Phiên đăng nhập chưa sẵn sàng. Hãy đăng xuất, đăng nhập lại tài khoản quản trị rồi thử lại.",
    );
  }

  // Ép refresh ID token để callable không dùng token cũ/hết hạn.
  const tokenResult = await getIdTokenResult(user, true);

  // Kiểm tra nhanh token có đúng Firebase project đang dùng hay không.
  const expectedProjectId = firebaseAuth.app.options.projectId || "";
  const tokenAudience =
    typeof tokenResult.claims.aud === "string"
      ? tokenResult.claims.aud
      : "";

  if (
    expectedProjectId &&
    tokenAudience &&
    tokenAudience !== expectedProjectId
  ) {
    throw new Error(
      `Firebase Auth token đang thuộc project "${tokenAudience}", nhưng ứng dụng đang dùng "${expectedProjectId}".`,
    );
  }

  return (await generateScheduleWithCpSatCallable(input)).data;
}
