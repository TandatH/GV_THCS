"use client";

import { arrayUnion, doc, setDoc } from "firebase/firestore";
import { firebaseApp, firestore } from "./client";
import { firebaseVapidKey } from "./public-config";

export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Âm nốt 1 (D5 - 587.33Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Âm nốt 2 cao hơn (A5 - 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    // Không ném lỗi nếu trình duyệt chặn phát âm thanh trước tương tác
  }
}

export function showDesktopNotification(title: string, options?: NotificationOptions) {
  if (!isNotificationSupported() || Notification.permission !== "granted") return null;

  try {
    playNotificationSound();
    const notification = new Notification(title, {
      icon: "/logo.png",
      badge: "/icon.svg",
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      const targetUrl = (options as { data?: { url?: string } })?.data?.url;
      if (targetUrl) {
        window.location.href = targetUrl;
      }
      notification.close();
    };

    return notification;
  } catch {
    // Dự phòng qua service worker registration nếu có
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          icon: "/logo.png",
          badge: "/icon.svg",
          ...options,
        });
      }).catch(() => undefined);
    }
    return null;
  }
}

export async function registerPushNotification(userId?: string): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!isNotificationSupported()) {
    return { success: false, error: "Trình duyệt không hỗ trợ thông báo đẩy." };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, error: "Bạn chưa cấp quyền nhận thông báo trên trình duyệt." };
    }

    // Đăng ký Service Worker
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    // Khởi tạo Firebase Messaging
    const { getMessaging, getToken, isSupported: isMessagingSupported } = await import("firebase/messaging");
    if (!(await isMessagingSupported())) {
      // Dù FCM messaging không hỗ trợ, HTML5 Notification vẫn hoạt động tốt
      return { success: true };
    }

    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token && userId) {
      // Lưu FCM Token vào Firestore của User
      try {
        await setDoc(
          doc(firestore, "users", userId),
          {
            fcmTokens: arrayUnion(token),
            lastFcmToken: token,
            fcmUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (saveError) {
        console.warn("Không thể lưu token vào Firestore user:", saveError);
      }
    }

    return { success: true, token };
  } catch (err) {
    console.error("Lỗi đăng ký nhận thông báo:", err);
    return { success: false, error: (err as Error)?.message || "Không thể đăng ký nhận thông báo." };
  }
}

export async function listenForegroundMessages(onMessageCallback?: (payload: unknown) => void) {
  if (!isNotificationSupported()) return () => {};

  try {
    const { getMessaging, onMessage, isSupported: isMessagingSupported } = await import("firebase/messaging");
    if (!(await isMessagingSupported())) return () => {};

    const messaging = getMessaging(firebaseApp);
    return onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || "Hệ thống Quản lý Giáo viên";
      const body = payload.notification?.body || payload.data?.body || "Bạn có thông báo mới.";
      const targetUrl = payload.data?.url || "/teacher/notifications";

      showDesktopNotification(title, {
        body,
        data: { url: targetUrl },
      });

      if (onMessageCallback) {
        onMessageCallback(payload);
      }
    });
  } catch {
    return () => {};
  }
}
