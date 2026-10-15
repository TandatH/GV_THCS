import type { FirebaseOptions } from "firebase/app";

const requiredConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "demo-api-key-preview",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "demo-preview.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "demo-preview-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "demo-preview.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "1234567890",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "1:1234567890:web:demopreview",
};

if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  console.warn("Chưa thiết lập NEXT_PUBLIC_FIREBASE_API_KEY. Giao diện đang chạy ở chế độ xem trước.");
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

export const firebaseVapidKey =
  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() ||
  "BBdx9klybR0j0px1bwJEj0g2sxOtU5eZicY8snNXB09tfFkl2hIBqKYmCjplx9aoqZRBC7zj42NI3sAK2rxPqCY";
