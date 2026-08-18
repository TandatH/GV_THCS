import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "./client";

export type CatalogCollectionName =
  | "campuses"
  | "classes"
  | "departments"
  | "rooms"
  | "schoolYears"
  | "semesters"
  | "subjects"
  | "timeSlots";

const deleteCatalogItemCallable = httpsCallable<
  { collectionName: CatalogCollectionName; id: string },
  { ok: true }
>(firebaseFunctions, "deleteCatalogItem");

export async function deleteCatalogItem(collectionName: CatalogCollectionName, id: string) {
  return (await deleteCatalogItemCallable({ collectionName, id })).data;
}
