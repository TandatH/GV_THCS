"use client";

import { useEffect } from "react";

export default function HomePage() {
  useEffect(() => {
    window.location.replace("/dashboard/");
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <p>Đang chuyển đến trang tổng quan…</p>
    </main>
  );
}
