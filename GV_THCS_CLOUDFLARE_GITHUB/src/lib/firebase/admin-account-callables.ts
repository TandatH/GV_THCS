import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "./client";

type Ok<T extends object = Record<string, never>> = { ok: true } & T;

const createAdminAccountCallable = httpsCallable<
  { fullName: string; email: string; password?: string },
  Ok<{ uid: string; fullName: string; email: string; temporaryPassword: string }>
>(firebaseFunctions, "createAdminAccount");

const resetAdminPasswordCallable = httpsCallable<
  { uid: string; password?: string },
  Ok<{ temporaryPassword: string }>
>(firebaseFunctions, "resetAdminPassword");

const setAdminAccountStatusCallable = httpsCallable<
  { uid: string; enabled: boolean },
  Ok
>(firebaseFunctions, "setAdminAccountStatus");

const deleteAdminAccountCallable = httpsCallable<
  { uid: string },
  Ok
>(firebaseFunctions, "deleteAdminAccount");

export async function createAdminAccount(input: { fullName: string; email: string; password?: string }) {
  return (await createAdminAccountCallable(input)).data;
}

export async function resetAdminPassword(uid: string, password?: string) {
  return (await resetAdminPasswordCallable(password ? { uid, password } : { uid })).data;
}

export async function setAdminAccountStatus(uid: string, enabled: boolean) {
  return (await setAdminAccountStatusCallable({ uid, enabled })).data;
}

export async function deleteAdminAccount(uid: string) {
  return (await deleteAdminAccountCallable({ uid })).data;
}
