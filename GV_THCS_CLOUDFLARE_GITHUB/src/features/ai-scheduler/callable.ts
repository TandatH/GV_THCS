import { httpsCallable } from "firebase/functions";

import { firebaseFunctions } from "@/lib/firebase/client";

import type { AiScheduleRequest, AiScheduleResponse } from "./types";

const generateScheduleWithCpSatCallable = httpsCallable<AiScheduleRequest, AiScheduleResponse>(
  firebaseFunctions,
  "generateScheduleWithCpSat",
);

export async function generateScheduleWithCpSat(input: AiScheduleRequest) {
  return (await generateScheduleWithCpSatCallable(input)).data;
}
