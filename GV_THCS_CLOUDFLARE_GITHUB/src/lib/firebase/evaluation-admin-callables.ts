import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "./client";

const setEvaluationPeriodStatusCallable = httpsCallable<
  { periodId: string; status: "draft" | "published" },
  { ok: true; status: "draft" | "published" }
>(firebaseFunctions, "setEvaluationPeriodStatus");

const deleteEvaluationPeriodCallable = httpsCallable<
  { periodId: string; confirmation: "XOA KY DANH GIA" },
  { ok: true; deletedEvaluationCount: number }
>(firebaseFunctions, "deleteEvaluationPeriod");

export async function setEvaluationPeriodStatus(periodId: string, status: "draft" | "published") {
  return (await setEvaluationPeriodStatusCallable({ periodId, status })).data;
}

export async function deleteEvaluationPeriod(periodId: string) {
  return (await deleteEvaluationPeriodCallable({ periodId, confirmation: "XOA KY DANH GIA" })).data;
}
