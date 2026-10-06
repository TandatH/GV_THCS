"use client";

import { Search, UsersRound } from "lucide-react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatCurrency, initials } from "@/lib/utils";

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

export default function BghTeachersPage() {
  const { claims, loading: authLoading } = useAuth();
  const schoolLevel = (typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary") as "primary" | "secondary" | "all";

  const levelName = schoolLevel === "primary" ? "Tiểu học" : schoolLevel === "secondary" ? "THCS" : "Toàn trường";

  const [rows, setRows] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    setError("");

    const unsubscribers = [
      onSnapshot(collection(firestore, "teachers"), (snap) => {
        setRows(
          snap.docs
            .map((d): Row => ({ id: d.id, ...d.data() } as Row))
            .sort((a, b) => text(a.fullName).localeCompare(text(b.fullName), "vi")),
        );
        setLoading(false);
      }, (e) => {
        setError(firebaseDataErrorMessage(e));
        setLoading(false);
      }),
      onSnapshot(collection(firestore, "departments"), (snap) => {
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(firestore, "subjects"), (snap) => {
        setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];

    return () => unsubscribers.forEach((u) => u());
  }, [authLoading]);

  // Scoped to BGH's school level
  const scopedRows = useMemo(() => {
    if (schoolLevel === "all") return rows;
    return rows.filter((r) => {
      let levels: string[] = [];
      if (Array.isArray(r.schoolLevels) && r.schoolLevels.length > 0) {
        levels = r.schoolLevels.map(String);
      } else if (typeof r.schoolLevel === "string" && r.schoolLevel) {
        levels = [r.schoolLevel];
      } else {
        levels = ["secondary"]; // Mặc định THCS cho dữ liệu giáo viên hiện hữu
      }
      return levels.includes(schoolLevel);
    });
  }, [rows, schoolLevel]);

  const subjectNameMap = useMemo(
    () => new Map(subjects.map((s) => [s.id, text(s.name) || text(s.code) || s.id])),
    [subjects],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return scopedRows.filter((r) => {
      if (typeFilter !== "all" && r.teacherType !== typeFilter) return false;
      if (departmentFilter !== "all" && r.departmentId !== departmentFilter) return false;
      if (!q) return true;
      const haystack = [
        r.fullName,
        r.teacherCode,
        r.email,
        r.phone,
        r.specialization,
        catalogName(departments, r.departmentId),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLocaleLowerCase("vi"))
        .join(" ");
      return haystack.includes(q);
    });
  }, [departmentFilter, departments, scopedRows, search, typeFilter]);

  const coHuuCount = scopedRows.filter((r) => r.teacherType === "co_huu").length;
  const thinhGiangCount = scopedRows.filter((r) => r.teacherType === "thinh_giang").length;

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Ban Giám hiệu"
          title={`Hồ sơ Giáo viên · ${levelName}`}
          description="Tra cứu hồ sơ cán bộ, chuyên môn đào tạo, môn/khối được phân công và định mức tiết của giáo viên thuộc cấp học phụ trách."
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Tổng số giáo viên</p>
            <p className="mt-2 text-3xl font-extrabold">{scopedRows.length}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Giáo viên cơ hữu</p>
            <p className="mt-2 text-3xl font-extrabold">{coHuuCount}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Giáo viên thỉnh giảng</p>
            <p className="mt-2 text-3xl font-extrabold">{thinhGiangCount}</p>
          </Card>
        </div>

        <Card className="mb-5 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo họ tên, mã GV, email, SĐT, chuyên môn…"
              />
            </div>
            <select
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Tất cả hình thức</option>
              <option value="co_huu">Cơ hữu</option>
              <option value="thinh_giang">Thỉnh giảng</option>
            </select>
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
                <Skeleton className="h-16" key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="h-6 w-6" />}
              title="Không tìm thấy giáo viên"
              description="Không có giáo viên nào khớp với điều kiện tìm kiếm trong phạm vi cấp học."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1100px]">
                <thead>
                  <tr>
                    <th>Giáo viên</th>
                    <th>Bộ môn</th>
                    <th>Cấp học</th>
                    <th>Môn giảng dạy</th>
                    <th>Hình thức</th>
                    <th>Chuyên môn</th>
                    <th>Định mức</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const assignedSubjects = (Array.isArray(row.subjectIds) ? row.subjectIds : [])
                      .map((id: string) => subjectNameMap.get(id) || id)
                      .join(", ");
                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            {row.avatarUrl ? (
                              <img
                                alt={row.fullName || "GV"}
                                className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
                                src={String(row.avatarUrl)}
                              />
                            ) : (
                              <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                                {initials(row.fullName)}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold">{row.fullName || "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.teacherCode ? `[${row.teacherCode}] ` : ""}{row.email || row.phone || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>{catalogName(departments, row.departmentId) || "—"}</td>
                        <td>
                          <Badge tone="info">
                            {(Array.isArray(row.schoolLevels) ? row.schoolLevels : [])
                              .map((lvl) => (lvl === "primary" ? "Tiểu học" : "THCS"))
                              .join(" & ") || "THCS"}
                          </Badge>
                        </td>
                        <td>
                          <p className="max-w-xs text-xs font-medium">{assignedSubjects || "—"}</p>
                        </td>
                        <td>
                          <Badge tone={row.teacherType === "co_huu" ? "info" : "warning"}>
                            {row.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng"}
                          </Badge>
                        </td>
                        <td>
                          <p className="text-xs">{row.specialization || "—"}</p>
                          <p className="text-[11px] text-muted-foreground">{row.degree || ""}</p>
                        </td>
                        <td>
                          {row.teacherType === "co_huu"
                            ? `${row.standardPeriodsPerWeek ?? 0} tiết/tuần`
                            : `${formatCurrency(Number(row.ratePerPeriod || 0))}/tiết`}
                        </td>
                        <td>
                          <Badge tone={row.status === "active" ? "success" : "danger"}>
                            {row.status === "active" ? "Đang công tác" : "Ngừng hoạt động"}
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
