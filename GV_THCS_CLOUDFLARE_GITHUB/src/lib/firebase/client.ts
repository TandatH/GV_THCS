import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

import {
  appCheckDebugEnabled,
  firebaseAppCheckSiteKey,
  firebasePublicConfig,
  useFirebaseEmulators,
} from "./public-config";

const browser = typeof window !== "undefined";
const app = browser ? (getApps().length > 0 ? getApp() : initializeApp(firebasePublicConfig)) : null;

export const firebaseApp = app as FirebaseApp;

const appCheckState = globalThis as typeof globalThis & {
  __teacherManagementAppCheck?: AppCheck;
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  __teacherManagementEmulatorsConnected?: boolean;
};

if (browser && firebaseAppCheckSiteKey && !useFirebaseEmulators && !appCheckState.__teacherManagementAppCheck) {
  if (appCheckDebugEnabled) appCheckState.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  appCheckState.__teacherManagementAppCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(firebaseAppCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const firebaseAppCheck = appCheckState.__teacherManagementAppCheck ?? null;
export const firebaseAuth = (browser ? getAuth(firebaseApp) : null) as Auth;
export const firestore = (browser ? getFirestore(firebaseApp) : null) as Firestore;
export const firebaseStorage = (browser ? getStorage(firebaseApp) : null) as FirebaseStorage;
export const firebaseFunctions = (browser ? getFunctions(firebaseApp, "asia-southeast1") : null) as Functions;

if (browser && useFirebaseEmulators && !appCheckState.__teacherManagementEmulatorsConnected) {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8081);
  connectFunctionsEmulator(firebaseFunctions, "127.0.0.1", 5001);
  connectStorageEmulator(firebaseStorage, "127.0.0.1", 9199);
  appCheckState.__teacherManagementEmulatorsConnected = true;
}

let analyticsInitialization: Promise<void> | null = null;

export function initializeFirebaseAnalytics(): Promise<void> {
  if (!browser) return Promise.resolve();
  if (!analyticsInitialization) {
    analyticsInitialization = import("firebase/analytics")
      .then(async ({ getAnalytics, isSupported }) => {
        if (await isSupported()) getAnalytics(firebaseApp);
      })
      .catch(() => undefined);
  }
  return analyticsInitialization;
}
