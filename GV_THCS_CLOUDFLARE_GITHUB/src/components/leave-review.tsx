"use client";

import type { Role, SubstituteCandidate } from "@school/shared";
import { CheckCircle2, Clock3, FileText, Search, UserRoundCheck, XCircle } from "lucide-react";
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

export function LeaveReviewPage({ allowedRoles }: { allowedRoles: readonly Role[] }) {
  const { claims, role } = useAuth();
  const isReadOnly = role === "bgh";
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [subjects, setSubjects] = useState<CatalogRow[]>([]);
  const [classes, setClasses] = useState<CatalogRow[]>([]);
  const [rooms, setRooms] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [detail, setDetail] = useState<LeaveRow | null>(null);
  const [review, setReview] = useState<ReviewState>(null);
  const [note, setNote] = useState("");
  const [substituteBySchedule, setSubstituteBySchedule] = useState<Record<string, string>>({});
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
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const departments = useMemo(() => Array.from(new Set(rows.map((row) => String(row.departmentId || "")).filter(Boolean))), [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const matchesSearch = !keyword || [row.reason, row.teacherName, row.teacherId, row.departmentId, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || row.departmentId === departmentFilter;
      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [departmentFilter, rows, search, statusFilter]);

  async function openReview(request: LeaveRow, decision: "da_duyet" | "tu_choi") {
    setReview({ request, decision });
    setNote("");
    setSubstituteBySchedule({});
    setReviewError("");
    setCandidatesBySchedule({});
    if (decision !== "da_duyet") return;
    const scheduleIds = targetScheduleIdsForReview(request, schedules);
    if (scheduleIds.length === 0) {
      setReviewError("Đơn nghỉ chưa có lịch bị ảnh hưởng.");
      return;
    }
    setLoadingCandidates(true);
    try {
      const results = await Promise.all(scheduleIds.map(async (scheduleId) => {
        const result = await suggestSubstituteTeachers(scheduleId);
        return [scheduleId, result.candidates as SubstituteCandidate[]] as const;
      }));
      const nextCandidates: Record<string, SubstituteCandidate[]> = {};
      const nextSelections: Record<string, string> = {};
      for (const [scheduleId, scheduleCandidates] of results) {
        nextCandidates[scheduleId] = scheduleCandidates;
        if (scheduleCandidates[0]) nextSelections[scheduleId] = scheduleCandidates[0].teacherId;
      }
      setCandidatesBySchedule(nextCandidates);
      setSubstituteBySchedule(nextSelections);
    } catch (suggestError) {
      setReviewError(firebaseErrorMessage(suggestError));
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) return;
    if (review.decision === "tu_choi" && !note.trim()) {
      setReviewError("Vui lòng nhập lý do từ chối.");
      return;
    }
    const scheduleIds = targetScheduleIdsForReview(review.request, schedules);
    if (review.decision === "da_duyet" && scheduleIds.some((scheduleId) => !substituteBySchedule[scheduleId])) {
      setReviewError("Vui lòng chọn giáo viên dạy thay cho từng lịch bị ảnh hưởng.");
      return;
    }
    setSubmitting(true);
    setReviewError("");
    try {
      await approveLeaveRequest({
        leaveRequestId: review.request.id,
        decision: review.decision,
        note: note || undefined,
        substitutions: review.decision === "da_duyet"
          ? scheduleIds.map((scheduleId) => ({ scheduleId, substituteTeacherId: substituteBySchedule[scheduleId] }))
          : undefined,
      });
      toast.success(review.decision === "da_duyet" ? "Đã duyệt và bố trí dạy thay cho từng lịch." : "Đã từ chối đơn nghỉ.");
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
          eyebrow={isReadOnly ? "Ban Giám Hiệu theo dõi" : "Phê duyệt nghiệp vụ"}
          title={isReadOnly ? "Theo dõi Đơn nghỉ dạy" : "Đơn nghỉ dạy"}
          description={isReadOnly ? "Nắm bắt tình hình giáo viên xin nghỉ dạy, lý do và giáo viên dạy thay (chế độ chỉ xem)." : "Xem chi tiết đơn nghỉ, lịch bị ảnh hưởng, minh chứng và xử lý bằng Cloud Function trong phạm vi được phân quyền."}
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {lookupError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Không thể tải đầy đủ thông tin lịch/tiết: {lookupError}</div> : null}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo giáo viên, lý do..." />
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Tất cả trạng thái</option>
                <option value="cho_duyet">Chờ duyệt</option>
                <option value="da_duyet">Đã duyệt</option>
                <option value="da_bo_tri_day_thay">Đã bố trí dạy thay</option>
                <option value="tu_choi">Từ chối</option>
                <option value="da_huy">Đã hủy</option>
              </select>
              {role === "admin" ? (
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
            <EmptyState icon={<Clock3 className="h-6 w-6" />} title="Chưa có dữ liệu" description="Không có đơn nghỉ phù hợp với bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1120px]">
                <thead><tr><th>Giáo viên</th><th>Bộ môn</th><th>Ngày nghỉ</th><th>Lịch/tiết bị ảnh hưởng</th><th>Lý do</th><th>File minh chứng</th><th>Trạng thái</th><th>Thời gian gửi</th><th>Thao tác</th></tr></thead>
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
                        <td>{attachments.length > 0 ? `${attachments.length} file` : "—"}</td>
                        <td><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                        <td>{formatDate(row.submittedAt || row.createdAt)}</td>
                        <td><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setDetail(row)}><FileText className="h-4 w-4" />Chi tiết</Button>{!isReadOnly && row.status === "cho_duyet" ? <Button size="sm" onClick={() => openReview(row, "da_duyet")}><CheckCircle2 className="h-4 w-4" />Duyệt</Button> : !isReadOnly && row.status === "da_bo_tri_day_thay" && targetScheduleIdsForReview(row, schedules).length > 0 ? <Button size="sm" variant="secondary" onClick={() => openReview(row, "da_duyet")}><UserRoundCheck className="h-4 w-4" />Bố trí lại</Button> : null}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)} title="Chi tiết đơn nghỉ" description="Thông tin xử lý và lịch sử thay đổi của đơn nghỉ." wide footer={!isReadOnly && detail?.status === "cho_duyet" ? <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => openReview(detail, "tu_choi")}><XCircle className="h-4 w-4" />Từ chối</Button><Button onClick={() => openReview(detail, "da_duyet")}><CheckCircle2 className="h-4 w-4" />Duyệt</Button></div> : !isReadOnly && detail?.status === "da_bo_tri_day_thay" && targetScheduleIdsForReview(detail, schedules).length > 0 ? <div className="flex justify-end"><Button onClick={() => openReview(detail, "da_duyet")}><UserRoundCheck className="h-4 w-4" />Bố trí lại lịch bị từ chối/quá hạn</Button></div> : undefined}>
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
                  <p className="text-xs font-medium uppercase text-muted-foreground">File minh chứng</p>
                  <div className="mt-2 space-y-2">
                    {Array.isArray(detail.attachmentPaths) && detail.attachmentPaths.length > 0 ? detail.attachmentPaths.map((path: string) => <StorageFileLink key={path} path={path} />) : <p className="text-muted-foreground">Không có file minh chứng.</p>}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-bold">Timeline xử lý</h3>
                <div className="mt-3 space-y-3">
                  {timeline(detail).map((item, index) => <div key={`${item.label}-${index}`} className="rounded-xl border border-border p-3 text-sm"><p className="font-semibold">{item.label}</p><p className="mt-1 text-muted-foreground">{formatDate(item.at)} · {String(item.by || "—")}</p></div>)}
                </div>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)} title={review?.decision === "da_duyet" ? (review.request.status === "da_bo_tri_day_thay" ? "Bố trí lại giáo viên dạy thay" : "Duyệt đơn nghỉ") : "Từ chối đơn nghỉ"} description="Thao tác được thực hiện qua Cloud Function approveLeaveRequest và ghi audit log." footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setReview(null)}>Hủy</Button><Button form="review-form" variant={review?.decision === "tu_choi" ? "danger" : "primary"} loading={submitting} type="submit">Xác nhận</Button></div>}>
          <form id="review-form" className="space-y-4" onSubmit={submitReview}>
            {review?.decision === "da_duyet" ? (
              <div className="space-y-4">
                <Label>Bố trí giáo viên dạy thay theo từng lịch</Label>
                {loadingCandidates ? <Skeleton className="h-40 w-full" /> : targetScheduleIdsForReview(review.request, schedules).map((rawScheduleId) => {
                  const scheduleId = String(rawScheduleId);
                  const schedule = schedules.find((item) => item.id === scheduleId);
                  const scheduleCandidates = candidatesBySchedule[scheduleId] ?? [];
                  return (
                    <div key={scheduleId} className="rounded-xl border border-border p-3">
                      <p className="mb-2 text-sm font-semibold">{schedule ? scheduleLabel(schedule, subjects, classes, rooms) : scheduleId}</p>
                      {scheduleCandidates.length > 0 ? (
                        <div className="space-y-2">
                          {scheduleCandidates.map((candidate) => <label key={`${scheduleId}-${candidate.teacherId}`} className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 text-sm hover:bg-muted"><input type="radio" name={`substitute-${scheduleId}`} checked={substituteBySchedule[scheduleId] === candidate.teacherId} onChange={() => setSubstituteBySchedule((current) => ({ ...current, [scheduleId]: candidate.teacherId }))} /><span><span className="font-semibold">{candidate.teacherName}</span><span className="ml-2 text-muted-foreground">{candidate.score} điểm</span><span className="mt-1 block text-xs text-muted-foreground">{candidate.reasons.join(", ")}</span></span></label>)}
                        </div>
                      ) : <Input value={substituteBySchedule[scheduleId] ?? ""} onChange={(event) => setSubstituteBySchedule((current) => ({ ...current, [scheduleId]: event.target.value }))} placeholder="Nhập teacherId dạy thay cho lịch này" />}
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div><Label>{review?.decision === "tu_choi" ? "Lý do từ chối" : "Ghi chú xử lý"}</Label><textarea className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nhập lý do hoặc hướng dẫn cho giáo viên..." /></div>
            {reviewError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{reviewError}</div> : null}
            {review?.decision === "da_duyet" ? <div className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700"><UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0" />Danh sách gợi ý được tính riêng cho từng lịch, có kiểm tra môn dạy, khung giờ rảnh và thời gian di chuyển.</div> : null}
          </form>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
