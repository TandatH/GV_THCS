import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "./client";

type CallableResult<T> = { ok: true } & T;

const resetTeacherPasswordCallable = httpsCallable<
  { teacherId: string; password?: string },
  CallableResult<{ temporaryPassword: string }>
>(firebaseFunctions, "resetTeacherPassword");

const markOwnPasswordChangedCallable = httpsCallable<
  Record<string, never>,
  CallableResult<Record<string, never>>
>(firebaseFunctions, "markOwnPasswordChanged");

export async function resetTeacherPassword(teacherId: string, password?: string) {
  const payload = password ? { teacherId, password } : { teacherId };
  return (await resetTeacherPasswordCallable(payload)).data;
}

export async function markOwnPasswordChanged() {
  return (await markOwnPasswordChangedCallable({})).data;
}
