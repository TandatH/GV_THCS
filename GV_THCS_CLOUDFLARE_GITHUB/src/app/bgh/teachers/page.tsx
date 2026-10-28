"use client";

import { BookOpen, Download, FileSpreadsheet, Search, ShieldCheck, UsersRound } from "lucide-react";
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
  exportTeachersChuyenMonToExcel,
  exportTeachersToExcel,
  exportTeachersToXml,
  formatDob,
  getTeacherDetailedAssignments,
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
  const { claims, role, loading: authLoading } = useAuth();
  const schoolLevel = (typeof claims?.schoolLevel === "string" ? claims.schoolLevel : "secondary") as "primary" | "secondary" | "all";
  const isPrincipal = (role === "bgh" && claims?.bghPosition === "hieutruong") || role === "admin";
  const positionTitle = isPrincipal ? "Hiệu trưởng" : "Phó Hiệu trưởng";

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

      // PHT chỉ tìm kiếm theo thông tin chuyên môn, không tìm theo SĐT, ngày sinh, địa chỉ, tài khoản ngân hàng
      const haystackFields = isPrincipal
        ? [
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
        : [
            r.fullName,
            r.teacherCode,
            r.positionTitle,
            r.specialization,
            catalogName(departments, r.departmentId),
            homerooms,
            subjectsStr,
          ];

      const haystack = haystackFields
        .filter(Boolean)
        .map((v) => String(v).toLocaleLowerCase("vi"))
        .join(" ");
      return haystack.includes(q);
    });
  }, [departmentFilter, departments, homeroomClassesByTeacherId, isPrincipal, levelTab, scopedRows, search, subjects, typeFilter]);

  return (
    <RoleGuard allowedRoles={["bgh"]}>
      <Shell>
        <PageHeader
          eyebrow={isPrincipal ? "Ban Giám hiệu · Hiệu trưởng" : "Ban Giám hiệu · Phó Hiệu trưởng (Quản lý Chuyên môn)"}
          title={isPrincipal ? `Hồ sơ Giáo viên · ${levelName}` : `Phân công Chuyên môn & Môn giảng dạy · ${levelName}`}
          description={
            isPrincipal
              ? "Tra cứu toàn bộ hồ sơ cán bộ, lý lịch, thông tin liên lạc, tài khoản ngân hàng, chuyên môn đào tạo, môn/khối được phân công và định mức tiết của giáo viên."
              : "Theo dõi chuyên môn đào tạo, tổ bộ môn, môn giảng dạy (GVBM) và phân công khối lớp của giáo viên thuộc cấp học phụ trách."
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isPrincipal ? (
                <>
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
                </>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => exportTeachersChuyenMonToExcel(scopedRows, classes, subjects, departments, activeSchoolYearName)}
                  className="gap-1.5"
                  title="Xuất danh sách chuyên môn và môn giảng dạy ra Excel (bảo mật thông tin cá nhân)"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Xuất Excel Chuyên môn (.xlsx)
                </Button>
              )}
            </div>
          }
        />

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* Role & Scope Banner */}
        <div
          className={cn(
            "mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
            isPrincipal
              ? "border-blue-200/80 bg-gradient-to-r from-blue-50/90 to-indigo-50/70"
              : "border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-orange-50/70",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm",
                isPrincipal ? "bg-blue-600 shadow-blue-500/30" : "bg-amber-600 shadow-amber-500/30",
              )}
            >
              {isPrincipal ? <ShieldCheck className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
            </div>
            <div>
              <p className={cn("text-sm font-bold", isPrincipal ? "text-blue-950" : "text-amber-950")}>
                Vai trò: {positionTitle} · {isPrincipal ? "Xem toàn bộ hồ sơ giáo viên" : "Chế độ Quản lý Chuyên môn & Môn dạy"}
              </p>
              <p className={cn("text-xs", isPrincipal ? "text-blue-800/80" : "text-amber-800/80")}>
                {isPrincipal
                  ? "Hiệu trưởng được cấp quyền tra cứu đầy đủ lý lịch cán bộ, số điện thoại, ngày sinh, địa chỉ, tài khoản ngân hàng và định mức/lương."
                  : "Phó Hiệu trưởng phụ trách quản lý chuyên môn, tổ bộ môn và môn giảng dạy. Thông tin cá nhân, địa chỉ, tài khoản và lương/định mức được bảo mật."}
              </p>
            </div>
          </div>
          <div>
            <Badge tone={isPrincipal ? "info" : "warning"}>
              {isPrincipal ? "Toàn quyền BGH" : "Chuyên môn BGH"}
            </Badge>
          </div>
        </div>

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
                placeholder={
                  isPrincipal
                    ? "Tìm theo họ tên, mã GV, email, SĐT, lớp CN, môn dạy, địa chỉ..."
                    : "Tìm theo họ tên, mã GV, môn dạy, tổ bộ môn, lớp chủ nhiệm..."
                }
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
              {isPrincipal ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => exportTeachersToExcel(filtered, classes, subjects, departments, activeSchoolYearName)}
                    className="h-11 gap-1.5 text-xs font-semibold"
                    title="Xuất file Excel toàn bộ hồ sơ cho danh sách đang hiển thị"
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
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => exportTeachersChuyenMonToExcel(filtered, classes, subjects, departments, activeSchoolYearName)}
                  className="h-11 gap-1.5 text-xs font-semibold"
                  title="Xuất danh sách phân công chuyên môn cho danh sách đang hiển thị"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Xuất Excel Chuyên môn
                </Button>
              )}
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
              <table className={cn("data-table", isPrincipal ? "min-w-[1600px]" : "min-w-[1100px]")}>
                <thead>
                  <tr>
                    <th>Giáo viên</th>
                    <th>Cấp học</th>
                    <th>Bộ môn / Tổ</th>
                    <th className={!isPrincipal ? "bg-blue-50/70 text-blue-900" : ""}>
                      Môn giảng dạy (GVBM)
                    </th>
                    <th>Lớp chủ nhiệm (GVCN)</th>
                    {isPrincipal && <th>Địa chỉ nhà</th>}
                    {isPrincipal && <th>Số TK &amp; Ngân hàng</th>}
                    {isPrincipal && <th>Bằng cấp</th>}
                    <th>Hình thức</th>
                    <th>Chuyên môn</th>
                    {isPrincipal && <th>Định mức</th>}
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const detailedSubjects = getTeacherDetailedAssignments(row, subjects);
                    const homerooms = homeroomClassesByTeacherId.get(row.id) || [];
                    return (
                      <tr key={row.id}>
                        {/* Giáo viên */}
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
                                {row.teacherCode ? (
                                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                    [{row.teacherCode}]
                                  </span>
                                ) : null}
                                {isPrincipal && (row.email || row.phone ? ` ${row.email || row.phone}` : "")}
                              </p>
                              {/* Thông tin nhạy cảm: CHỈ HIỂN THỊ KHI LÀ HIỆU TRƯỞNG */}
                              {isPrincipal && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  {row.phone && <span className="text-[11px] text-muted-foreground">{row.phone}</span>}
                                  {row.dob ? (
                                    <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.2 rounded font-mono">
                                      NS: {formatDob(row.dob)}
                                    </span>
                                  ) : null}
                                  {row.religion && row.religion !== "Không" ? (
                                    <span className="text-[11px] text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                                      TG: {row.religion}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Cấp học */}
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(Array.isArray(row.schoolLevels) ? row.schoolLevels : []).map((lvl: string) => (
                              <Badge key={lvl} tone={lvl === "primary" ? "info" : "neutral"}>
                                {lvl === "primary" ? "Tiểu học" : "THCS"}
                              </Badge>
                            ))}
                          </div>
                        </td>

                        {/* Bộ môn / Tổ */}
                        <td>
                          <p className="font-semibold">{catalogName(departments, row.departmentId) || "—"}</p>
                          {row.homeroomDepartmentId ? (
                            <span className="inline-block mt-0.5 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
                              GVCN: {catalogName(departments, row.homeroomDepartmentId) || row.homeroomDepartmentId}
                            </span>
                          ) : null}
                        </td>

                        {/* Môn giảng dạy (GVBM) - ĐẶC BIỆT NỔI BẬT ĐỂ PHT QUẢN LÝ CHUYÊN MÔN */}
                        <td>
                          {detailedSubjects.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {detailedSubjects.map((item, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200"
                                >
                                  <BookOpen className="h-3 w-3 text-blue-500 shrink-0" />
                                  <span>{item.subjectName}</span>
                                  {item.gradeLevels.length > 0 && (
                                    <span className="text-[10px] text-blue-600 bg-blue-100/70 px-1 rounded font-mono font-medium">
                                      K{item.gradeLevels.join(", ")}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Lớp chủ nhiệm (GVCN) */}
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

                        {/* Địa chỉ nhà: CHỈ HIỆN CHO HIỆU TRƯỞNG */}
                        {isPrincipal && (
                          <td>
                            <p className="text-xs max-w-44 truncate" title={row.address || "Chưa cập nhật"}>
                              {row.address || <span className="text-muted-foreground">—</span>}
                            </p>
                          </td>
                        )}

                        {/* Số TK & Ngân hàng: CHỈ HIỆN CHO HIỆU TRƯỞNG */}
                        {isPrincipal && (
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
                        )}

                        {/* Bằng cấp: CHỈ HIỆN CHO HIỆU TRƯỞNG */}
                        {isPrincipal && (
                          <td>
                            <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                              {row.degree || "Đại học"}
                            </span>
                          </td>
                        )}

                        {/* Hình thức */}
                        <td>
                          <Badge tone={row.teacherType === "co_huu" ? "info" : "warning"}>
                            {row.teacherType === "co_huu" ? "Cơ hữu" : "Thỉnh giảng"}
                          </Badge>
                        </td>

                        {/* Chuyên môn */}
                        <td>
                          <p className="text-xs font-medium">{row.specialization || "—"}</p>
                          {isPrincipal && row.degree && (
                            <p className="text-[11px] text-muted-foreground">{row.degree}</p>
                          )}
                        </td>

                        {/* Định mức: CHỈ HIỆN CHO HIỆU TRƯỞNG */}
                        {isPrincipal && (
                          <td>
                            {row.teacherType === "co_huu"
                              ? `${row.standardPeriodsPerWeek ?? 0} tiết/tuần`
                              : `${formatCurrency(Number(row.ratePerPeriod || 0))}/tiết`}
                          </td>
                        )}

                        {/* Trạng thái */}
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
