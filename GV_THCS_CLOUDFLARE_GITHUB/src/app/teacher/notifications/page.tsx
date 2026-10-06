"use client";

import { Bell, CheckCheck, Search } from "lucide-react";
import { collection, doc, limit, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch, type DocumentData } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";

type NotificationRow = DocumentData & { id: string };

export default function TeacherNotificationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    return onSnapshot(
      query(collection(firestore, "notifications"), where("userId", "==", user.uid), limit(100)),
      (snapshot) => {
        setRows(snapshot.docs.map((document): NotificationRow => ({ id: document.id, ...document.data() }))
          .sort((a, b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0)));
        setLoading(false);
      },
      (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); },
    );
  }, [user]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => (!unreadOnly || row.read !== true) && (!keyword || [row.title, row.body, row.type].filter(Boolean).some((value) => String(value).toLocaleLowerCase("vi").includes(keyword))));
  }, [rows, search, unreadOnly]);

  async function markRead(row: NotificationRow) {
    if (!user || row.read === true) return;
    await updateDoc(doc(firestore, "notifications", row.id), { read: true, readAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user.uid });
  }

  async function markAllRead() {
    if (!user) return;
    const unread = rows.filter((row) => row.read !== true);
    if (!unread.length) return;
    setUpdating(true);
    setError("");
    try {
      const batch = writeBatch(firestore);
      unread.forEach((row) => batch.update(doc(firestore, "notifications", row.id), { read: true, readAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user.uid }));
      await batch.commit();
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc.");
    } catch (updateError) {
      setError(firebaseDataErrorMessage(updateError));
    } finally {
      setUpdating(false);
    }
  }

  const unreadCount = rows.filter((row) => row.read !== true).length;

  return <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}><Shell>
    <PageHeader eyebrow="Thông báo" title="Thông báo cá nhân" description="Theo dõi thông báo phân công giảng dạy, kết quả duyệt nghỉ phép và các thông tin từ nhà trường." actions={<Button variant="secondary" loading={updating} disabled={unreadCount === 0} onClick={markAllRead}><CheckCheck className="h-4 w-4" />Đánh dấu tất cả đã đọc</Button>} />
    {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><Card className="p-5"><p className="text-sm text-muted-foreground">Tổng thông báo</p><p className="mt-2 text-3xl font-extrabold">{rows.length}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Chưa đọc</p><p className="mt-2 text-3xl font-extrabold text-rose-600">{unreadCount}</p></Card></div>
    <Card className="mb-5 p-4"><div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm nội dung thông báo..." /></div><label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Chỉ chưa đọc</label></div></Card>
    <Card className="overflow-hidden">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton className="h-20" key={i} />)}</div> : filtered.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="Không có thông báo phù hợp" description="Thông báo mới sẽ xuất hiện tại đây." /> : <div className="divide-y divide-border">{filtered.map((row) => { const content = <div className="flex gap-3 p-4 transition hover:bg-muted/60"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${row.read === true ? "bg-muted-foreground/25" : "bg-rose-500"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-bold">{row.title || "Thông báo"}</p><Badge tone={row.read === true ? "neutral" : "info"}>{row.read === true ? "Đã đọc" : "Mới"}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{row.body || "Có cập nhật mới."}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(row.createdAt)}</p></div></div>; return row.href ? <Link key={row.id} href={String(row.href)} onClick={() => void markRead(row)}>{content}</Link> : <button className="w-full text-left" key={row.id} onClick={() => void markRead(row)}>{content}</button>; })}</div>}</Card>
  </Shell></RoleGuard>;
}
