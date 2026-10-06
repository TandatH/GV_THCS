"use client";

import { DoorOpen, Search } from "lucide-react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

type Row = DocumentData & { id: string };

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function catalogName(rows: Row[], id: unknown) {
  const value = text(id);
  if (!value) return "";
  const row = rows.find((item) => item.id === value);
  return text(row?.fullName) || text(row?.name) || text(row?.displayName) || text(row?.code) || value;
}

export default function BghRoomsPage() {
  const [rooms, setRooms] = useState<Row[]>([]);
  const [campuses, setCampuses] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubscribers = [
      onSnapshot(collection(firestore, "rooms"), (snap) => {
        setRooms(
          snap.docs
            .map((d): Row => ({ id: d.id, ...d.data() } as Row))
            .sort((a, b) => text(a.name || a.code).localeCompare(text(b.name || b.code), "vi")),
        );
        setLoading(false);
      }, (e) => {
        setError(firebaseDataErrorMessage(e));
        setLoading(false);
      }),
      onSnapshot(collection(firestore, "campuses"), (snap) => {
        setCampuses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];

    return () => unsubscribers.forEach((u) => u());
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return rooms.filter((r) => {
      if (!q) return true;
      const haystack = [
        r.name,
        r.code,
        r.roomType,
        catalogName(campuses, r.campusId),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLocaleLowerCase("vi"))
        .join(" ");
      return haystack.includes(q);
    });
  }, [campuses, rooms, search]);

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Ban Giám hiệu"
          title="Phòng học & Cơ sở vật chất"
          description="Theo dõi hiện trạng phòng học, phòng chức năng và sức chứa phục vụ công tác xếp thời khóa biểu."
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <Card className="mb-5 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên phòng, mã phòng, loại phòng, cơ sở…"
            />
          </div>
        </Card>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton className="h-14" key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<DoorOpen className="h-6 w-6" />}
              title="Không tìm thấy phòng học"
              description="Không có phòng học nào khớp với điều kiện tìm kiếm."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[800px]">
                <thead>
                  <tr>
                    <th>Mã phòng</th>
                    <th>Tên phòng</th>
                    <th>Cơ sở</th>
                    <th>Loại phòng</th>
                    <th>Sức chứa</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <code className="rounded bg-muted px-2 py-1 text-xs font-semibold">
                          {r.code || r.id}
                        </code>
                      </td>
                      <td className="font-bold text-slate-900">{r.name || "—"}</td>
                      <td>{catalogName(campuses, r.campusId) || "Cơ sở chính"}</td>
                      <td>
                        <Badge tone="neutral">{r.roomType || "Phòng lý thuyết"}</Badge>
                      </td>
                      <td>{r.capacity ? `${r.capacity} chỗ` : "Tiêu chuẩn"}</td>
                      <td>
                        <Badge tone={r.isActive !== false ? "success" : "danger"}>
                          {r.isActive !== false ? "Khả dụng" : "Tạm khóa"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Shell>
    </RoleGuard>
  );
}
