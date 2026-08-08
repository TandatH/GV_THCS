import type { FirebaseOptions } from "firebase/app";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

const requiredConfig = {
  apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: env("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const missing = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Thiếu Firebase Web config: ${missing.join(", ")}. Hãy kiểm tra .env.local hoặc apphosting.yaml.`,
  );
}

export const firebasePublicConfig: FirebaseOptions = {
  ...requiredConfig,
  measurementId: env("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") || undefined,
};

export const useFirebaseEmulators =
  env("NEXT_PUBLIC_USE_FIREBASE_EMULATORS") === "true";

export const firebaseAppCheckSiteKey =
  env("NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY");

export const appCheckDebugEnabled =
  env("NEXT_PUBLIC_APP_CHECK_DEBUG") === "true";
