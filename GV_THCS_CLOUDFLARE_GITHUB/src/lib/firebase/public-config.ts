import type { FirebaseOptions } from "firebase/app";

const requiredConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(requiredConfig).filter(([, value]) => !value?.trim()).map(([key]) => key);
if (missing.length > 0) {
  throw new Error(`Thiếu Firebase Web config: ${missing.join(", ")}. Hãy kiểm tra .env.local hoặc apphosting.yaml.`);
}

export const firebasePublicConfig: FirebaseOptions = {
  ...requiredConfig,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
};

export const useFirebaseEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
export const firebaseAppCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim() || "";
export const appCheckDebugEnabled = process.env.NEXT_PUBLIC_APP_CHECK_DEBUG === "true";
