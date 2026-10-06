"use client";

import { BookOpen, Search } from "lucide-react";
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

function subjectSchoolLevel(row: Row) {
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

export default function BghSubjectsPage() {
  const { claims, loading: authLoading } = useAuth();
  const schoolLevel = (typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary") as "primary" | "secondary" | "all";
  const levelName = schoolLevel === "primary" ? "Tiểu học" : schoolLevel === "secondary" ? "THCS" : "Toàn trường";

  const [subjects, setSubjects] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError("");

    const unsubscribers = [
      onSnapshot(collection(firestore, "subjects"), (snap) => {
        setSubjects(
          snap.docs
            .map((d): Row => ({ id: d.id, ...d.data() } as Row))
            .sort((a, b) => text(a.name || a.code).localeCompare(text(b.name || b.code), "vi")),
        );
        setLoading(false);
      }, (e) => {
        setError(firebaseDataErrorMessage(e));
        setLoading(false);
      }),
      onSnapshot(collection(firestore, "departments"), (snap) => {
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];

    return () => unsubscribers.forEach((u) => u());
  }, [authLoading]);

  // Scoped to BGH's school level
  const scopedSubjects = useMemo(() => {
    if (schoolLevel === "all") return subjects;
    return subjects.filter((s) => {
      const lvl = subjectSchoolLevel(s);
      return !lvl || lvl === schoolLevel;
    });
  }, [subjects, schoolLevel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return scopedSubjects.filter((s) => {
      if (departmentFilter !== "all" && s.departmentId !== departmentFilter) return false;
      if (!q) return true;
      const haystack = [
        s.name,
        s.code,
        catalogName(departments, s.departmentId),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLocaleLowerCase("vi"))
        .join(" ");
      return haystack.includes(q);
    });
  }, [departmentFilter, departments, scopedSubjects, search]);

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Ban Giám hiệu"
          title={`Môn học · ${levelName}`}
          description="Theo dõi danh mục môn học, tổ bộ môn chuyên môn và khối lớp áp dụng."
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <Card className="mb-5 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên môn, mã môn, tổ bộ môn…"
              />
            </div>
            <select
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="all">Tất cả tổ bộ môn</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {catalogName(departments, d.id)}
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
              icon={<BookOpen className="h-6 w-6" />}
              title="Không tìm thấy môn học"
              description="Không có môn học nào khớp với bộ lọc."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[850px]">
                <thead>
                  <tr>
                    <th>Mã môn</th>
                    <th>Tên môn</th>
                    <th>Tổ bộ môn</th>
                    <th>Cấp học</th>
                    <th>Khối áp dụng</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const grade = numericGrade(s.grade ?? s.gradeLevel);
                    const lvl = subjectSchoolLevel(s);
                    return (
                      <tr key={s.id}>
                        <td>
                          <code className="rounded bg-muted px-2 py-1 text-xs font-semibold">
                            {s.code || s.id}
                          </code>
                        </td>
                        <td className="font-bold text-slate-900">{s.name || "—"}</td>
                        <td>{catalogName(departments, s.departmentId) || "—"}</td>
                        <td>
                          <Badge tone={lvl === "primary" ? "success" : "info"}>
                            {lvl === "primary" ? "Tiểu học" : "THCS"}
                          </Badge>
                        </td>
                        <td>{grade ? `Khối ${grade}` : "Tất cả khối"}</td>
                        <td>
                          <Badge tone={s.isActive !== false ? "success" : "danger"}>
                            {s.isActive !== false ? "Đang áp dụng" : "Ngừng áp dụng"}
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
