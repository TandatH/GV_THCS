import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "./client";

const deleteTeacherAccountCallable = httpsCallable<
  { teacherId: string },
  { ok: true }
>(firebaseFunctions, "deleteTeacherAccount");

export async function deleteTeacherAccount(teacherId: string) {
  return (await deleteTeacherAccountCallable({ teacherId })).data;
}
