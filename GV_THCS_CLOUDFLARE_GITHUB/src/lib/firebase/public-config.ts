import type { FirebaseOptions } from "firebase/app";

const isServerBuild = typeof window === "undefined";

const requiredConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || (isServerBuild ? "build-placeholder" : ""),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || (isServerBuild ? "build-placeholder.firebaseapp.com" : ""),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || (isServerBuild ? "build-placeholder" : ""),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || (isServerBuild ? "build-placeholder.appspot.com" : ""),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || (isServerBuild ? "1234567890" : ""),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || (isServerBuild ? "1:1234567890:web:buildplaceholder" : ""),
};

const missing = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (!isServerBuild && missing.length > 0) {
  throw new Error(
    `Thiếu Firebase Web config: ${missing.join(", ")}. Hãy kiểm tra Cloudflare Build Variables.`,
  );
}

export const firebasePublicConfig: FirebaseOptions = {
  ...requiredConfig,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
};

export const useFirebaseEmulators =
  (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS?.trim() || "") === "true";

export const firebaseAppCheckSiteKey =
  process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim() || "";

export const appCheckDebugEnabled =
  (process.env.NEXT_PUBLIC_APP_CHECK_DEBUG?.trim() || "") === "true";
