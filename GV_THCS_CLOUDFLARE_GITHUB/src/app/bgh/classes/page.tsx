"use client";

import { GraduationCap, Search } from "lucide-react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";

type Row = DocumentData & { id: string };

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numericGrade(value: unknown) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 1 && grade <= 9 ? grade : 0;
}

function schoolLevelForGrade(grade: number) {
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  return "";
}

function classSchoolLevel(row: Row) {
  const explicit = text(row.schoolLevel);
  if (explicit === "primary" || explicit === "secondary") return explicit;
  return schoolLevelForGrade(numericGrade(row.grade ?? row.gradeLevel));
}

function catalogName(rows: Row[], id: unknown) {
  const value = text(id);
  if (!value) return "";
  const row = rows.find((item) => item.id === value);
  return text(row?.fullName) || text(row?.name) || text(row?.displayName) || text(row?.code) || value;
}

export default function BghClassesPage() {
  const { claims, loading: authLoading } = useAuth();
  const schoolLevel = (typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary") as "primary" | "secondary" | "all";
  const levelName = schoolLevel === "primary" ? "Tiểu học" : schoolLevel === "secondary" ? "THCS" : "Toàn trường";

  const [classes, setClasses] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [rooms, setRooms] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError("");

    const unsubscribers = [
      onSnapshot(collection(firestore, "classes"), (snap) => {
        setClasses(
          snap.docs
            .map((d): Row => ({ id: d.id, ...d.data() } as Row))
            .sort((a, b) => text(a.name || a.code).localeCompare(text(b.name || b.code), "vi")),
        );
        setLoading(false);
      }, (e) => {
        setError(firebaseDataErrorMessage(e));
        setLoading(false);
      }),
      onSnapshot(collection(firestore, "teachers"), (snap) => {
        setTeachers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(firestore, "rooms"), (snap) => {
        setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];

    return () => unsubscribers.forEach((u) => u());
  }, [authLoading]);

  // Scoped to BGH's school level
  const scopedClasses = useMemo(() => {
    if (schoolLevel === "all") return classes;
    return classes.filter((c) => classSchoolLevel(c) === schoolLevel);
  }, [classes, schoolLevel]);

  const availableGrades = useMemo(() => {
    const set = new Set<number>();
    scopedClasses.forEach((c) => {
      const g = numericGrade(c.grade ?? c.gradeLevel);
      if (g) set.add(g);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [scopedClasses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return scopedClasses.filter((c) => {
      const g = numericGrade(c.grade ?? c.gradeLevel);
      if (gradeFilter !== "all" && String(g) !== gradeFilter) return false;
      if (!q) return true;
      const haystack = [
        c.name,
        c.code,
        catalogName(teachers, c.homeroomTeacherId),
        catalogName(rooms, c.roomId),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLocaleLowerCase("vi"))
        .join(" ");
      return haystack.includes(q);
    });
  }, [gradeFilter, rooms, scopedClasses, search, teachers]);

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Ban Giám hiệu"
          title={`Lớp học · ${levelName}`}
          description="Theo dõi quy mô lớp, khối lớp, giáo viên chủ nhiệm và phòng học thuộc phạm vi phụ trách."
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Tổng số lớp học</p>
            <p className="mt-2 text-3xl font-extrabold">{scopedClasses.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Khối lớp phụ trách</p>
            <p className="mt-2 text-3xl font-extrabold">{availableGrades.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Đã gán GVCN</p>
            <p className="mt-2 text-3xl font-extrabold">
              {scopedClasses.filter((c) => Boolean(c.homeroomTeacherId)).length}
            </p>
          </Card>
        </div>

        <Card className="mb-5 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên lớp, mã lớp, GV chủ nhiệm, phòng học…"
              />
            </div>
            <select
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
            >
              <option value="all">Tất cả khối</option>
              {availableGrades.map((g) => (
                <option key={g} value={String(g)}>
                  Khối {g}
                </option>
              ))}
            </select>
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
              icon={<GraduationCap className="h-6 w-6" />}
              title="Không tìm thấy lớp học"
              description="Không có lớp học nào khớp điều kiện tìm kiếm."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[950px]">
                <thead>
                  <tr>
                    <th>Mã lớp</th>
                    <th>Tên lớp</th>
                    <th>Khối</th>
                    <th>Cấp học</th>
                    <th>Giáo viên chủ nhiệm</th>
                    <th>Phòng học</th>
                    <th>Ca học</th>
                    <th>Sĩ số</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const grade = numericGrade(c.grade ?? c.gradeLevel);
                    const lvl = classSchoolLevel(c);
                    const homeroom = catalogName(teachers, c.homeroomTeacherId);
                    const room = catalogName(rooms, c.roomId);
                    return (
                      <tr key={c.id}>
                        <td>
                          <code className="rounded bg-muted px-2 py-1 text-xs font-semibold">
                            {c.code || c.id}
                          </code>
                        </td>
                        <td className="font-bold text-slate-900">{c.name || "—"}</td>
                        <td>{grade ? `Khối ${grade}` : "—"}</td>
                        <td>
                          <Badge tone={lvl === "primary" ? "success" : "info"}>
                            {lvl === "primary" ? "Tiểu học" : "THCS"}
                          </Badge>
                        </td>
                        <td>
                          <p className="font-medium">{homeroom || "Chưa phân công"}</p>
                        </td>
                        <td>{room || "—"}</td>
                        <td>
                          <Badge tone="neutral">
                            {c.session === "morning" ? "Buổi sáng" : c.session === "afternoon" ? "Buổi chiều" : "Cả ngày"}
                          </Badge>
                        </td>
                        <td>{c.studentCount ? `${c.studentCount} HS` : "—"}</td>
                        <td>
                          <Badge tone={c.isActive !== false ? "success" : "danger"}>
                            {c.isActive !== false ? "Đang hoạt động" : "Ngừng hoạt động"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Shell>
    </RoleGuard>
  );
}
