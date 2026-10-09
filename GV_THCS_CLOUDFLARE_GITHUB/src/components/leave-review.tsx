"use client";

import type { Role, SubstituteCandidate } from "@school/shared";
import {
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Search,
  Sparkles,
  UserRoundCheck,
  Users,
  XCircle,
} from "lucide-react";
import { collection, limit, onSnapshot, query, where, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/use-auth";
import { approveLeaveRequest, firebaseErrorMessage, suggestSubstituteTeachers } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";
import { addDaysDateOnly } from "@/lib/date-only";

import { PageHeader } from "./page-header";
import { Shell } from "./shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "./ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { StorageFileLink } from "./storage-file-link";

type LeaveRow = DocumentData & { id: string };
type ScheduleRow = DocumentData & { id: string };
type CatalogRow = DocumentData & { id: string };
type AffectedScheduleSummary = {
  scheduleId?: string;
  label?: string;
};

type ReviewState = {
  request: LeaveRow;
  decision: "da_duyet" | "tu_choi";
} | null;

function claimString(claims: Record<string, unknown> | null, key: string) {
  const value = claims?.[key];
  return typeof value === "string" && value ? value : null;
}

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    nhap: "Bản nháp",
    cho_duyet: "Chờ duyệt",
    da_duyet: "Đã duyệt",
    tu_choi: "Từ chối",
    da_bo_tri_day_thay: "Đã bố trí dạy thay",
    da_huy: "Đã hủy",
  };
  return typeof status === "string" ? labels[status] || status : "Không rõ";
}

function statusTone(status: unknown) {
  if (["da_duyet", "da_bo_tri_day_thay"].includes(String(status))) return "success" as const;
  if (["tu_choi", "da_huy"].includes(String(status))) return "danger" as const;
  if (status === "cho_duyet") return "warning" as const;
  return "neutral" as const;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function primaryCatalogName(row: CatalogRow) {
  return textValue(row.name) || textValue(row.fullName) || textValue(row.code) || row.id;
}

function catalogName(rows: CatalogRow[], id: unknown) {
  const value = textValue(id);
  if (!value) return "";
  const row = rows.find((item) => item.id === value);
  return row ? primaryCatalogName(row) : "";
}

function scheduleDate(schedule: ScheduleRow) {
  return addDaysDateOnly(String(schedule.weekStart || ""), Number(schedule.dayOfWeek || 2) - 2);
}

function scheduleLabel(schedule: ScheduleRow, subjects: CatalogRow[], classes: CatalogRow[], rooms: CatalogRow[]) {
  const start = Number(schedule.startPeriod || 0);
  const last = Number(schedule.endPeriod || 0) - 1;
  const periods = start > 0 && last >= start ? `${start}-${last}` : "chưa rõ";
  return `${formatDate(scheduleDate(schedule))} · ${schedule.subjectName || catalogName(subjects, schedule.subjectId) || schedule.subjectId || "Môn học"} · ${schedule.className || catalogName(classes, schedule.classId) || schedule.classId || "Lớp"} · ${schedule.roomName || catalogName(rooms, schedule.roomId) || schedule.roomId || "Phòng"} · tiết ${periods}`;
}

function affectedScheduleLabels(row: LeaveRow, schedules: ScheduleRow[], subjects: CatalogRow[], classes: CatalogRow[], rooms: CatalogRow[]) {
  const scheduleIds = Array.isArray(row.scheduleIds) ? row.scheduleIds.map((id) => String(id)).filter(Boolean) : [];
  const liveLabels = scheduleIds
    .map((scheduleId) => schedules.find((schedule) => schedule.id === scheduleId))
    .filter((schedule): schedule is ScheduleRow => Boolean(schedule))
    .map((schedule) => scheduleLabel(schedule, subjects, classes, rooms));
  if (liveLabels.length > 0) return liveLabels;

  const summaries = Array.isArray(row.affectedSchedules) ? row.affectedSchedules : [];
  const summaryLabels = summaries
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const summary = item as AffectedScheduleSummary;
      return textValue(summary.label) || textValue(summary.scheduleId);
    })
    .filter(Boolean);
  if (summaryLabels.length > 0) return summaryLabels;
  return scheduleIds;
}

function targetScheduleIdsForReview(row: LeaveRow, schedules: ScheduleRow[]) {
  const scheduleIds = Array.isArray(row.scheduleIds) ? row.scheduleIds.map(String).filter(Boolean) : [];
  if (row.status !== "da_bo_tri_day_thay") return scheduleIds;
  return scheduleIds.filter((scheduleId) => {
    const schedule = schedules.find((item) => item.id === scheduleId);
    return schedule?.teacherUnassigned === true || ["tu_choi", "qua_han"].includes(String(schedule?.confirmationStatus));
  });
}

function leaveDateText(row: LeaveRow) {
  return row.leaveDate ? formatDate(row.leaveDate) : row.date ? formatDate(row.date) : row.fromDate || row.toDate ? `${formatDate(row.fromDate)} - ${formatDate(row.toDate)}` : "—";
}

function timeline(row: LeaveRow) {
  const items = [
    { label: "Tạo đơn", at: row.createdAt, by: row.createdBy },
    row.submittedAt ? { label: "Gửi duyệt", at: row.submittedAt, by: row.updatedBy || row.createdBy } : null,
    row.reviewedAt ? { label: statusLabel(row.status), at: row.reviewedAt, by: row.reviewerId || row.updatedBy } : null,
  ];
  return items.filter(Boolean) as { label: string; at: unknown; by: unknown }[];
}

function catalogClassSchoolLevel(cls?: CatalogRow) {
  if (!cls) return "";
  if (cls.schoolLevel === "primary" || cls.schoolLevel === "secondary") return cls.schoolLevel;
  const grade = Number(cls.grade ?? cls.gradeLevel ?? 0);
  if (grade >= 1 && grade <= 5) return "primary";
  if (grade >= 6 && grade <= 9) return "secondary";
  const match = /^([1-9])/.exec(String(cls.name ?? cls.code ?? "").trim());
  if (match) {
    const g = Number(match[1]);
    if (g >= 1 && g <= 5) return "primary";
    if (g >= 6 && g <= 9) return "secondary";
  }
  return "";
}

function leaveSchoolLevel(
  row: LeaveRow,
  schedulesMap: Map<string, ScheduleRow>,
  classesMap: Map<string, CatalogRow>,
): string {
  const scheduleIds: string[] = Array.isArray(row.scheduleIds) ? row.scheduleIds.map(String).filter(Boolean) : [];
  for (const id of scheduleIds) {
    const s = schedulesMap.get(id);
    if (s) {
      if (s.schoolLevel === "primary" || s.schoolLevel === "secondary") return s.schoolLevel;
      if (s.classId) {
        const cls = classesMap.get(s.classId);
        const lvl = catalogClassSchoolLevel(cls);
        if (lvl) return lvl;
      }
    }
  }

  const summaries = Array.isArray(row.affectedSchedules) ? row.affectedSchedules : [];
  for (const item of summaries) {
    if (item && typeof item === "object") {
      const classId = String(item.classId ?? "");
      if (classId) {
        const cls = classesMap.get(classId);
        const lvl = catalogClassSchoolLevel(cls);
        if (lvl) return lvl;
      }
      const className = String(item.className ?? "").trim();
      if (className) {
        const match = /^([1-9])/.exec(className);
        if (match) {
          const g = Number(match[1]);
          if (g >= 1 && g <= 5) return "primary";
          if (g >= 6 && g <= 9) return "secondary";
        }
      }
    }
  }

  return "secondary";
}

export function LeaveReviewPage({ allowedRoles }: { allowedRoles: readonly Role[] }) {
  const { claims, role } = useAuth();
  const isReadOnly = false;
  const bghSchoolLevel = claimString(claims, "schoolLevel");
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [subjects, setSubjects] = useState<CatalogRow[]>([]);
  const [classes, setClasses] = useState<CatalogRow[]>([]);
  const [rooms, setRooms] = useState<CatalogRow[]>([]);
  const [teachers, setTeachers] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [detail, setDetail] = useState<LeaveRow | null>(null);

  // Review states
  const [review, setReview] = useState<ReviewState>(null);
  const [note, setNote] = useState("");
  const [substituteBySchedule, setSubstituteBySchedule] = useState<Record<string, string>>({});
  const [subjectBySchedule, setSubjectBySchedule] = useState<Record<string, string>>({});
  const [tabBySchedule, setTabBySchedule] = useState<Record<string, "suggest" | "manual">>({});
  const [filterModeBySchedule, setFilterModeBySchedule] = useState<Record<string, "all" | "same" | "other">>({});
  const [manualSearchBySchedule, setManualSearchBySchedule] = useState<Record<string, string>>({});
  const [candidatesBySchedule, setCandidatesBySchedule] = useState<Record<string, SubstituteCandidate[]>>({});
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const departmentId = claimString(claims, "departmentId");

  useEffect(() => {
    if (!role) return;
    const constraints: QueryConstraint[] = [limit(200)];
    if (role === "totruong") {
      if (!departmentId) {
        setError("Tài khoản tổ trưởng chưa có departmentId.");
        setLoading(false);
        return;
      }
      constraints.unshift(where("departmentId", "==", departmentId));
    }
    const leaveQuery = query(collection(firestore, "leaveRequests"), ...constraints);
    setLoading(true);
    setError("");
    return onSnapshot(
      leaveQuery,
      (snapshot) => {
        setRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      },
      (snapshotError) => {
        setError(firebaseDataErrorMessage(snapshotError));
        setLoading(false);
      },
    );
  }, [departmentId, role]);

  useEffect(() => {
    if (!role) return;
    const constraints: QueryConstraint[] = [limit(500)];
    if (role === "totruong") {
      if (!departmentId) return;
      constraints.unshift(where("departmentId", "==", departmentId));
    }
    setLookupError("");
    return onSnapshot(
      query(collection(firestore, "schedules"), ...constraints),
      (snapshot) => setSchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
      (snapshotError) => setLookupError(firebaseDataErrorMessage(snapshotError)),
    );
  }, [departmentId, role]);

  useEffect(() => {
    setLookupError("");
    const watchCatalog = (collectionName: string, setter: (rows: CatalogRow[]) => void) =>
      onSnapshot(
        query(collection(firestore, collectionName), limit(500)),
        (snapshot) => setter(snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))),
        (snapshotError) => setLookupError(firebaseDataErrorMessage(snapshotError)),
      );
    const unsubscribers = [
      watchCatalog("subjects", setSubjects),
      watchCatalog("classes", setClasses),
      watchCatalog("rooms", setRooms),
      watchCatalog("teachers", setTeachers),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const departments = useMemo(() => Array.from(new Set(rows.map((row) => String(row.departmentId || "")).filter(Boolean))), [rows]);
  const schedulesMap = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);
  const classesMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectsMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const activeTeachers = useMemo(() => teachers.filter((t) => t.status !== "inactive" && t.isActive !== false), [teachers]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      if (role === "bgh" && bghSchoolLevel && bghSchoolLevel !== "all") {
        const level = leaveSchoolLevel(row, schedulesMap, classesMap);
        if (level !== bghSchoolLevel) return false;
      }
      const matchesSearch = !keyword || [row.reason, row.teacherName, row.teacherId, row.departmentId, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || row.departmentId === departmentFilter;
      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [bghSchoolLevel, classesMap, departmentFilter, role, rows, schedulesMap, search, statusFilter]);

  async function openReview(request: LeaveRow, decision: "da_duyet" | "tu_choi") {
    setReview({ request, decision });
    setNote("");
    setSubstituteBySchedule({});
    setSubjectBySchedule({});
    setTabBySchedule({});
    setFilterModeBySchedule({});
    setManualSearchBySchedule({});
    setReviewError("");
    setCandidatesBySchedule({});

    if (decision !== "da_duyet") return;

    const scheduleIds = targetScheduleIdsForReview(request, schedules);
    if (scheduleIds.length === 0) {
      setReviewError("Đơn nghỉ phép chưa có tiết dạy bị ảnh hưởng.");
      return;
    }

    // Gán môn mặc định theo từng lịch
    const initialSubjects: Record<string, string> = {};
    for (const sid of scheduleIds) {
      const sch = schedules.find((s) => s.id === sid);
      if (sch?.subjectId) initialSubjects[sid] = String(sch.subjectId);
    }
    setSubjectBySchedule(initialSubjects);

    setLoadingCandidates(true);
    try {
      const results = await Promise.all(scheduleIds.map(async (scheduleId) => {
        const result = await suggestSubstituteTeachers(scheduleId);
        return [scheduleId, (result.candidates || []) as SubstituteCandidate[]] as const;
      }));
      const nextCandidates: Record<string, SubstituteCandidate[]> = {};
      const nextSelections: Record<string, string> = {};
      const nextTabs: Record<string, "suggest" | "manual"> = {};

      for (const [scheduleId, scheduleCandidates] of results) {
        nextCandidates[scheduleId] = scheduleCandidates;
        if (scheduleCandidates.length > 0 && scheduleCandidates[0]) {
          nextSelections[scheduleId] = scheduleCandidates[0].teacherId;
          nextTabs[scheduleId] = "suggest";
        } else {
          nextTabs[scheduleId] = "manual";
        }
      }
      setCandidatesBySchedule(nextCandidates);
      setSubstituteBySchedule(nextSelections);
      setTabBySchedule(nextTabs);
    } catch (suggestError) {
      setReviewError(firebaseErrorMessage(suggestError));
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) return;

    // 1. TỪ CHỐI ĐƠN NGHỈ PHÉP
    if (review.decision === "tu_choi") {
      if (!note.trim()) {
        setReviewError("Vui lòng nhập lý do từ chối.");
        return;
      }
      setSubmitting(true);
      setReviewError("");
      try {
        await approveLeaveRequest({
          leaveRequestId: review.request.id,
          decision: "tu_choi",
          note: note.trim(),
        });
        toast.success("Đã từ chối đơn nghỉ phép thành công.");
        setReview(null);
        setDetail(null);
        setNote("");
        setSubstituteBySchedule({});
        setCandidatesBySchedule({});
      } catch (submitError) {
        setReviewError(firebaseErrorMessage(submitError));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 2. PHÊ DUYỆT & BỐ TRÍ DẠY THAY
    const scheduleIds = targetScheduleIdsForReview(review.request, schedules);
    if (scheduleIds.some((scheduleId) => !substituteBySchedule[scheduleId])) {
      setReviewError("Vui lòng chọn giáo viên dạy thay cho từng lịch bị ảnh hưởng.");
      return;
    }

    setSubmitting(true);
    setReviewError("");
    try {
      const substitutions = scheduleIds.map((scheduleId) => {
        const sch = schedules.find((s) => s.id === scheduleId);
        const chosenSubjectId = subjectBySchedule[scheduleId];
        const isDifferentSubject = chosenSubjectId && chosenSubjectId !== sch?.subjectId;
        return {
          scheduleId,
          substituteTeacherId: substituteBySchedule[scheduleId],
          ...(isDifferentSubject ? { substituteSubjectId: chosenSubjectId } : {}),
        };
      });

      await approveLeaveRequest({
        leaveRequestId: review.request.id,
        decision: "da_duyet",
        note: note.trim() || undefined,
        substitutions,
      });

      toast.success("Đã duyệt và bố trí dạy thay thành công.");
      setReview(null);
      setDetail(null);
      setNote("");
      setSubstituteBySchedule({});
      setCandidatesBySchedule({});
    } catch (submitError) {
      setReviewError(firebaseErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={allowedRoles}>
      <Shell>
        <PageHeader
          eyebrow={role === "bgh" ? "Ban Giám Hiệu phê duyệt" : role === "totruong" ? "Tổ trưởng phê duyệt" : "Phê duyệt nghiệp vụ"}
          title="Đơn nghỉ phép"
          description={role === "bgh"
            ? `Xem chi tiết đơn nghỉ phép, lịch bị ảnh hưởng, minh chứng đính kèm và phê duyệt hoặc bố trí dạy thay cho cấp ${bghSchoolLevel === "primary" ? "Tiểu học" : bghSchoolLevel === "secondary" ? "THCS" : "toàn trường"}.`
            : "Xem chi tiết đơn nghỉ phép, lịch bị ảnh hưởng, minh chứng đính kèm và xử lý phê duyệt theo phân quyền."}
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {lookupError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Không thể tải đầy đủ thông tin lịch/tiết: {lookupError}</div> : null}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Tìm theo giáo viên, bộ môn, lý do..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Tất cả trạng thái</option>
                <option value="cho_duyet">Chờ duyệt</option>
                <option value="da_duyet">Đã duyệt</option>
                <option value="da_bo_tri_day_thay">Đã bố trí dạy thay</option>
                <option value="tu_choi">Từ chối</option>
                <option value="da_huy">Đã hủy</option>
              </select>
              {role === "admin" || role === "bgh" ? (
                <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                  <option value="all">Tất cả bộ môn</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20" />)}</div>
          ) : error ? null : filteredRows.length === 0 ? (
            <EmptyState icon={<Clock3 className="h-6 w-6" />} title="Chưa có dữ liệu" description="Không có đơn nghỉ phép phù hợp với bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1120px]">
                <thead><tr><th>Giáo viên</th><th>Bộ môn</th><th>Ngày nghỉ</th><th>Lịch/tiết bị ảnh hưởng</th><th>Lý do</th><th>Minh chứng đính kèm</th><th>Trạng thái</th><th>Thời gian gửi</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const attachments = Array.isArray(row.attachmentPaths) ? row.attachmentPaths : [];
                    const scheduleLabels = affectedScheduleLabels(row, schedules, subjects, classes, rooms);
                    return (
                      <tr key={row.id}>
                        <td><p className="font-semibold">{row.teacherName || row.teacherId || "—"}</p><p className="text-xs text-muted-foreground">ID: {row.teacherId || "—"}</p></td>
                        <td>{row.departmentId || "—"}</td>
                        <td>{leaveDateText(row)}</td>
                        <td><div className="max-w-sm space-y-1">{scheduleLabels.length > 0 ? scheduleLabels.slice(0, 2).map((label, index) => <p key={`${label}-${index}`} className="line-clamp-1 text-sm">{label}</p>) : "Chưa liên kết lịch"}{scheduleLabels.length > 2 ? <p className="text-xs text-muted-foreground">+{scheduleLabels.length - 2} lịch/tiết khác</p> : null}</div></td>
                        <td><p className="max-w-sm line-clamp-2">{row.reason || "—"}</p></td>
                        <td>{attachments.length > 0 ? `${attachments.length} tệp` : "—"}</td>
                        <td><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                        <td>{formatDate(row.submittedAt || row.createdAt)}</td>
                        <td>
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setDetail(row)}>
                              <FileText className="h-4 w-4" />Chi tiết
                            </Button>
                            {!isReadOnly && row.status === "cho_duyet" ? (
                              <Button size="sm" onClick={() => openReview(row, "da_duyet")}>
                                <CheckCircle2 className="h-4 w-4" />Duyệt
                              </Button>
                            ) : !isReadOnly && row.status === "da_bo_tri_day_thay" && targetScheduleIdsForReview(row, schedules).length > 0 ? (
                              <Button size="sm" variant="secondary" onClick={() => openReview(row, "da_duyet")}>
                                <UserRoundCheck className="h-4 w-4" />Bố trí lại
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* MODAL CHI TIẾT ĐƠN NGHỈ PHÉP */}
        <Modal
          open={Boolean(detail)}
          onOpenChange={(open) => !open && setDetail(null)}
          title="Chi tiết đơn nghỉ phép"
          description="Thông tin xử lý và lịch sử thay đổi của đơn nghỉ phép."
          wide
          footer={!isReadOnly && detail?.status === "cho_duyet" ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => openReview(detail, "tu_choi")}>
                <XCircle className="h-4 w-4" />Từ chối
              </Button>
              <Button onClick={() => openReview(detail, "da_duyet")}>
                <CheckCircle2 className="h-4 w-4" />Duyệt
              </Button>
            </div>
          ) : !isReadOnly && detail?.status === "da_bo_tri_day_thay" && targetScheduleIdsForReview(detail, schedules).length > 0 ? (
            <div className="flex justify-end">
              <Button onClick={() => openReview(detail, "da_duyet")}>
                <UserRoundCheck className="h-4 w-4" />Bố trí lại lịch bị từ chối/quá hạn
              </Button>
            </div>
          ) : undefined}
        >
          {detail ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
              <div className="space-y-3 text-sm">
                {[
                  ["Giáo viên", detail.teacherName || detail.teacherId],
                  ["Bộ môn", detail.departmentId],
                  ["Ngày nghỉ", leaveDateText(detail)],
                  ["Lịch/tiết", affectedScheduleLabels(detail, schedules, subjects, classes, rooms).join(", ") || "—"],
                  ["Lý do", detail.reason],
                  ["Trạng thái", statusLabel(detail.status)],
                  ["Giáo viên dạy thay", detail.substituteTeacherId],
                  ["Ghi chú xử lý", detail.reviewNote],
                ].map(([label, value]) => <div key={label} className="border-b border-border pb-3"><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value || "—"}</p></div>)}
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Minh chứng đính kèm</p>
                  <div className="mt-2 space-y-2">
                    {Array.isArray(detail.attachmentPaths) && detail.attachmentPaths.length > 0 ? detail.attachmentPaths.map((path: string) => <StorageFileLink key={path} path={path} />) : <p className="text-muted-foreground">Không có minh chứng đính kèm.</p>}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-bold">Tiến trình xử lý</h3>
                <div className="mt-3 space-y-3">
                  {timeline(detail).map((item, index) => <div key={`${item.label}-${index}`} className="rounded-xl border border-border p-3 text-sm"><p className="font-semibold">{item.label}</p><p className="mt-1 text-muted-foreground">{formatDate(item.at)} · {String(item.by || "—")}</p></div>)}
                </div>
              </div>
            </div>
          ) : null}
        </Modal>

        {/* MODAL DUYỆT & TỪ CHỐI ĐƠN NGHỈ PHÉP */}
        <Modal
          open={Boolean(review)}
          onOpenChange={(open) => !open && setReview(null)}
          wide={review?.decision === "da_duyet"}
          title={
            review?.decision === "da_duyet"
              ? review.request.status === "da_bo_tri_day_thay"
                ? "Bố trí lại giáo viên dạy thay"
                : "Duyệt đơn nghỉ phép & Bố trí dạy thay"
              : "Từ chối đơn nghỉ phép"
          }
          description={
            review?.decision === "da_duyet"
              ? "Bố trí giáo viên dạy thay hoặc đổi môn học cho từng tiết dạy bị ảnh hưởng trong thời gian nghỉ phép."
              : "Xác nhận từ chối đơn nghỉ phép và lưu thông tin lý do vào hệ thống."
          }
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReview(null)} disabled={submitting}>
                Hủy
              </Button>
              <Button
                form="review-form"
                variant={review?.decision === "tu_choi" ? "danger" : "primary"}
                loading={submitting}
                type="submit"
              >
                {review?.decision === "tu_choi" ? "Xác nhận từ chối" : "Phê duyệt & Lưu bố trí"}
              </Button>
            </div>
          }
        >
          <form id="review-form" className="space-y-5" onSubmit={submitReview}>
            {review?.decision === "da_duyet" ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold uppercase text-foreground">
                    Bố trí giáo viên dạy thay cho từng tiết dạy
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {targetScheduleIdsForReview(review.request, schedules).length} tiết bị ảnh hưởng
                  </span>
                </div>

                {loadingCandidates ? (
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : (
                  targetScheduleIdsForReview(review.request, schedules).map((rawScheduleId) => {
                    const scheduleId = String(rawScheduleId);
                    const schedule = schedules.find((item) => item.id === scheduleId);
                    const scheduleCandidates = candidatesBySchedule[scheduleId] ?? [];
                    const activeTab = tabBySchedule[scheduleId] ?? (scheduleCandidates.length > 0 ? "suggest" : "manual");
                    const filterMode = filterModeBySchedule[scheduleId] ?? "all";
                    const currentSubjectId = schedule ? String(schedule.subjectId || "") : "";
                    const currentSubjectDoc = subjectsMap.get(currentSubjectId);
                    const currentSubjectName = currentSubjectDoc?.name || schedule?.subjectName || "Môn học";

                    // Phân nhóm candidate: Cùng môn vs Môn khác
                    const sameSubjectCandidates = scheduleCandidates.filter((c) => c.isSameSubject);
                    const otherSubjectCandidates = scheduleCandidates.filter((c) => !c.isSameSubject);

                    const displayedCandidates =
                      filterMode === "same"
                        ? sameSubjectCandidates
                        : filterMode === "other"
                          ? otherSubjectCandidates
                          : scheduleCandidates;

                    const chosenTeacherId = substituteBySchedule[scheduleId] || "";
                    const chosenSubjectId = subjectBySchedule[scheduleId] || currentSubjectId;

                    const manualSearch = (manualSearchBySchedule[scheduleId] || "").toLowerCase().trim();
                    const filteredManualTeachers = activeTeachers.filter((t) => {
                      if (!manualSearch) return true;
                      const name = (t.fullName || t.name || t.id).toLowerCase();
                      const dept = String(t.departmentId || "").toLowerCase();
                      return name.includes(manualSearch) || dept.includes(manualSearch);
                    });

                    return (
                      <div
                        key={scheduleId}
                        className="rounded-2xl border border-border bg-card p-4 shadow-2xs space-y-3.5"
                      >
                        {/* Header thông tin lịch */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                          <div>
                            <p className="font-bold text-sm text-foreground">
                              {schedule ? scheduleLabel(schedule, subjects, classes, rooms) : scheduleId}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Môn gốc: <strong className="text-foreground">{currentSubjectName}</strong></span>
                              <span>·</span>
                              <span>Lớp: <strong className="text-foreground">{schedule?.className || catalogName(classes, schedule?.classId)}</strong></span>
                            </div>
                          </div>

                          {/* Tab Switcher: Gợi ý thông minh vs Chọn giáo viên khác */}
                          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setTabBySchedule((prev) => ({ ...prev, [scheduleId]: "suggest" }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                activeTab === "suggest"
                                  ? "bg-white text-primary shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                              <span>Gợi ý thông minh ({scheduleCandidates.length})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setTabBySchedule((prev) => ({ ...prev, [scheduleId]: "manual" }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                activeTab === "manual"
                                  ? "bg-white text-primary shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <Users className="h-3.5 w-3.5 text-blue-500" />
                              <span>Chọn giáo viên khác</span>
                            </button>
                          </div>
                        </div>

                        {/* NỘI DUNG TAB 1: GỢI Ý THÔNG MINH */}
                        {activeTab === "suggest" ? (
                          <div className="space-y-2.5">
                            {/* Filter pills */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground font-medium mr-1">Lọc gợi ý:</span>
                              <button
                                type="button"
                                onClick={() => setFilterModeBySchedule((prev) => ({ ...prev, [scheduleId]: "all" }))}
                                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                                  filterMode === "all"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}
                              >
                                Tất cả ({scheduleCandidates.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setFilterModeBySchedule((prev) => ({ ...prev, [scheduleId]: "same" }))}
                                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                                  filterMode === "same"
                                    ? "bg-emerald-600 text-white"
                                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                }`}
                              >
                                Cùng môn ({sameSubjectCandidates.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setFilterModeBySchedule((prev) => ({ ...prev, [scheduleId]: "other" }))}
                                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                                  filterMode === "other"
                                    ? "bg-blue-600 text-white"
                                    : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                                }`}
                              >
                                Môn khác đang rảnh ({otherSubjectCandidates.length})
                              </button>
                            </div>

                            {/* Candidate List */}
                            {displayedCandidates.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground space-y-2">
                                <p>Không có giáo viên phù hợp với bộ lọc này.</p>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setTabBySchedule((prev) => ({ ...prev, [scheduleId]: "manual" }))}
                                >
                                  Chuyển sang chọn giáo viên bất kỳ
                                </Button>
                              </div>
                            ) : (
                              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                                {displayedCandidates.map((candidate) => {
                                  const isSelected = chosenTeacherId === candidate.teacherId;

                                  return (
                                    <label
                                      key={`${scheduleId}-${candidate.teacherId}`}
                                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs transition ${
                                        isSelected
                                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                          : "border-border hover:bg-muted/40"
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`substitute-${scheduleId}`}
                                        checked={isSelected}
                                        onChange={() => {
                                          setSubstituteBySchedule((current) => ({
                                            ...current,
                                            [scheduleId]: candidate.teacherId,
                                          }));
                                          // Tự động gợi ý chuyển môn nếu chọn GV môn khác
                                          if (!candidate.isSameSubject && candidate.primarySubjectId) {
                                            setSubjectBySchedule((current) => ({
                                              ...current,
                                              [scheduleId]: candidate.primarySubjectId || current[scheduleId] || currentSubjectId,
                                            }));
                                          }
                                        }}
                                        className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                                      />
                                      <div className="flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-bold text-sm text-foreground">
                                            {candidate.teacherName}
                                          </span>
                                          {candidate.isSameSubject ? (
                                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 border border-emerald-200">
                                              Cùng môn: {currentSubjectName}
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-bold text-blue-700 border border-blue-200">
                                              Môn: {candidate.primarySubjectName || candidate.subjectNames?.join(", ") || "Khác"}
                                            </span>
                                          )}
                                          <span className="ml-auto font-bold text-amber-700">
                                            {candidate.score} điểm phù hợp
                                          </span>
                                        </div>
                                        <p className="text-muted-foreground text-[11px]">
                                          {candidate.reasons.join(" · ")}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* NỘI DUNG TAB 2: CHỌN GIÁO VIÊN BẤT KỲ */
                          <div className="space-y-3 rounded-xl bg-muted/30 p-3 border border-border/60">
                            <div>
                              <Label className="text-xs font-semibold text-slate-700">
                                Chọn giáo viên dạy thay từ toàn trường
                              </Label>
                              <select
                                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"
                                value={chosenTeacherId}
                                onChange={(e) => {
                                  const tId = e.target.value;
                                  setSubstituteBySchedule((current) => ({ ...current, [scheduleId]: tId }));
                                  const teacherDoc = teachers.find((t) => t.id === tId);
                                  const tSubjectId = Array.isArray(teacherDoc?.subjectIds) && teacherDoc.subjectIds.length > 0 ? String(teacherDoc.subjectIds[0]) : "";
                                  if (tSubjectId) {
                                    setSubjectBySchedule((current) => ({ ...current, [scheduleId]: tSubjectId }));
                                  }
                                }}
                              >
                                <option value="">-- Chọn giáo viên dạy thay --</option>
                                {filteredManualTeachers.map((t) => {
                                  const tSubjects = Array.isArray(t.subjectIds)
                                    ? t.subjectIds.map((id: string) => subjectsMap.get(id)?.name || id).join(", ")
                                    : "";
                                  return (
                                    <option key={t.id} value={t.id}>
                                      {t.fullName || t.name || t.id} · [{t.departmentId || "Chung"}] {tSubjects ? `(${tSubjects})` : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* TÙY CHỌN BỔ SUNG MÔN KHÁC / ĐỔI MÔN CHO TIẾT NÀY */}
                        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700">
                            <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                            <span>Môn học giảng dạy trong tiết này:</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select
                              className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                              value={chosenSubjectId}
                              onChange={(e) =>
                                setSubjectBySchedule((prev) => ({
                                  ...prev,
                                  [scheduleId]: e.target.value,
                                }))
                              }
                            >
                              <option value={currentSubjectId}>
                                Giữ nguyên môn: {currentSubjectName} (Mặc định)
                              </option>
                              {subjects
                                .filter((s) => s.id !== currentSubjectId)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    Đổi sang môn: {s.name || s.code || s.id}
                                  </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground flex items-center">
                              {chosenSubjectId && chosenSubjectId !== currentSubjectId ? (
                                <span className="font-semibold text-primary">
                                  ✓ Đã chọn đổi tiết này sang môn: <strong>{subjectsMap.get(chosenSubjectId)?.name || chosenSubjectId}</strong>
                                </span>
                              ) : (
                                <span>Giữ nguyên môn của thời khóa biểu</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {/* Ghi chú xử lý / Lý do từ chối */}
            <div>
              <Label className="text-xs font-bold uppercase text-slate-700">
                {review?.decision === "tu_choi" ? "Lý do từ chối (Bắt buộc)" : "Ghi chú xử lý / Hướng dẫn"}
              </Label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  review?.decision === "tu_choi"
                    ? "Nhập lý do từ chối đơn nghỉ phép..."
                    : "Nhập hướng dẫn hoặc ghi chú cho giáo viên..."
                }
              />
            </div>

            {reviewError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {reviewError}
              </div>
            ) : null}

            {review?.decision === "da_duyet" ? (
              <div className="flex items-start gap-2 rounded-xl bg-blue-50/80 p-3 text-xs text-blue-800 border border-blue-200/50">
                <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Hệ thống hỗ trợ gợi ý giáo viên cùng môn hoặc giáo viên bộ môn khác đang rảnh. Bạn cũng có thể đổi môn cho tiết học để linh hoạt quản lý chương trình.
                </span>
              </div>
            ) : null}
          </form>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
