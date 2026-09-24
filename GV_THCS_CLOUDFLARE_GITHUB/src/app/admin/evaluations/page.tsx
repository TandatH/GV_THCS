"use client";

import { BarChart3, CalendarPlus, CirclePlus, FileCheck2, Radar as RadarIcon, RotateCcw, Search, Trash2 } from "lucide-react";
import { addDoc, collection, doc, getDoc, limit, onSnapshot, query, serverTimestamp, setDoc, where, type DocumentData } from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { deleteEvaluationPeriod, setEvaluationPeriodStatus } from "@/lib/firebase/evaluation-admin-callables";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";

type PeriodRow = DocumentData & { id: string };
type TeacherRow = DocumentData & { id: string };
type EvaluationRow = DocumentData & { id: string };

const criteriaNames = ["Chuyên môn", "Kỷ luật", "Hợp tác"];
const periodStatuses = [
  { value: "draft", label: "Nháp" },
  { value: "published", label: "Chính thức" },
] as const;

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    draft: "Nháp",
    open: "Đang mở",
    closed: "Đã đóng",
    published: "Đã công bố",
  };
  return typeof status === "string" ? labels[status] || status : "Không rõ";
}

function statusTone(status: unknown) {
  if (["open", "published"].includes(String(status))) return "success" as const;
  if (["closed"].includes(String(status))) return "neutral" as const;
  return "warning" as const;
}

function periodStatusLabel(status: unknown) {
  if (status === "published") return "Chính thức";
  if (status === "draft") return "Nháp";
  if (status === "open") return "Đang mở (cũ)";
  if (status === "closed") return "Đã đóng (cũ)";
  return statusLabel(status);
}

function periodStatusTone(status: unknown) {
  if (status === "published") return "success" as const;
  if (status === "closed") return "neutral" as const;
  return "warning" as const;
}

function averageScore(evaluation: EvaluationRow) {
  const criteria = Array.isArray(evaluation.criteria) ? evaluation.criteria : [];
  if (criteria.length === 0) return 0;
  const totalWeight = criteria.reduce((sum, item) => sum + Number(item.weight ?? 1), 0);
  const total = criteria.reduce((sum, item) => sum + Number(item.score ?? 0) * Number(item.weight ?? 1), 0);
  return totalWeight ? Math.round((total / totalWeight) * 10) / 10 : 0;
}

export default function AdminEvaluationsPage() {
  const { user, role, claims, loading: authLoading } = useAuth();
  const managerDepartmentId = typeof claims?.departmentId === "string" ? claims.departmentId : "";
  const [tab, setTab] = useState<"periods" | "results">("periods");
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyPeriodId, setBusyPeriodId] = useState("");
  const [formError, setFormError] = useState("");
  const [periodForm, setPeriodForm] = useState({ name: "", startDate: "", endDate: "", status: "draft" });
  const [evaluationForm, setEvaluationForm] = useState({ periodId: "", teacherId: "", notes: "", status: "draft", scores: ["8", "8", "8"] });

  useEffect(() => {
    if (authLoading || !role) return;
    if (role === "totruong" && !managerDepartmentId) {
      setError("Tài khoản tổ trưởng chưa được gán bộ môn phụ trách.");
      setLoading(false);
      return;
    }
    const teachersQuery = role === "totruong"
      ? query(collection(firestore, "teachers"), where("departmentId", "==", managerDepartmentId), limit(300))
      : query(collection(firestore, "teachers"), limit(300));
    const evaluationsQuery = role === "totruong"
      ? query(collection(firestore, "evaluations"), where("departmentId", "==", managerDepartmentId), limit(500))
      : query(collection(firestore, "evaluations"), limit(500));
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "evaluationPeriods"), limit(100)), (snapshot) => {
        setPeriods(snapshot.docs.map((document): PeriodRow => ({ id: document.id, ...document.data() })));
        setLoading(false);
      }, (snapshotError) => { setError(firebaseDataErrorMessage(snapshotError)); setLoading(false); }),
      onSnapshot(teachersQuery, (snapshot) => {
        setTeachers(snapshot.docs.map((document): TeacherRow => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
      onSnapshot(evaluationsQuery, (snapshot) => {
        setEvaluations(snapshot.docs.map((document): EvaluationRow => ({ id: document.id, ...document.data() })));
      }, (snapshotError) => setError(firebaseDataErrorMessage(snapshotError))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [authLoading, managerDepartmentId, role]);


  useEffect(() => {
    if (role === "totruong" && managerDepartmentId) setDepartmentFilter(managerDepartmentId);
  }, [managerDepartmentId, role]);

  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers]);
  const periodById = useMemo(() => new Map(periods.map((period) => [period.id, period])), [periods]);
  const departments = useMemo(() => Array.from(new Set(teachers.map((teacher) => String(teacher.departmentId || "")).filter(Boolean))), [teachers]);

  const filteredEvaluations = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return evaluations.filter((evaluation) => {
      const teacher = teacherById.get(String(evaluation.teacherId));
      const period = periodById.get(String(evaluation.periodId));
      const matchesKeyword = !keyword || [teacher?.fullName, teacher?.email, teacher?.departmentId, period?.name, evaluation.notes]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi").includes(keyword));
      const matchesPeriod = periodFilter === "all" || evaluation.periodId === periodFilter;
      const matchesDepartment = departmentFilter === "all" || teacher?.departmentId === departmentFilter || evaluation.departmentId === departmentFilter;
      return matchesKeyword && matchesPeriod && matchesDepartment;
    });
  }, [departmentFilter, evaluations, periodById, periodFilter, search, teacherById]);

  const radarData = useMemo(() => {
    const selected = filteredEvaluations[0];
    const criteria = Array.isArray(selected?.criteria) ? selected.criteria : [];
    return criteria.map((item) => ({ criterion: item.name, score: Number(item.score ?? 0) }));
  }, [filteredEvaluations]);

  const trendData = useMemo(() => periods.map((period) => {
    const periodEvaluations = evaluations.filter((evaluation) => evaluation.periodId === period.id);
    const average = periodEvaluations.length
      ? Math.round((periodEvaluations.reduce((sum, evaluation) => sum + averageScore(evaluation), 0) / periodEvaluations.length) * 10) / 10
      : 0;
    return { name: String(period.name || period.id), average };
  }), [evaluations, periods]);

  async function submitPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setFormError("");
    try {
      await addDoc(collection(firestore, "evaluationPeriods"), {
        name: periodForm.name.trim(),
        startDate: periodForm.startDate,
        endDate: periodForm.endDate,
        status: periodForm.status,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        isActive: periodForm.status !== "closed",
      });
      setPeriodForm({ name: "", startDate: "", endDate: "", status: "draft" });
      setPeriodModalOpen(false);
      toast.success("Đã tạo kỳ đánh giá.");
    } catch (submitError) {
      setFormError(firebaseDataErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePeriodStatus(period: PeriodRow) {
    if (role !== "admin") return;
    const nextStatus: "draft" | "published" = period.status === "published" ? "draft" : "published";
    const nextLabel = nextStatus === "published" ? "Chính thức" : "Nháp";
    const name = String(period.name || period.id);
    if (!window.confirm(`Đổi kỳ “${name}” sang trạng thái ${nextLabel}?`)) return;

    setBusyPeriodId(period.id);
    try {
      await setEvaluationPeriodStatus(period.id, nextStatus);
      toast.success(`Đã chuyển kỳ đánh giá sang ${nextLabel}.`);
    } catch (statusError) {
      toast.error(firebaseErrorMessage(statusError));
    } finally {
      setBusyPeriodId("");
    }
  }

  async function handleDeletePeriod(period: PeriodRow) {
    if (role !== "admin") return;
    const resultCount = evaluations.filter((evaluation) => evaluation.periodId === period.id).length;
    const name = String(period.name || period.id);
    const confirmation = window.prompt(
      `Xóa vĩnh viễn kỳ “${name}”?\n${resultCount > 0 ? `Kỳ này đang có ${resultCount} kết quả; các kết quả đó cũng sẽ bị xóa.` : "Kỳ này chưa có kết quả."}\nNhập XOA KY DANH GIA để xác nhận.`,
      "",
    );
    if (confirmation !== "XOA KY DANH GIA") return;

    setBusyPeriodId(period.id);
    try {
      const result = await deleteEvaluationPeriod(period.id);
      if (periodFilter === period.id) setPeriodFilter("all");
      toast.success(`Đã xóa kỳ đánh giá và ${result.deletedEvaluationCount} kết quả liên quan.`);
    } catch (deleteError) {
      toast.error(firebaseErrorMessage(deleteError));
    } finally {
      setBusyPeriodId("");
    }
  }

  async function submitEvaluation(nextStatus: "draft" | "published") {
    if (!user) return;
    const teacher = teacherById.get(evaluationForm.teacherId);
    if (!teacher) {
      setFormError("Vui lòng chọn giáo viên hợp lệ.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const reference = doc(firestore, "evaluations", `${evaluationForm.periodId}_${evaluationForm.teacherId}`);
      const existing = await getDoc(reference);
      const payload = {
        teacherId: evaluationForm.teacherId,
        teacherName: teacher.fullName || teacher.email || evaluationForm.teacherId,
        departmentId: teacher.departmentId || "",
        periodId: evaluationForm.periodId,
        criteria: criteriaNames.map((name, index) => ({ name, score: Number(evaluationForm.scores[index] || 0), weight: 1 })),
        notes: evaluationForm.notes,
        status: nextStatus,
        publishedAt: nextStatus === "published" ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        ...(existing.exists() ? {} : { createdAt: serverTimestamp(), createdBy: user.uid, isActive: true }),
      };
      await setDoc(reference, payload, { merge: true });
      setEvaluationModalOpen(false);
      setEvaluationForm({ periodId: "", teacherId: "", notes: "", status: "draft", scores: ["8", "8", "8"] });
      toast.success(nextStatus === "published" ? "Đã công bố kết quả đánh giá." : "Đã lưu nháp đánh giá.");
    } catch (submitError) {
      setFormError(firebaseDataErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin", "totruong", "bgh"]}>
      <Shell>
        <PageHeader
          eyebrow={role === "bgh" ? "Ban Giám Hiệu theo dõi" : role === "totruong" ? "Đánh giá trong tổ" : "Đánh giá giáo viên"}
          title={role === "bgh" ? "Theo dõi Kết quả Đánh giá Giáo viên" : role === "totruong" ? "Đánh giá giáo viên trong tổ" : "Quản lý kỳ và kết quả đánh giá"}
          description={role === "bgh" ? "Theo dõi kết quả đánh giá năng lực, chuyên môn giáo viên và phân tích biểu đồ tiêu chí (chế độ chỉ xem)." : "Tạo kỳ đánh giá, chuyển kỳ từ Nháp sang Chính thức, nhập điểm theo tiêu chí và công bố kết quả cho giáo viên."}
          actions={
            role !== "bgh" ? (
              <div className="flex flex-wrap gap-2">
                {role === "admin" ? <Button variant="secondary" onClick={() => setPeriodModalOpen(true)}><CalendarPlus className="h-4 w-4" />Tạo kỳ đánh giá</Button> : null}
                <Button onClick={() => setEvaluationModalOpen(true)} disabled={periods.length === 0 || teachers.length === 0}><CirclePlus className="h-4 w-4" />Nhập đánh giá</Button>
              </div>
            ) : undefined
          }
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="mb-5 flex flex-wrap gap-2">
          <Button variant={tab === "periods" ? "primary" : "secondary"} onClick={() => setTab("periods")}>Kỳ đánh giá</Button>
          <Button variant={tab === "results" ? "primary" : "secondary"} onClick={() => setTab("results")}>Kết quả giáo viên</Button>
        </div>

        {tab === "periods" ? (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <h2 className="text-lg font-bold">Kỳ đánh giá</h2>
              <p className="mt-1 text-sm text-muted-foreground">Admin có thể chuyển kỳ giữa Nháp và Chính thức hoặc xóa kỳ khi cần.</p>
            </div>
            {loading ? (
              <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
            ) : periods.length === 0 ? (
              <EmptyState icon={<CalendarPlus className="h-6 w-6" />} title="Chưa có kỳ đánh giá" description="Tạo kỳ đánh giá đầu tiên để bắt đầu nhập điểm giáo viên." action={role === "admin" ? <Button onClick={() => setPeriodModalOpen(true)}>Tạo kỳ đánh giá</Button> : undefined} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[780px]">
                  <thead><tr><th>Tên kỳ</th><th>Ngày bắt đầu</th><th>Ngày kết thúc</th><th>Trạng thái</th><th>Số kết quả</th>{role === "admin" ? <th>Thao tác</th> : null}</tr></thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr key={period.id}>
                        <td><p className="font-semibold">{period.name || period.id}</p><p className="text-xs text-muted-foreground">ID: {period.id}</p></td>
                        <td>{formatDate(period.startDate)}</td>
                        <td>{formatDate(period.endDate)}</td>
                        <td><Badge tone={periodStatusTone(period.status)}>{periodStatusLabel(period.status)}</Badge></td>
                        <td>{evaluations.filter((evaluation) => evaluation.periodId === period.id).length}</td>
                        {role === "admin" ? (
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" loading={busyPeriodId === period.id} onClick={() => void handlePeriodStatus(period)}>
                                {period.status === "published" ? <RotateCcw className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}
                                {period.status === "published" ? "Về nháp" : "Chính thức"}
                              </Button>
                              <Button size="sm" variant="danger" disabled={busyPeriodId === period.id} onClick={() => void handleDeletePeriod(period)}>
                                <Trash2 className="h-4 w-4" /> Xóa kỳ
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm giáo viên, bộ môn, ghi chú..." />
                </div>
                <div className="flex flex-wrap gap-2">
                  <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
                    <option value="all">Tất cả kỳ</option>
                    {periods.map((period) => <option key={period.id} value={period.id}>{period.name || period.id}</option>)}
                  </select>
                  {role === "admin" ? <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                    <option value="all">Tất cả bộ môn</option>
                    {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select> : null}
                </div>
              </div>
              {filteredEvaluations.length === 0 ? (
                <EmptyState icon={<RadarIcon className="h-6 w-6" />} title="Chưa có kết quả đánh giá" description="Chưa có kết quả phù hợp với bộ lọc hiện tại." action={<Button onClick={() => setEvaluationModalOpen(true)} disabled={periods.length === 0 || teachers.length === 0}>Nhập đánh giá</Button>} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[980px]">
                    <thead><tr><th>Giáo viên</th><th>Kỳ đánh giá</th><th>Điểm TB</th><th>Ghi chú</th><th>Trạng thái</th></tr></thead>
                    <tbody>
                      {filteredEvaluations.map((evaluation) => {
                        const teacher = teacherById.get(String(evaluation.teacherId));
                        const period = periodById.get(String(evaluation.periodId));
                        return (
                          <tr key={evaluation.id}>
                            <td><p className="font-semibold">{teacher?.fullName || evaluation.teacherName || evaluation.teacherId}</p><p className="text-xs text-muted-foreground">{teacher?.departmentId || evaluation.departmentId || "—"}</p></td>
                            <td>{period?.name || evaluation.periodId || "—"}</td>
                            <td className="font-semibold">{averageScore(evaluation).toFixed(1)}</td>
                            <td><p className="max-w-xs truncate">{evaluation.notes || "—"}</p></td>
                            <td><Badge tone={statusTone(evaluation.status)}>{statusLabel(evaluation.status)}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="space-y-6">
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2"><RadarIcon className="h-5 w-5 text-primary" /><h2 className="font-bold">Radar tiêu chí</h2></div>
                <div className="h-64">
                  {radarData.length === 0 ? <div className="grid h-full place-items-center text-sm text-muted-foreground">Chưa có dữ liệu biểu đồ</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 12 }} />
                        <Radar dataKey="score" fill="#2563eb" fillOpacity={0.35} stroke="#2563eb" />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><h2 className="font-bold">Xu hướng điểm</h2></div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ left: -22, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis domain={[0, 10]} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip />
                      <Line dataKey="average" name="Điểm TB" stroke="#2563eb" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        )}

        <Modal open={periodModalOpen} onOpenChange={setPeriodModalOpen} title="Tạo kỳ đánh giá" description="Kỳ đánh giá dùng để gom kết quả theo khoảng thời gian." footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPeriodModalOpen(false)}>Hủy</Button><Button form="period-form" loading={submitting} type="submit">Tạo kỳ</Button></div>}>
          <form id="period-form" className="space-y-4" onSubmit={submitPeriod}>
            <div><Label>Tên kỳ</Label><Input required value={periodForm.name} onChange={(event) => setPeriodForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Ngày bắt đầu</Label><Input required type="date" value={periodForm.startDate} onChange={(event) => setPeriodForm((current) => ({ ...current, startDate: event.target.value }))} /></div>
              <div><Label>Ngày kết thúc</Label><Input required type="date" value={periodForm.endDate} onChange={(event) => setPeriodForm((current) => ({ ...current, endDate: event.target.value }))} /></div>
            </div>
            <div><Label>Trạng thái</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={periodForm.status} onChange={(event) => setPeriodForm((current) => ({ ...current, status: event.target.value }))}>{periodStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
            {formError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
          </form>
        </Modal>

        <Modal open={evaluationModalOpen} onOpenChange={setEvaluationModalOpen} title="Nhập đánh giá" description="Lưu nháp để kiểm tra nội bộ hoặc công bố để giáo viên xem kết quả." wide footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEvaluationModalOpen(false)}>Hủy</Button><Button variant="secondary" loading={submitting} onClick={() => submitEvaluation("draft")}>Lưu nháp</Button><Button loading={submitting} onClick={() => submitEvaluation("published")}>Công bố kết quả</Button></div>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Kỳ đánh giá</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={evaluationForm.periodId} onChange={(event) => setEvaluationForm((current) => ({ ...current, periodId: event.target.value }))}><option value="">Chọn kỳ</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name || period.id}</option>)}</select></div>
            <div><Label>Giáo viên</Label><select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={evaluationForm.teacherId} onChange={(event) => setEvaluationForm((current) => ({ ...current, teacherId: event.target.value }))}><option value="">Chọn giáo viên</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName || teacher.email || teacher.id}</option>)}</select></div>
            {criteriaNames.map((name, index) => <div key={name}><Label>{name}</Label><Input min="0" max="10" step="0.5" type="number" value={evaluationForm.scores[index]} onChange={(event) => setEvaluationForm((current) => ({ ...current, scores: current.scores.map((score, scoreIndex) => scoreIndex === index ? event.target.value : score) }))} /></div>)}
            <div className="sm:col-span-2"><Label>Ghi chú</Label><textarea className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={evaluationForm.notes} onChange={(event) => setEvaluationForm((current) => ({ ...current, notes: event.target.value }))} /></div>
            {formError ? <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
          </div>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
