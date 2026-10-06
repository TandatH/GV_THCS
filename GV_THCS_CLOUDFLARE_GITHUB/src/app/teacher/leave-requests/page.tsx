"use client";

import { CalendarClock, CirclePlus, FileText, Pencil, Send, Save, Search, XCircle } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseStorage, firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";
import { deleteObject, ref as storageRef, uploadBytes } from "firebase/storage";
import { addDaysDateOnly, todayDateOnly } from "@/lib/date-only";

type LeaveRow = DocumentData & { id: string };
type ScheduleRow = DocumentData & { id: string };
type AffectedScheduleSummary = {
  scheduleId?: string;
  label?: string;
  date?: string;
  subjectId?: string;
  subjectName?: string;
  classId?: string;
  className?: string;
  roomId?: string;
  roomName?: string;
  startPeriod?: unknown;
  endPeriod?: unknown;
};

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    nhap: "Bản nháp",
    cho_duyet: "Chờ duyệt",
    da_bo_tri_day_thay: "Đã bố trí dạy thay",
    da_duyet: "Đã duyệt",
    tu_choi: "Từ chối",
    da_huy: "Đã hủy",
  };
  return typeof status === "string" ? labels[status] || status : "Không rõ";
}

function statusTone(status: unknown) {
  if (["da_duyet", "da_bo_tri_day_thay"].includes(String(status))) return "success" as const;
  if (["tu_choi", "da_huy"].includes(String(status))) return "danger" as const;
  if (["cho_duyet", "nhap"].includes(String(status))) return "warning" as const;
  return "neutral" as const;
}

function scheduleDate(schedule: ScheduleRow) {
  return addDaysDateOnly(String(schedule.weekStart || ""), Number(schedule.dayOfWeek || 2) - 2);
}

function scheduleLabel(schedule: ScheduleRow) {
  const date = scheduleDate(schedule);
  const start = Number(schedule.startPeriod || 0);
  const last = Number(schedule.endPeriod || 0) - 1;
  const periods = start > 0 && last >= start ? `${start}-${last}` : "chưa rõ";
  return `${formatDate(date)} · ${schedule.subjectName || schedule.subjectId || "Môn học"} · ${schedule.className || schedule.classId || "Lớp"} · tiết ${periods}`;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function affectedScheduleLabels(row: LeaveRow) {
  const summaries = Array.isArray(row.affectedSchedules) ? row.affectedSchedules : [];
  const labels = summaries
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const summary = item as AffectedScheduleSummary;
      return textValue(summary.label) || textValue(summary.scheduleId);
    })
    .filter(Boolean);
  if (labels.length > 0) return labels;
  return Array.isArray(row.scheduleIds) ? row.scheduleIds.map((id) => String(id)).filter(Boolean) : [];
}

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export default function TeacherLeaveRequestsPage() {
  const { loading: authLoading, user } = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [primarySchedules, setPrimarySchedules] = useState<ScheduleRow[]>([]);
  const [legacySchedules, setLegacySchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [form, setForm] = useState({ leaveDate: todayDateOnly(), reason: "" });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [editingDraftId, setEditingDraftId] = useState("");
  const [existingAttachmentPaths, setExistingAttachmentPaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    const uid = user.uid;
    setContextLoading(true);
    setError("");
    void getCurrentTeacherContext(uid)
      .then((context) => {
        if (!active) return;
        setTeacherId(context.teacherId);
        setTeacherName(String(context.teacherProfile.fullName || context.userProfile.displayName || "Giáo viên"));
        setDepartmentId(String(context.teacherProfile.departmentId || context.userProfile.departmentId || ""));
      })
      .catch((loadError) => active && setError(firebaseDataErrorMessage(loadError)))
      .finally(() => active && setContextLoading(false));
    return () => { active = false; };
  }, [authLoading, user]);

  useEffect(() => {
    if (!teacherId) return;
    setLoading(true);
    setError("");
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "leaveRequests"), where("teacherId", "==", teacherId), limit(100)), (snapshot) => {
        setRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); }),
      onSnapshot(query(collection(firestore, "schedules"), where("actualTeacherId", "==", teacherId), limit(200)), (snapshot) => {
        setPrimarySchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(query(collection(firestore, "schedules"), where("teacherId", "==", teacherId), limit(200)), (snapshot) => {
        setLegacySchedules(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [teacherId]);

  const upcomingSchedules = useMemo(() => {
    const today = todayDateOnly();
    const merged = new Map<string, ScheduleRow>();
    [...legacySchedules, ...primarySchedules].forEach((schedule) => merged.set(schedule.id, schedule));
    return Array.from(merged.values())
      .filter((schedule) => schedule.status !== "cancelled" && schedule.teacherUnassigned !== true)
      .filter((schedule) => String(schedule.actualTeacherId || schedule.teacherId || "") === teacherId)
      .filter((schedule) => scheduleDate(schedule) >= today)
      .sort((a, b) => scheduleDate(a).localeCompare(scheduleDate(b)))
      .slice(0, 30);
  }, [legacySchedules, primarySchedules, teacherId]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const matchesKeyword = !keyword || [row.reason, row.status, row.reviewNote, row.substituteTeacherId]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesKeyword && matchesStatus;
    }).sort((a, b) => String(b.createdAt?.seconds || "").localeCompare(String(a.createdAt?.seconds || "")));
  }, [rows, search, statusFilter]);

  function resetForm() {
    setEditingDraftId("");
    setExistingAttachmentPaths([]);
    setSelectedSchedules([]);
    setEvidenceFiles([]);
    setForm({ leaveDate: todayDateOnly(), reason: "" });
    setFormError("");
  }

  function openNewRequest() {
    resetForm();
    setOpen(true);
  }

  function openDraft(row: LeaveRow) {
    setEditingDraftId(row.id);
    setExistingAttachmentPaths(Array.isArray(row.attachmentPaths) ? row.attachmentPaths.map(String).filter(Boolean) : []);
    setSelectedSchedules(Array.isArray(row.scheduleIds) ? row.scheduleIds.map(String).filter(Boolean) : []);
    setEvidenceFiles([]);
    setForm({ leaveDate: String(row.leaveDate || todayDateOnly()), reason: String(row.reason || "") });
    setFormError("");
    setOpen(true);
  }

  async function cancelRequest(row: LeaveRow) {
    if (!user || !window.confirm(`Hủy ${row.status === "nhap" ? "bản nháp" : "đơn đã gửi"} này?`)) return;
    setSubmitting(true);
    try {
      const attachmentPaths = Array.isArray(row.attachmentPaths) ? row.attachmentPaths.map(String).filter(Boolean) : [];
      if (row.status === "nhap") {
        await Promise.allSettled(attachmentPaths.map((path) => deleteObject(storageRef(firebaseStorage, path))));
      }
      await updateDoc(doc(firestore, "leaveRequests", row.id), {
        status: "da_huy",
        ...(row.status === "nhap" ? { attachmentPaths: [] } : {}),
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        isActive: true,
      });
      toast.success("Đã hủy đơn nghỉ phép.");
    } catch (cancelError) {
      toast.error(firebaseDataErrorMessage(cancelError));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSchedule(scheduleId: string) {
    setSelectedSchedules((current) => current.includes(scheduleId) ? current.filter((id) => id !== scheduleId) : [...current, scheduleId]);
  }

  function selectEvidenceFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    const invalid = files.find((file) => !allowedTypes.has(file.type) || file.size >= 10 * 1024 * 1024);
    if (invalid) {
      setFormError("Minh chứng chỉ chấp nhận định dạng PDF, JPG, PNG, WEBP và dung lượng dưới 10 MB.");
      event.target.value = "";
      return;
    }
    if (existingAttachmentPaths.length + files.length > 5) {
      setFormError(`Đơn đã có ${existingAttachmentPaths.length} tệp đính kèm; tổng số không được vượt quá 5 tệp.`);
      event.target.value = "";
      return;
    }
    setEvidenceFiles(files.slice(0, Math.max(0, 5 - existingAttachmentPaths.length)));
    setFormError("");
  }

  async function submitLeaveRequest(nextStatus: "nhap" | "cho_duyet") {
    if (!user || !teacherId) return;
    if (selectedSchedules.length === 0) {
      setFormError("Vui lòng chọn ít nhất một tiết dạy bị ảnh hưởng.");
      return;
    }
    if (form.reason.trim().length < 5) {
      setFormError("Vui lòng nhập lý do nghỉ phép chi tiết hơn.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const affectedSchedules = upcomingSchedules
        .filter((schedule) => selectedSchedules.includes(schedule.id))
        .map((schedule) => ({
          scheduleId: schedule.id,
          label: scheduleLabel(schedule),
          date: scheduleDate(schedule),
          subjectId: textValue(schedule.subjectId),
          subjectName: textValue(schedule.subjectName),
          classId: textValue(schedule.classId),
          className: textValue(schedule.className),
          roomId: textValue(schedule.roomId),
          roomName: textValue(schedule.roomName),
          startPeriod: schedule.startPeriod ?? null,
          endPeriod: schedule.endPeriod ?? null,
        }));
      const affectedDates = new Set(affectedSchedules.map((item) => item.date).filter(Boolean));
      if (affectedDates.size !== 1 || !affectedDates.has(form.leaveDate)) {
        setFormError("Các tiết dạy được chọn phải thuộc cùng ngày với ngày nghỉ phép.");
        setSubmitting(false);
        return;
      }
      // Create or update a draft first so Storage Rules can verify ownership and status.
      const leaveDocument = editingDraftId
        ? doc(firestore, "leaveRequests", editingDraftId)
        : await addDoc(collection(firestore, "leaveRequests"), {
          teacherId,
          teacherName,
          departmentId,
          leaveDate: form.leaveDate,
          scheduleIds: selectedSchedules,
          affectedSchedules,
          reason: form.reason.trim(),
          attachmentPaths: [],
          status: "nhap",
          submittedAt: null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          isActive: true,
        });
      if (editingDraftId) {
        await updateDoc(leaveDocument, {
          leaveDate: form.leaveDate,
          scheduleIds: selectedSchedules,
          affectedSchedules,
          reason: form.reason.trim(),
          status: "nhap",
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          isActive: true,
        });
      }
      const uploadedPaths: string[] = [];
      try {
        for (const [index, file] of evidenceFiles.entries()) {
          const path = `leaveEvidence/${user.uid}/${leaveDocument.id}/${Date.now()}_${index + 1}_${safeFileName(file.name)}`;
          await uploadBytes(storageRef(firebaseStorage, path), file, { contentType: file.type });
          uploadedPaths.push(path);
        }
        const attachmentPaths = [...existingAttachmentPaths, ...uploadedPaths];
        await updateDoc(leaveDocument, {
          attachmentPaths,
          status: nextStatus,
          submittedAt: nextStatus === "cho_duyet" ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      } catch (uploadOrUpdateError) {
        await Promise.allSettled(uploadedPaths.map((path) => deleteObject(storageRef(firebaseStorage, path))));
        throw uploadOrUpdateError;
      }
      toast.success(nextStatus === "cho_duyet" ? "Đã gửi đơn nghỉ phép thành công." : "Đã lưu nháp đơn nghỉ phép.");
      setOpen(false);
      resetForm();
    } catch (submitError) {
      setFormError(firebaseDataErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Nghỉ phép"
          title="Đơn nghỉ phép"
          description="Tạo đơn xin nghỉ phép theo tiết dạy và theo dõi kết quả phê duyệt của Ban Giám hiệu hoặc Tổ trưởng chuyên môn."
          actions={<Button onClick={openNewRequest} disabled={contextLoading || Boolean(error)}><CirclePlus className="h-4 w-4" />Tạo đơn nghỉ phép</Button>}
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm lý do, trạng thái, ghi chú..." />
            </div>
            <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="nhap">Bản nháp</option>
              <option value="cho_duyet">Chờ duyệt</option>
              <option value="da_bo_tri_day_thay">Đã bố trí dạy thay</option>
              <option value="tu_choi">Từ chối</option>
              <option value="da_huy">Đã hủy</option>
            </select>
          </div>

          {loading || contextLoading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : error ? null : filteredRows.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Chưa có đơn nghỉ phép" description="Chưa có đơn nghỉ phép nào phù hợp với bộ lọc hiện tại." action={<Button onClick={openNewRequest}>Tạo đơn nghỉ phép</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[980px]">
                <thead><tr><th>Ngày nghỉ</th><th>Tiết dạy ảnh hưởng</th><th>Lý do</th><th>Minh chứng</th><th>Trạng thái</th><th>Ghi chú xử lý</th><th>Thời gian gửi</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const attachments = Array.isArray(row.attachmentPaths) ? row.attachmentPaths : [];
                    const scheduleLabels = affectedScheduleLabels(row);
                    return (
                      <tr key={row.id}>
                        <td>{formatDate(row.leaveDate)}</td>
                        <td><div className="max-w-xs space-y-1">{scheduleLabels.length > 0 ? scheduleLabels.slice(0, 2).map((label) => <p key={label} className="line-clamp-1 text-sm">{label}</p>) : "—"}{scheduleLabels.length > 2 ? <p className="text-xs text-muted-foreground">+{scheduleLabels.length - 2} tiết khác</p> : null}</div></td>
                        <td><p className="max-w-sm line-clamp-2">{row.reason || "—"}</p></td>
                        <td>{attachments.length > 0 ? `${attachments.length} tệp` : "—"}</td>
                        <td><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                        <td><p className="max-w-xs truncate">{row.reviewNote || "—"}</p></td>
                        <td>{formatDate(row.submittedAt || row.createdAt)}</td>
                        <td><div className="flex gap-2">{row.status === "nhap" ? <Button size="sm" variant="secondary" onClick={() => openDraft(row)}><Pencil className="h-4 w-4" />Tiếp tục</Button> : null}{["nhap", "cho_duyet"].includes(String(row.status)) ? <Button size="sm" variant="ghost" disabled={submitting} onClick={() => cancelRequest(row)}><XCircle className="h-4 w-4" />Hủy</Button> : null}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetForm(); }} title={editingDraftId ? "Tiếp tục bản nháp" : "Tạo đơn nghỉ phép"} description="Chọn các tiết dạy bị ảnh hưởng, nhập lý do và gửi phê duyệt." wide footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button><Button variant="secondary" loading={submitting} onClick={() => submitLeaveRequest("nhap")}><Save className="h-4 w-4" />Lưu nháp</Button><Button loading={submitting} onClick={() => submitLeaveRequest("cho_duyet")}><Send className="h-4 w-4" />Gửi đơn</Button></div>}>
          <form className="space-y-5" onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Giáo viên</Label><div className="h-11 rounded-xl border border-border bg-muted px-3 py-2 text-sm font-semibold">{teacherName || "—"}</div></div>
              <div><Label>Ngày nghỉ</Label><Input type="date" value={form.leaveDate} onChange={(event) => setForm((current) => ({ ...current, leaveDate: event.target.value }))} /></div>
            </div>
            <div>
              <Label>Tiết dạy bị ảnh hưởng</Label>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                {upcomingSchedules.length === 0 ? <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700"><FileText className="h-4 w-4" />Chưa có lịch dạy sắp tới. Thời khóa biểu cần được sắp xếp trước khi tạo đơn nghỉ phép theo tiết.</div> : upcomingSchedules.map((schedule) => <label key={schedule.id} className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 text-sm hover:bg-muted"><input type="checkbox" checked={selectedSchedules.includes(schedule.id)} onChange={() => toggleSchedule(schedule.id)} /><span>{scheduleLabel(schedule)}</span></label>)}
              </div>
            </div>
            <div><Label>Lý do nghỉ phép</Label><textarea className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></div>
            <div><Label>Tệp minh chứng đính kèm</Label><Input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={selectEvidenceFiles} /><p className="mt-1 text-xs text-muted-foreground">Tối đa 5 tệp; mỗi tệp dưới 10 MB. Sau khi gửi duyệt, tệp đính kèm sẽ được cố định.</p>{existingAttachmentPaths.length > 0 ? <p className="mt-2 text-sm text-muted-foreground">Đã có {existingAttachmentPaths.length} tệp trong bản nháp.</p> : null}{evidenceFiles.length > 0 ? <div className="mt-2 space-y-1 text-sm">{evidenceFiles.map((file) => <p key={`${file.name}-${file.size}`} className="truncate">• {file.name} ({Math.ceil(file.size / 1024)} KB)</p>)}</div> : null}</div>
            {formError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
          </form>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
