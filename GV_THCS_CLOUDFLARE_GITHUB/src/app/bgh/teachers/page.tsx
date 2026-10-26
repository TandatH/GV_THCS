"use client";

import { Download, FileSpreadsheet, Search, UsersRound } from "lucide-react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { cn, formatCurrency, initials } from "@/lib/utils";
import {
  exportTeachersToExcel,
  exportTeachersToXml,
  formatDob,
  getTeacherHomeroomClassNames,
  getTeacherSubjectNames,
  normalizeSchoolLevels,
  teachingRoleLabel,
} from "@/lib/exports/teacher-export";

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
  const [classes, setClasses] = useState<Row[]>([]);
  const [schoolYears, setSchoolYears] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [levelTab, setLevelTab] = useState<"all" | "primary" | "secondary">("all");

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
      onSnapshot(collection(firestore, "classes"), (snap) => {
        setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
      onSnapshot(collection(firestore, "schoolYears"), (snap) => {
        setSchoolYears(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const homeroomClassesByTeacherId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of classes) {
      if (c.homeroomTeacherId) {
        const list = map.get(c.homeroomTeacherId) || [];
        list.push(c.name || c.code || c.id);
        map.set(c.homeroomTeacherId, list);
      }
    }
    return map;
  }, [classes]);

  const countPrimary = useMemo(
    () => scopedRows.filter((r) => normalizeSchoolLevels(r.schoolLevels).includes("primary")).length,
    [scopedRows],
  );
  const countSecondary = useMemo(
    () => scopedRows.filter((r) => normalizeSchoolLevels(r.schoolLevels).includes("secondary")).length,
    [scopedRows],
  );

  const activeSchoolYearName = useMemo(() => {
    const active = schoolYears.find((y) => y.isActive) || schoolYears[0];
    return active ? (text(active.name) || text(active.code) || "2025 - 2026") : "2025 - 2026";
  }, [schoolYears]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("vi");
    return scopedRows.filter((r) => {
      if (typeFilter !== "all" && r.teacherType !== typeFilter) return false;
      if (departmentFilter !== "all" && r.departmentId !== departmentFilter) return false;
      const levels = normalizeSchoolLevels(r.schoolLevels);
      if (levelTab !== "all" && !levels.includes(levelTab)) return false;

      if (!q) return true;
      const homerooms = homeroomClassesByTeacherId.get(r.id)?.join(" ") || "";
      const subjectsStr = getTeacherSubjectNames(r, subjects);
      const haystack = [
        r.fullName,
        r.teacherCode,
        r.email,
        r.phone,
        r.address,
        r.dob,
        r.religion,
        r.positionTitle,
        r.degree,
        r.bankAccountNumber,
        r.bankName,
        r.specialization,
        catalogName(departments, r.departmentId),
        homerooms,
        subjectsStr,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLocaleLowerCase("vi"))
        .join(" ");
      return haystack.includes(q);
    });
  }, [departmentFilter, departments, homeroomClassesByTeacherId, levelTab, scopedRows, search, subjects, typeFilter]);

  const coHuuCount = scopedRows.filter((r) => r.teacherType === "co_huu").length;
  const thinhGiangCount = scopedRows.filter((r) => r.teacherType === "thinh_giang").length;

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow="Ban Giám hiệu"
          title={`Hồ sơ Giáo viên · ${levelName}`}
          description="Tra cứu hồ sơ cán bộ, chuyên môn đào tạo, môn/khối được phân công và định mức tiết của giáo viên thuộc cấp học phụ trách."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => exportTeachersToExcel(scopedRows, classes, subjects, departments, activeSchoolYearName)}
                className="gap-1.5"
                title="Xuất danh sách giáo viên ra file Excel mẫu chuẩn Tam Hà (gồm cả Tiểu học, THCS và chi tiết)"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Xuất Excel (.xlsx)
              </Button>
              <Button
                variant="secondary"
                onClick={() => exportTeachersToXml(scopedRows, classes, subjects, departments, activeSchoolYearName)}
                className="gap-1.5"
                title="Xuất file XML danh sách giáo viên chuẩn Tam Hà"
              >
                <Download className="h-4 w-4 text-blue-600" />
                Xuất XML
              </Button>
            </div>
          }
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 border bg-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Tổng giáo viên</p>
            <p className="mt-1.5 text-2xl font-black text-foreground">{scopedRows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{levelName}</p>
          </Card>
          <Card className="p-4 border bg-sky-500/5 border-sky-500/20">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase">Cấp 1 - Tiểu học</p>
            <p className="mt-1.5 text-2xl font-black text-sky-700 dark:text-sky-300">{countPrimary}</p>
            <p className="text-xs text-sky-600/80 mt-0.5">Giáo viên phụ trách khối 1–5</p>
          </Card>
          <Card className="p-4 border bg-purple-500/5 border-purple-500/20">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase">Cấp 2 - THCS</p>
            <p className="mt-1.5 text-2xl font-black text-purple-700 dark:text-purple-300">{countSecondary}</p>
            <p className="text-xs text-purple-600/80 mt-0.5">Giáo viên phụ trách khối 6–9</p>
          </Card>
          <Card className="p-4 border bg-emerald-500/5 border-emerald-500/20">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase">GV Chủ nhiệm</p>
            <p className="mt-1.5 text-2xl font-black text-emerald-700 dark:text-emerald-300">
              {classes.filter((c) => Boolean(c.homeroomTeacherId)).length}
            </p>
            <p className="text-xs text-emerald-600/80 mt-0.5">Lớp đã có GVCN phụ trách</p>
          </Card>
        </div>

        <Card className="overflow-hidden">
          {/* TAB CHUYỂN NHANH CẤP 1 VÀ CẤP 2 */}
          <div className="flex border-b border-border bg-muted/20 px-4 pt-2 gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setLevelTab("all")}
              className={cn(
                "px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
                levelTab === "all"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-background/80 rounded-t-lg shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span>Toàn trường ({scopedRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setLevelTab("primary")}
              className={cn(
                "px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
                levelTab === "primary"
                  ? "border-sky-600 text-sky-600 dark:text-sky-400 bg-background/80 rounded-t-lg shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span>Cấp 1 - Tiểu học ({countPrimary})</span>
            </button>
            <button
              type="button"
              onClick={() => setLevelTab("secondary")}
              className={cn(
                "px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap",
                levelTab === "secondary"
                  ? "border-purple-600 text-purple-600 dark:text-purple-400 bg-background/80 rounded-t-lg shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span>Cấp 2 - THCS ({countSecondary})</span>
            </button>
          </div>

          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo họ tên, mã GV, email, SĐT, lớp CN, môn dạy, địa chỉ..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportTeachersToExcel(filtered, classes, subjects, departments, activeSchoolYearName)}
                className="h-11 gap-1.5 text-xs font-semibold"
                title="Xuất file Excel cho danh sách đang hiển thị"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Xuất Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportTeachersToXml(filtered, classes, subjects, departments, activeSchoolYearName)}
                className="h-11 gap-1.5 text-xs font-semibold"
                title="Xuất file XML cho danh sách đang hiển thị"
              >
                <Download className="h-4 w-4 text-blue-600" />
                Xuất XML
              </Button>
            </div>
          </div>

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
              <table className="data-table min-w-[1600px]">
                <thead>
                  <tr>
                    <th>Giáo viên</th>
                    <th>Cấp học</th>
                    <th>Bộ môn / Tổ</th>
                    <th>Môn giảng dạy (GVBM)</th>
                    <th>Lớp chủ nhiệm (GVCN)</th>
                    <th>Địa chỉ nhà</th>
                    <th>Số TK &amp; Ngân hàng</th>
                    <th>Bằng cấp</th>
                    <th>Hình thức</th>
                    <th>Chuyên môn</th>
                    <th>Định mức</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const assignedSubjects = getTeacherSubjectNames(row, subjects);
                    const homerooms = homeroomClassesByTeacherId.get(row.id) || [];
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
                              <p className="font-semibold text-foreground">{row.fullName || "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.teacherCode ? `[${row.teacherCode}] ` : ""}{row.email || row.phone || "—"}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {row.phone && <span className="text-[11px] text-muted-foreground">{row.phone}</span>}
                                {row.dob ? <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.2 rounded font-mono">NS: {formatDob(row.dob)}</span> : null}
                                {row.religion && row.religion !== "Không" ? <span className="text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">TG: {row.religion}</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(Array.isArray(row.schoolLevels) ? row.schoolLevels : []).map((lvl: string) => (
                              <Badge key={lvl} tone={lvl === "primary" ? "info" : "neutral"}>
                                {lvl === "primary" ? "Tiểu học" : "THCS"}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          <p className="font-semibold">{catalogName(departments, row.departmentId) || "—"}</p>
                          {row.homeroomDepartmentId ? (
                            <span className="inline-block mt-0.5 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
                              GVCN: {catalogName(departments, row.homeroomDepartmentId) || row.homeroomDepartmentId}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <p className="max-w-xs text-xs font-semibold text-foreground whitespace-normal">{assignedSubjects}</p>
                        </td>
                        <td>
                          {homerooms.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {homerooms.map((cName) => (
                                <Badge key={cName} tone="success" className="font-bold">
                                  Lớp {cName}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td>
                          <p className="text-xs max-w-44 truncate" title={row.address || "Chưa cập nhật"}>
                            {row.address || <span className="text-muted-foreground">—</span>}
                          </p>
                        </td>
                        <td>
                          {row.bankAccountNumber ? (
                            <div className="text-xs">
                              <code className="font-mono font-bold text-foreground">{row.bankAccountNumber}</code>
                              {row.bankName && <p className="text-[11px] text-muted-foreground truncate max-w-36">{row.bankName}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td>
                          <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                            {row.degree || "Đại học"}
                          </span>
                        </td>
                        <td>
                          <Badge tone={row.teacherType === "co_huu" ? "info" : "warning"}>
                            {row.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng"}
                          </Badge>
                        </td>
                        <td>
                          <p className="text-xs font-medium">{row.specialization || "—"}</p>
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
