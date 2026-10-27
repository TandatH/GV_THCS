"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  DoorOpen,
  Download,
  GraduationCap,
  Layers,
  LayoutGrid,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type {
  ExamRoom,
  ExamSession,
  ExamSlot,
  ExamStudentAssignment,
  ExamSubject,
  ExamSupervisorAssignment,
} from "@school/shared";

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
import {
  assignExamSupervisors,
  createOrUpdateExamSlot,
  createOrUpdateExamSubject,
  deleteExamSlot,
  deleteExamSubject,
  finalizeExamDutyToPayroll,
  recordExamDutyAttendance,
  generateExamRoomsAndSeating,
} from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import {
  exportExamMasterScheduleExcel,
  exportExamRoomRosterExcel,
} from "@/lib/exports/exam-excel";

function ExamSessionDetailContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "";

  const [session, setSession] = useState<ExamSession | null>(null);
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [supervisors, setSupervisors] = useState<ExamSupervisorAssignment[]>([]);
  const [catalogSubjects, setCatalogSubjects] = useState<DocumentData[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"slots" | "rooms" | "supervisors">("slots");

  // Action Loading
  const [allocating, setAllocating] = useState(false);
  const [assigningSup, setAssigningSup] = useState(false);
  const [finalizingPayroll, setFinalizingPayroll] = useState(false);

  // Modal: Create/Edit Slot
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState("");
  const [slotShiftNumber, setSlotShiftNumber] = useState(1);
  const [slotStartTime, setSlotStartTime] = useState("07:30");
  const [slotEndTime, setSlotEndTime] = useState("09:00");
  const [slotDuration, setSlotDuration] = useState(90);
  const [slotName, setSlotName] = useState("Ca 1");
  const [savingSlot, setSavingSlot] = useState(false);

  // Modal: Create/Edit ExamSubject
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subSubjectId, setSubSubjectId] = useState("");
  const [subGradeLevel, setSubGradeLevel] = useState<number>(9);
  const [subSlotId, setSubSlotId] = useState("");
  const [subDuration, setSubDuration] = useState(60);
  const [subPaperFormat, setSubPaperFormat] = useState("Trắc nghiệm + Tự luận");
  const [savingSubject, setSavingSubject] = useState(false);

  // Modal: Room Students Detail
  const [roomDetailModalOpen, setRoomDetailModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<ExamRoom | null>(null);
  const [roomStudents, setRoomStudents] = useState<ExamStudentAssignment[]>([]);
  const [loadingRoomStudents, setLoadingRoomStudents] = useState(false);

  // 1. Listen to Session Doc
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onSnapshot(doc(firestore, "examSessions", sessionId), (docSnap) => {
      if (docSnap.exists()) {
        setSession({ id: docSnap.id, ...(docSnap.data() as any) });
      }
    });
    return () => unsub();
  }, [sessionId]);

  // 2. Listen to Slots, Subjects, Rooms, Supervisors
  useEffect(() => {
    if (!sessionId) return;
    const qSlots = query(collection(firestore, "examSlots"), where("sessionId", "==", sessionId));
    const unsubSlots = onSnapshot(qSlots, (snap) => {
      const data: ExamSlot[] = snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) }));
      data.sort((a, b) => a.date.localeCompare(b.date) || a.shiftNumber - b.shiftNumber);
      setSlots(data);
    });

    const qSubs = query(collection(firestore, "examSubjects"), where("sessionId", "==", sessionId));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const data: ExamSubject[] = snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) }));
      data.sort((a, b) => a.gradeLevel - b.gradeLevel);
      setExamSubjects(data);
    });

    const qRooms = query(collection(firestore, "examRooms"), where("sessionId", "==", sessionId));
    const unsubRooms = onSnapshot(qRooms, (snap) => {
      const data: ExamRoom[] = snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) }));
      data.sort((a, b) => a.roomNumber - b.roomNumber);
      setRooms(data);
    });

    const qSups = query(collection(firestore, "examSupervisorAssignments"), where("sessionId", "==", sessionId));
    const unsubSups = onSnapshot(qSups, (snap) => {
      const data: ExamSupervisorAssignment[] = snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) }));
      setSupervisors(data);
      setLoading(false);
    });

    const unsubCatalogSubs = onSnapshot(collection(firestore, "subjects"), (snap) => {
      setCatalogSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubSlots();
      unsubSubs();
      unsubRooms();
      unsubSups();
      unsubCatalogSubs();
    };
  }, [sessionId]);

  const handleOpenCreateSlot = () => {
    setEditingSlotId(null);
    setSlotDate(session?.startDate || new Date().toISOString().slice(0, 10));
    setSlotShiftNumber((slots.length % 3) + 1);
    setSlotStartTime("07:30");
    setSlotEndTime("09:00");
    setSlotDuration(90);
    setSlotName(`Ca ${(slots.length % 3) + 1}`);
    setSlotModalOpen(true);
  };

  const handleSaveSlot = async () => {
    if (!slotDate || !slotStartTime || !slotEndTime) {
      toast.error("Vui lòng nhập đầy đủ ngày và khung giờ thi.");
      return;
    }
    setSavingSlot(true);
    try {
      await createOrUpdateExamSlot({
        id: editingSlotId || undefined,
        sessionId,
        name: slotName || `Ca ${slotShiftNumber}`,
        date: slotDate,
        shiftNumber: Number(slotShiftNumber),
        startTime: slotStartTime,
        endTime: slotEndTime,
        durationMinutes: Number(slotDuration),
        createdBy: "",
        updatedBy: "",
        isActive: true,
      });
      toast.success(editingSlotId ? "Cập nhật ca thi thành công!" : "Tạo ca thi mới thành công!");
      setSlotModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Không thể lưu ca thi.");
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Bạn có chắc muốn xóa ca thi này? Các môn và phòng thi thuộc ca sẽ bị xóa theo.")) return;
    try {
      await deleteExamSlot(slotId);
      toast.success("Đã xóa ca thi.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể xóa ca thi.");
    }
  };

  const handleOpenCreateSubject = () => {
    setEditingSubjectId(null);
    setSubSubjectId(catalogSubjects[0]?.id || "");
    setSubGradeLevel(session?.gradeLevels?.[0] || 9);
    setSubSlotId(slots[0]?.id || "");
    setSubDuration(60);
    setSubPaperFormat("Trắc nghiệm + Tự luận");
    setSubjectModalOpen(true);
  };

  const handleSaveSubject = async () => {
    if (!subSubjectId || !subSlotId) {
      toast.error("Vui lòng chọn môn học và ca thi.");
      return;
    }
    const catSub = catalogSubjects.find((s) => s.id === subSubjectId);
    setSavingSubject(true);
    try {
      await createOrUpdateExamSubject({
        id: editingSubjectId || undefined,
        sessionId,
        subjectId: subSubjectId,
        subjectName: catSub?.name || "Môn thi",
        subjectCode: catSub?.code || "",
        gradeLevel: Number(subGradeLevel),
        slotId: subSlotId,
        durationMinutes: Number(subDuration),
        paperFormat: subPaperFormat,
        roomTypeRequired: "normal",
        expectedStudentCount: 0,
        createdBy: "",
        updatedBy: "",
        isActive: true,
      });
      toast.success(editingSubjectId ? "Cập nhật môn thi thành công!" : "Thêm môn thi thành công!");
      setSubjectModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Không thể lưu môn thi.");
    } finally {
      setSavingSubject(false);
    }
  };

  const handleDeleteSubject = async (subId: string) => {
    if (!confirm("Bạn có chắc muốn xóa môn thi này khỏi đợt thi?")) return;
    try {
      await deleteExamSubject(subId);
      toast.success("Đã xóa môn thi.");
    } catch (err: any) {
      toast.error(err?.message || "Không thể xóa môn thi.");
    }
  };

  const handleAllocateSeating = async () => {
    setAllocating(true);
    try {
      const res = await generateExamRoomsAndSeating({ sessionId, clearExisting: true });
      toast.success(`Đã chia thành công ${res.totalRooms} phòng thi cho ${res.totalStudentsAssigned} học sinh!`);
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi phân chia phòng thi.");
    } finally {
      setAllocating(false);
    }
  };

  const handleAssignSupervisors = async () => {
    setAssigningSup(true);
    try {
      const res = await assignExamSupervisors({ sessionId, clearExisting: true });
      toast.success(`Đã phân công ${res.totalSupervisorsAssigned} lượt giám thị cho ${res.totalRoomsCovered} phòng thi!`);
      if (res.warnings?.length) toast.warning(`Có ${res.warnings.length} phòng thiếu giám thị. Vui lòng kiểm tra ma trận phân công.`);
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi phân công giám thị.");
    } finally {
      setAssigningSup(false);
    }
  };

  const handleFinalizePayroll = async () => {
    if (!confirm("Bạn có chắc muốn chốt đợt kiểm tra và kết chuyển số ca coi thi sang Bảng chấm công & Lương?")) return;
    setFinalizingPayroll(true);
    try {
      const res = await finalizeExamDutyToPayroll(sessionId);
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi chốt công coi thi.");
    } finally {
      setFinalizingPayroll(false);
    }
  };

  const handleViewRoomStudents = async (room: ExamRoom) => {
    setSelectedRoom(room);
    setLoadingRoomStudents(true);
    setRoomDetailModalOpen(true);
    try {
      const q = query(collection(firestore, "examStudentAssignments"), where("examRoomId", "==", room.id));
      const snap = await getDocs(q);
      const list: ExamStudentAssignment[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => a.candidateNumber.localeCompare(b.candidateNumber));
      setRoomStudents(list);
    } catch (err: any) {
      toast.error("Không thể tải danh sách học sinh phòng thi.");
    } finally {
      setLoadingRoomStudents(false);
    }
  };

  const handleExportMasterExcel = () => {
    if (!session) return;
    exportExamMasterScheduleExcel({
      session,
      slots,
      subjects: examSubjects,
      rooms,
      supervisors,
    });
    toast.success("Đã xuất file Excel tổng hợp lịch thi!");
  };

  const handleExportSingleRoom = async (room: ExamRoom) => {
    if (!session) return;
    try {
      const q = query(collection(firestore, "examStudentAssignments"), where("examRoomId", "==", room.id));
      const snap = await getDocs(q);
      const list: ExamStudentAssignment[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const sub = examSubjects.find((s) => s.id === room.examSubjectId);
      const slot = slots.find((s) => s.id === room.slotId);

      const roomSupervisors = supervisors
        .filter((sup) => sup.examRoomId === room.id)
        .map((sup) => `${sup.teacherName} (${sup.role === "chief" ? "Giám thị 1" : "Giám thị 2"})`)
        .join(", ");

      exportExamRoomRosterExcel({
        session,
        room,
        subjectName: sub?.subjectName || "Môn thi",
        slotInfo: slot
          ? {
              date: slot.date,
              shiftNumber: slot.shiftNumber,
              startTime: slot.startTime,
              endTime: slot.endTime,
            }
          : undefined,
        students: list,
        supervisorsText: roomSupervisors,
      });

      toast.success(`Đã xuất danh sách phòng thi ${room.roomCode}!`);
    } catch (err: any) {
      toast.error("Không thể xuất file Excel phòng thi.");
    }
  };

  if (!sessionId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Không tìm thấy thông tin đợt kiểm tra. Vui lòng quay lại danh sách đợt thi.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/admin/exam-schedules"
          className="flex items-center gap-1 hover:text-foreground transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại danh sách đợt thi
        </Link>
      </div>

      <PageHeader
        eyebrow={session?.code}
        title={session?.name || "Chi Tiết Đợt Kiểm Tra"}
        description={`Thời gian thi: ${session?.startDate} đến ${session?.endDate} | Khối: ${session?.gradeLevels?.join(", ")} | Quy cách: ${session?.seatingArrangementType === "mixed_grade_abc" ? "Trộn ABC toàn khối" : "Theo lớp"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/exam-schedules/matrix?sessionId=${sessionId}`}>
              <Button variant="secondary" size="sm">
                <LayoutGrid className="h-4 w-4" />
                Ma Trận Lưới Trực Quan
              </Button>
            </Link>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleAllocateSeating}
              loading={allocating}
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Chia Phòng & SBD
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleAssignSupervisors}
              loading={assigningSup}
            >
              <UsersRound className="h-4 w-4 text-indigo-500" />
              Phân Giám Thị
            </Button>

            <Button variant="secondary" size="sm" onClick={handleExportMasterExcel}>
              <Download className="h-4 w-4 text-emerald-600" />
              Xuất Excel Tổng Hợp
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleFinalizePayroll}
              loading={finalizingPayroll}
            >
              <CheckCircle2 className="h-4 w-4" />
              Chốt Công Sang Bảng Lương
            </Button>
          </div>
        }
      />

      {/* Tab Selector */}
      {session?.requiresReallocation ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Cấu hình thi đã thay đổi. Vui lòng chia lại phòng và phân công giám thị trước khi sử dụng lịch này.</p> : null}
      {session?.operation ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{session.operation.status === "failed" ? "Thao tác trước bị gián đoạn. Vui lòng chạy lại cùng thao tác để hoàn tất dữ liệu." : "Hệ thống đang xử lý dữ liệu đợt thi."}</p> : null}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("slots")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === "slots"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="h-4 w-4" />
          Ca Thi & Môn Thi ({slots.length} ca, {examSubjects.length} môn)
        </button>

        <button
          onClick={() => setActiveTab("rooms")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === "rooms"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <DoorOpen className="h-4 w-4" />
          Phòng Thi & Thí Sinh ({rooms.length} phòng)
        </button>

        <button
          onClick={() => setActiveTab("supervisors")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === "supervisors"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <UsersRound className="h-4 w-4" />
          Phân Công Giám Thị ({supervisors.length} lượt phân công)
        </button>
      </div>

      {/* TAB 1: SLOTS & SUBJECTS */}
      {activeTab === "slots" && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">1. Danh Sách Ca Thi</h3>
              <Button size="sm" onClick={handleOpenCreateSlot}>
                <Plus className="h-4 w-4" /> Thêm Ca Thi
              </Button>
            </div>

            {slots.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Chưa có ca thi nào được tạo. Bấm "Thêm Ca Thi" để bắt đầu thiết lập thời gian.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {slots.map((slot) => (
                  <Card key={slot.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                        Ca {slot.shiftNumber}
                      </span>
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Xóa ca thi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <h4 className="font-bold">{slot.name}</h4>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Ngày: <strong>{slot.date}</strong></p>
                      <p>Thời gian: <strong>{slot.startTime} – {slot.endTime}</strong> ({slot.durationMinutes} phút)</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">2. Danh Sách Môn Thi Theo Khối</h3>
              <Button size="sm" onClick={handleOpenCreateSubject} disabled={slots.length === 0}>
                <Plus className="h-4 w-4" /> Thêm Môn Thi
              </Button>
            </div>

            {examSubjects.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Chưa có môn thi nào. Vui lòng thêm môn thi và gán vào ca thi tương ứng.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {examSubjects.map((sub) => {
                  const slot = slots.find((s) => s.id === sub.slotId);

                  return (
                    <Card key={sub.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700">
                          Khối {sub.gradeLevel}
                        </span>
                        <button
                          onClick={() => handleDeleteSubject(sub.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <h4 className="text-base font-bold">{sub.subjectName}</h4>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Ca thi: <strong>{slot?.name || "—"}</strong> ({slot?.date})</p>
                        <p>Thời lượng: <strong>{sub.durationMinutes} phút</strong></p>
                        <p>Hình thức: <strong>{sub.paperFormat}</strong></p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ROOMS & STUDENTS */}
      {activeTab === "rooms" && (
        <div className="space-y-4">
          {rooms.length === 0 ? (
            <EmptyState
              title="Chưa có phòng thi nào"
              description="Hãy bấm 'Chia Phòng & SBD' ở góc trên để hệ thống tự động gom học sinh và tạo phòng thi."
              action={
                <Button onClick={handleAllocateSeating} loading={allocating}>
                  <Sparkles className="h-4 w-4 text-amber-500" /> Tự Động Chia Phòng & SBD
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => {
                const sub = examSubjects.find((s) => s.id === room.examSubjectId);
                const slot = slots.find((s) => s.id === room.slotId);

                return (
                  <Card key={room.id} className="p-5 space-y-3 transition hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                        {room.roomCode}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        Khối {room.gradeLevel}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-bold">{room.physicalRoomName}</h4>
                      <p className="text-xs text-muted-foreground">
                        Môn: <strong>{sub?.subjectName || "—"}</strong> | Ngày: {slot?.date} (Ca {slot?.shiftNumber})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sĩ số: <strong>{room.studentCount} học sinh</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleViewRoomStudents(room)}
                      >
                        <Users className="h-3.5 w-3.5" /> Xem Thí Sinh
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportSingleRoom(room)}
                        title="Xuất phiếu thu bài & danh sách thi"
                      >
                        <Download className="h-4 w-4 text-emerald-600" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUPERVISORS */}
      {activeTab === "supervisors" && (
        <div className="space-y-4">
          {supervisors.length === 0 ? (
            <EmptyState
              title="Chưa phân công giám thị"
              description="Bấm 'Phân Giám Thị' ở góc trên để chạy thuật toán phân bổ giáo viên chống trùng môn, trùng ca."
              action={
                <Button onClick={handleAssignSupervisors} loading={assigningSup}>
                  <UsersRound className="h-4 w-4" /> Phân Giám Thị Tự Động
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Đã phân công tổng cộng <strong>{supervisors.length} lượt giám thị</strong>.
                </p>
              </div>

              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Giáo viên</th>
                      <th className="p-3">Mã GV</th>
                      <th className="p-3">Ngày thi</th>
                      <th className="p-3">Ca thi</th>
                      <th className="p-3">Phòng thi</th>
                      <th className="p-3">Nhiệm vụ</th>
                      <th className="p-3">Trạng thái</th>
                      <th className="p-3">Điểm danh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {supervisors.map((sup) => {
                      const room = rooms.find((r) => r.id === sup.examRoomId);

                      return (
                        <tr key={sup.id} className="hover:bg-muted/30">
                          <td className="p-3 font-semibold">{sup.teacherName}</td>
                          <td className="p-3 font-mono text-xs">{sup.teacherCode || "—"}</td>
                          <td className="p-3">{sup.date}</td>
                          <td className="p-3">Ca {sup.shiftNumber}</td>
                          <td className="p-3 font-medium">{room?.physicalRoomName || room?.roomCode || "—"}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                sup.role === "chief"
                                  ? "bg-blue-100 text-blue-800"
                                  : sup.role === "assistant"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {sup.role === "chief"
                                ? "Giám thị 1"
                                : sup.role === "assistant"
                                ? "Giám thị 2"
                                : "Hành lang"}
                            </span>
                          </td>
                          <td className="p-3 text-xs">
                            {sup.payrollRecorded ? (
                              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" /> Đã chốt lương
                              </span>
                            ) : (
                              <span className="text-amber-600">Chưa chốt lương</span>
                            )}
                          </td>
                          <td className="p-3">
                            <select aria-label={`Điểm danh ${sup.teacherName}`} className="rounded border border-border bg-background p-2 text-xs"
                              value={sup.checkinStatus} disabled={sup.payrollRecorded || session?.status === "locked" || session?.status === "completed"}
                              onChange={async (event) => {
                                try { await recordExamDutyAttendance(sup.id, event.target.value as typeof sup.checkinStatus); }
                                catch (error: any) { toast.error(error?.message || "Không thể lưu điểm danh."); }
                              }}>
                              <option value="not_started">Chưa xác nhận</option>
                              <option value="present">Có mặt</option>
                              <option value="late">Đi trễ</option>
                              <option value="absent">Vắng</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Modal Tạo/Sửa Ca thi */}
      <Modal open={slotModalOpen} onOpenChange={setSlotModalOpen} title="Thêm / Chỉnh Sửa Ca Thi">
        <div className="space-y-4">
          <div>
            <Label>Tên ca thi *</Label>
            <Input
              placeholder="VD: Ca 1 - Sáng Thứ Hai"
              value={slotName}
              onChange={(e) => setSlotName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ngày thi *</Label>
              <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
            </div>
            <div>
              <Label>Số thứ tự ca (1, 2, 3...)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={slotShiftNumber}
                onChange={(e) => setSlotShiftNumber(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Giờ bắt đầu *</Label>
              <Input type="time" value={slotStartTime} onChange={(e) => setSlotStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Giờ kết thúc *</Label>
              <Input type="time" value={slotEndTime} onChange={(e) => setSlotEndTime(e.target.value)} />
            </div>
            <div>
              <Label>Thời lượng (phút)</Label>
              <Input
                type="number"
                min={15}
                max={180}
                value={slotDuration}
                onChange={(e) => setSlotDuration(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setSlotModalOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveSlot} loading={savingSlot}>
              Lưu Ca Thi
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Tạo/Sửa Môn thi */}
      <Modal open={subjectModalOpen} onOpenChange={setSubjectModalOpen} title="Thêm Môn Thi Vào Đợt Kiểm Tra">
        <div className="space-y-4">
          <div>
            <Label>Môn học *</Label>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={subSubjectId}
              onChange={(e) => setSubSubjectId(e.target.value)}
            >
              <option value="">-- Chọn môn học --</option>
              {catalogSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Khối lớp *</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={subGradeLevel}
                onChange={(e) => setSubGradeLevel(Number(e.target.value))}
              >
                {[6, 7, 8, 9].map((g) => (
                  <option key={g} value={g}>
                    Khối {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Gán vào Ca thi *</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={subSlotId}
                onChange={(e) => setSubSlotId(e.target.value)}
              >
                <option value="">-- Chọn ca thi --</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Ngày {s.date}, Ca {s.shiftNumber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Thời lượng làm bài (phút)</Label>
              <Input
                type="number"
                min={15}
                max={180}
                value={subDuration}
                onChange={(e) => setSubDuration(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Hình thức thi</Label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={subPaperFormat}
                onChange={(e) => setSubPaperFormat(e.target.value)}
              >
                <option value="Trắc nghiệm + Tự luận">Trắc nghiệm + Tự luận</option>
                <option value="100% Trắc nghiệm">100% Trắc nghiệm</option>
                <option value="100% Tự luận">100% Tự luận</option>
                <option value="Thực hành">Thực hành</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setSubjectModalOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveSubject} loading={savingSubject}>
              Lưu Môn Thi
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Xem Thí Sinh Phòng Thi */}
      <Modal
        open={roomDetailModalOpen}
        onOpenChange={setRoomDetailModalOpen}
        title={`Danh Sách Thí Sinh — ${selectedRoom?.roomCode} (${selectedRoom?.physicalRoomName})`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              Tổng số: <strong>{roomStudents.length} học sinh</strong> | Khối:{" "}
              <strong>{selectedRoom?.gradeLevel}</strong>
            </p>
            {selectedRoom && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleExportSingleRoom(selectedRoom)}
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" /> Xuất Excel
              </Button>
            )}
          </div>

          {loadingRoomStudents ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/50 font-semibold uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="p-2">STT</th>
                    <th className="p-2">SBD</th>
                    <th className="p-2">Họ và tên</th>
                    <th className="p-2">Lớp</th>
                    <th className="p-2">Số bàn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {roomStudents.map((st, idx) => (
                    <tr key={st.id} className="hover:bg-muted/30">
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2 font-mono font-bold text-primary">{st.candidateNumber}</td>
                      <td className="p-2 font-medium">{st.studentName}</td>
                      <td className="p-2">{st.className}</td>
                      <td className="p-2">{st.deskNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function ExamSessionDetailPage() {
  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-16">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          }
        >
          <ExamSessionDetailContent />
        </Suspense>
      </Shell>
    </RoleGuard>
  );
}
