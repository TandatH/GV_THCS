import {
  doc,
  getDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import { firestore } from "./client";
import { FirebaseUiError } from "./errors";

export type CurrentTeacherContext = {
  userProfile: DocumentData;
  teacherId: string;
  teacherProfile: DocumentData;
};

export async function getCurrentTeacherContext(
  uid: string,
  db: Firestore = firestore,
): Promise<CurrentTeacherContext> {
  const userSnapshot = await getDoc(doc(db, "users", uid));
  if (!userSnapshot.exists()) {
    throw new FirebaseUiError("TEACHER_PROFILE_NOT_LINKED");
  }

  const userProfile = userSnapshot.data();
  const teacherId = typeof userProfile.teacherId === "string" ? userProfile.teacherId.trim() : "";
  if (!teacherId) {
    throw new FirebaseUiError("TEACHER_PROFILE_NOT_LINKED");
  }

  const teacherSnapshot = await getDoc(doc(db, "teachers", teacherId));
  if (!teacherSnapshot.exists()) {
    throw new FirebaseUiError("TEACHER_PROFILE_NOT_FOUND");
  }

  const teacherProfile = teacherSnapshot.data();
  if (teacherProfile.userId !== uid) {
    throw new FirebaseUiError("TEACHER_PROFILE_MISMATCH");
  }

  return {
    userProfile,
    teacherId,
    teacherProfile,
  };
}
