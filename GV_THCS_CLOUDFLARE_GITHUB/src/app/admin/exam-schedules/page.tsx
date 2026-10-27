"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  DoorOpen,
  Edit,
  GraduationCap,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { ExamSession, ExamSessionStatus, SeatingArrangementType } from "@school/shared";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
} from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import {
  assignExamSupervisors,
  createOrUpdateExamSession,
  deleteExamSession,
  generateExamRoomsAndSeating,
} from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";

const statusLabels: Record<ExamSessionStatus, { label: string; color: string }> = {
  draft: { label: "Nháp", color: "bg-slate-100 text-slate-700 border-slate-300" },
  scheduled: { label: "Đã xếp phòng & SBD", color: "bg-amber-100 text-amber-800 border-amber-300" },
  published: { label: "Đã công bố", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  in_progress: { label: "Đang diễn ra", color: "bg-amber-100 text-amber-800 border-amber-300" },
  completed: { label: "Hoàn thành", color: "bg-blue-100 text-blue-800 border-blue-300" },
  locked: { label: "Đã khóa số liệu", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

export default function ExamSchedulesPage() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [schoolYears, setSchoolYears] = useState<DocumentData[]>([]);
  const [semesters, setSemesters] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSession, setEditingSession] = useState<ExamSession | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [schoolYearId, setSchoolYearId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [gradeLevels, setGradeLevels] = useState<number[]>([6, 7, 8, 9]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [arrangementType, setArrangementType] = useState<SeatingArrangementType>("mixed_grade_abc");
  const [maxStudents, setMaxStudents] = useState<number>(24);
  const [mergeRemainder, setMergeRemainder] = useState(false);
  const [supervisorsPerRoom, setSupervisorsPerRoom] = useState<number>(2);
  const [description, setDescription] = useState("");

  // Action Loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // 1. Listen to Exam Sessions
  useEffect(() => {
    const q = query(collection(firestore, "examSessions"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: ExamSession[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      data.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
      setSessions(data.filter((s) => s.isActive !== false));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch School Years and Semesters
  useEffect(() => {
    const unsubYears = onSnapshot(collection(firestore, "schoolYears"), (snap) => {
      setSchoolYears(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubSemesters = onSnapshot(collection(firestore, "semesters"), (snap) => {
      setSemesters(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubYears();
      unsubSemesters();
    };
  }, []);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchSearch =
        search === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [sessions, search, statusFilter]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingSession(null);
    setCode(`KTGK_${new Date().getFullYear()}`);
    setName(`Kiểm tra Giữa Học kỳ 1 (${new Date().getFullYear()} - ${new Date().getFullYear() + 1})`);
    setSchoolYearId(schoolYears[0]?.id || "");
    setSemesterId(semesters[0]?.id || "");
    setGradeLevels([6, 7, 8, 9]);
    setStartDate(new Date().toISOString().slice(0, 10));
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 5);
    setEndDate(nextWeek.toISOString().slice(0, 10));
    setArrangementType("mixed_grade_abc");
    setMaxStudents(24);
    setMergeRemainder(false);
    setSupervisorsPerRoom(2);
    setDescription("");
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (session: ExamSession) => {
    setEditingSession(session);
    setCode(session.code);
    setName(session.name);
    setSchoolYearId(session.schoolYearId);
    setSemesterId(session.semesterId);
    setGradeLevels(session.gradeLevels || [6, 7, 8, 9]);
    setStartDate(session.startDate);
    setEndDate(session.endDate);
    setArrangementType(session.seatingArrangementType || "mixed_grade_abc");
    setMaxStudents(session.maxStudentsPerRoom || 24);
    setMergeRemainder(session.mergeRemainderStudents ?? false);
    setSupervisorsPerRoom(session.supervisorsPerRoom || 2);
    setDescription(session.description || "");
    setModalOpen(true);
  };

  // Submit Save
  const handleSaveSession = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Vui lòng nhập mã và tên đợt kiểm tra.");
      return;
    }
    if (!schoolYearId || !semesterId) {
      toast.error("Vui lòng chọn năm học và học kỳ.");
      return;
    }
    if (gradeLevels.length === 0) {
      toast.error("Vui lòng chọn ít nhất một khối áp dụng.");
      return;
    }
    if (startDate > endDate) {
      toast.error("Ngày bắt đầu không thể sau ngày kết thúc.");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        code,
        name,
        schoolYearId,
        semesterId,
        schoolLevels: ["secondary"],
        gradeLevels,
        startDate,
        endDate,
        status: editingSession?.status || "draft",
        seatingArrangementType: arrangementType,
        maxStudentsPerRoom: Number(maxStudents),
        mergeRemainderStudents: mergeRemainder,
        supervisorsPerRoom: Number(supervisorsPerRoom),
        description: description || "",
        createdBy: "",
        updatedBy: "",
        isActive: true,
      };
      if (editingSession?.id) {
        payload.id = editingSession.id;
      }
      await createOrUpdateExamSession(payload);

      toast.success(editingSession ? "Cập nhật đợt thi thành công!" : "Tạo đợt kiểm tra mới thành công!");
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Không thể lưu đợt kiểm tra.");
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDeleteSession = async (session: ExamSession) => {
    const sId = session.id || "";
    if (!sId) return;
    if (!confirm(`Bạn có chắc muốn xóa đợt kiểm tra "${session.name}"? Dữ liệu phòng thi và phân công liên quan sẽ bị xóa.`)) {
      return;
    }
    setActionLoadingId(sId);
    try {
      await deleteExamSession(sId);
      toast.success("Đã xóa đợt kiểm tra thành công.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể xóa đợt kiểm tra.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Trigger Seating & Room Allocation
  const handleAllocateSeating = async (sessionId: string) => {
    setActionLoadingId(`seat_${sessionId}`);
    try {
      const res = await generateExamRoomsAndSeating({ sessionId, clearExisting: true });
      toast.success(`Đã chia thành công ${res.totalRooms} phòng thi và cấp SBD cho ${res.totalStudentsAssigned} học sinh!`);
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi phân chia phòng thi.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Trigger Supervisor Assignment
  const handleAssignSupervisors = async (sessionId: string) => {
    setActionLoadingId(`sup_${sessionId}`);
    try {
      const res = await assignExamSupervisors({ sessionId, clearExisting: true });
      toast.success(`Đã phân công ${res.totalSupervisorsAssigned} lượt giám thị cho ${res.totalRoomsCovered} phòng thi!`);
      if (res.warnings?.length) toast.warning(`Có ${res.warnings.length} phòng thiếu giám thị. Vui lòng kiểm tra ma trận phân công.`);
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi phân công giám thị.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleGrade = (grade: number) => {
    setGradeLevels((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade].sort()
    );
  };

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="mx-auto max-w-7xl space-y-6">
          <PageHeader
            title="Quản Lý Lịch Kiểm Tra & Thi"
            description="Tạo đợt kiểm tra tập trung, tự động chia phòng thi, cấp SBD và phân công giám thị chuẩn logic."
            actions={
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4" />
                Tạo Đợt Kiểm Tra Mới
              </Button>
            }
          />

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex items-center gap-4 p-5">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tổng số đợt thi</p>
                <p className="text-2xl font-bold">{sessions.length}</p>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
              <div className="rounded-xl bg-amber-500/10 p-3 text-amber-600">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Đang chuẩn bị</p>
                <p className="text-2xl font-bold">
                  {sessions.filter((s) => s.status === "draft" || s.status === "scheduled").length}
                </p>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
              <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Đã công bố</p>
                <p className="text-2xl font-bold">
                  {sessions.filter((s) => s.status === "published").length}
                </p>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
              <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-600">
                <UsersRound className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Khối THCS</p>
                <p className="text-2xl font-bold">Khối 6 – 9</p>
              </div>
            </Card>
          </div>

          {/* Filter & Search Bar */}
          <Card className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Tìm theo tên hoặc mã đợt kiểm tra..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="draft">Nháp</option>
                  <option value="scheduled">Đã xếp phòng & SBD</option>
                  <option value="published">Đã công bố</option>
                  <option value="completed">Hoàn thành</option>
                  <option value="locked">Đã khóa</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Sessions List */}
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <EmptyState
              title="Chưa có đợt kiểm tra nào"
              description="Hãy bắt đầu bằng việc tạo một đợt kiểm tra mới cho học kỳ hiện tại."
              action={
                <Button onClick={handleOpenCreate}>
                  <Plus className="h-4 w-4" /> Tạo đợt thi mới
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {filteredSessions.map((session) => {
                const sId = session.id || "";
                const statusMeta = statusLabels[session.status] || statusLabels.draft;
                const isActionLoading = actionLoadingId?.includes(sId);

                return (
                  <Card key={sId} className="p-6 transition hover:shadow-md">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {session.code}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.color}`}
                          >
                            {statusMeta.label}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {session.seatingArrangementType === "mixed_grade_abc"
                              ? "Trộn ABC toàn khối"
                              : "Theo lớp học"}
                          </span>
                        </div>

                        <h3 className="text-lg font-bold text-foreground">{session.name}</h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {session.startDate} đến {session.endDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <GraduationCap className="h-3.5 w-3.5" />
                            Khối: {session.gradeLevels?.join(", ") || "6, 7, 8, 9"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            Tối đa {session.maxStudentsPerRoom || 24} HS/phòng
                          </span>
                          <span className="flex items-center gap-1">
                            <DoorOpen className="h-3.5 w-3.5" />
                            {session.supervisorsPerRoom || 2} giám thị/phòng
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/exam-schedules/detail?sessionId=${sId}`}>
                          <Button variant="secondary" size="sm" title="Quản lý ca thi, môn thi và phòng thi">
                            <Layers className="h-3.5 w-3.5 text-primary" />
                            Chi Tiết & Ca Thi
                          </Button>
                        </Link>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAllocateSeating(sId)}
                          loading={actionLoadingId === `seat_${sId}`}
                          title="Tự động chia học sinh vào phòng và cấp SBD chuẩn"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          Chia Phòng & SBD
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAssignSupervisors(sId)}
                          loading={actionLoadingId === `sup_${sId}`}
                          title="Phân công giám thị tự động chống trùng môn, trùng ca"
                        >
                          <UsersRound className="h-3.5 w-3.5 text-indigo-500" />
                          Phân Giám Thị
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(session)}
                          title="Chỉnh sửa thông tin"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteSession(session)}
                          loading={actionLoadingId === sId}
                          title="Xóa đợt thi"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Modal Tạo / Chỉnh sửa */}
          <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            title={editingSession ? "Chỉnh Sửa Đợt Kiểm Tra" : "Tạo Đợt Kiểm Tra Mới"}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Mã đợt thi *</Label>
                  <Input
                    placeholder="VD: GHK1_2026"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Tên đợt kiểm tra *</Label>
                  <Input
                    placeholder="VD: Kiểm tra Giữa Học kỳ 1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Năm học *</Label>
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={schoolYearId}
                    onChange={(e) => setSchoolYearId(e.target.value)}
                  >
                    <option value="">-- Chọn năm học --</option>
                    {schoolYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name || y.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Học kỳ *</Label>
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={semesterId}
                    onChange={(e) => setSemesterId(e.target.value)}
                  >
                    <option value="">-- Chọn học kỳ --</option>
                    {semesters.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label>Khối lớp áp dụng *</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[6, 7, 8, 9].map((g) => {
                    const active = gradeLevels.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGrade(g)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        Khối {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Ngày bắt đầu *</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Ngày kết thúc *</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label>Quy cách chia phòng</Label>
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={arrangementType}
                    onChange={(e) => setArrangementType(e.target.value as any)}
                  >
                    <option value="mixed_grade_abc">Trộn ABC toàn khối</option>
                    <option value="by_class">Theo danh sách lớp</option>
                  </select>
                </div>
                <div>
                  <Label>Sĩ số tối đa / phòng</Label>
                  <Input
                    type="number"
                    min={10}
                    max={50}
                    value={maxStudents}
                    onChange={(e) => setMaxStudents(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Số giám thị / phòng</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    value={supervisorsPerRoom}
                    onChange={(e) => setSupervisorsPerRoom(Number(e.target.value))}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={mergeRemainder} onChange={(event) => setMergeRemainder(event.target.checked)} />
                Dồn phòng cuối dưới 6 học sinh vào các phòng trước nếu mỗi phòng không quá 28 học sinh.
              </label>
              <div>
                <Label>Ghi chú</Label>
                <Input
                  placeholder="Ghi chú thêm về đợt thi..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Hủy
                </Button>
                <Button onClick={handleSaveSession} loading={saving}>
                  {editingSession ? "Lưu Thay Đổi" : "Tạo Đợt Thi"}
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}
