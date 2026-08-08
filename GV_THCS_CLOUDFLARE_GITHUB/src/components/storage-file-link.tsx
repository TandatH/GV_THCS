"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { getDownloadURL, ref } from "firebase/storage";
import { useState } from "react";

import { firebaseStorage } from "@/lib/firebase/client";

export function StorageFileLink({ path, label }: { path: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openFile() {
    setError("");
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    try {
      const url = await getDownloadURL(ref(firebaseStorage, path));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Không thể mở file hoặc bạn không có quyền truy cập.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm text-primary hover:bg-muted" onClick={openFile} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        <span className="truncate">{label || path.split("/").pop() || path}</span>
      </button>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
