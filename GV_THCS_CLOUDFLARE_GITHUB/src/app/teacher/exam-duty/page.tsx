"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  ArrowLeftRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileText,
  GraduationCap,
  History,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ExamSupervisorAssignment, ExamSupervisorRole, ExamSwapRequest } from "@school/shared";

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
import { getExamSwapCandidates, requestExamSwap } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { exportTeacherDutyScheduleExcel } from "@/lib/exports/exam-excel";

const roleLabels: Record<ExamSupervisorRole, { label: string; color: string }> = {
  chief: { label: "Giám thị 1 (Chính)", color: "bg-blue-100 text-blue-800 border-blue-300" },
  assistant: { label: "Giám thị 2", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  hall: { label: "Giám thị hành lang", color: "bg-amber-100 text-amber-800 border-amber-300" },
};

const swapStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ BGH duyệt", color: "bg-amber-100 text-amber-800" },
  approved: { label: "Đã duyệt", color: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Từ chối", color: "bg-rose-100 text-rose-800" },
  cancelled: { label: "Đã hủy", color: "bg-slate-100 text-slate-800" },
};

type DutyDetail = ExamSupervisorAssignment & {
  roomName?: string;
  roomCode?: string;
  subjectName?: string;
  gradeLevel?: number;
  partnerTeacherName?: string;
  slotStartTime?: string;
  slotEndTime?: string;
};

export default function TeacherExamDutyPage() {
  const { user } = useAuth();

  const [teacherId, setTeacherId] = useState<string>("");
  const [teacherName, setTeacherName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [duties, setDuties] = useState<DutyDetail[]>([]);
  const [swaps, setSwaps] = useState<ExamSwapRequest[]>([]);
  const [activeTab, setActiveTab] = useState<"duties" | "swaps">("duties");

  // Swap Modal State
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedDuty, setSelectedDuty] = useState<DutyDetail | null>(null);
  const [targetTeacherId, setTargetTeacherId] = useState("");
  const [targetAssignmentId, setTargetAssignmentId] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [otherAssignments, setOtherAssignments] = useState<DocumentData[]>([]);
  const [submittingSwap, setSubmittingSwap] = useState(false);

  // 1. Get logged-in teacher context
  useEffect(() => {
    if (!user) return;
    getCurrentTeacherContext(user.uid)
      .then((ctx) => {
        setTeacherId(ctx.teacherId);
        setTeacherName(ctx.teacherProfile.fullName || "Giáo viên");
      })
      .catch((err) => {
        console.error("Error loading teacher profile:", err);
        setLoading(false);
      });
  }, [user]);

  // 2. Listen to supervisor assignments for this teacher
  useEffect(() => {
    if (!teacherId) return;

    const q = query(
      collection(firestore, "examSupervisorAssignments"),
      where("teacherId", "==", teacherId),
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawDuties: ExamSupervisorAssignment[] = snapshot.docs.filter((d) => d.data().isActive !== false).map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      // Enrich duty with room, slot, and subject info
      const enriched: DutyDetail[] = await Promise.all(
        rawDuties.map(async (duty) => {
          let roomName = "";
          let roomCode = "";
          let subjectName = "";
          let gradeLevel: number | undefined;
          let partnerTeacherName = "";
          let slotStartTime = "";
          let slotEndTime = "";

          if (duty.examRoomId) {
            const roomDoc = await getDoc(doc(firestore, "examRooms", duty.examRoomId));
            if (roomDoc.exists()) {
              const rData = roomDoc.data();
              roomName = rData.physicalRoomName || "";
              roomCode = rData.roomCode || "";
              gradeLevel = rData.gradeLevel;

              // Find partner supervisor
              const supIds: string[] = rData.supervisorIds || [];
              const partnerId = supIds.find((id) => id !== teacherId);
              if (partnerId) {
                partnerTeacherName = rData.supervisorNames?.[supIds.indexOf(partnerId)] || "Giáo viên khác";
              }

              // Get subject
              if (rData.examSubjectId) {
                const subDoc = await getDoc(doc(firestore, "examSubjects", rData.examSubjectId));
                subjectName = subDoc.data()?.subjectName || "";
              }
            }
          }

          if (duty.slotId) {
            const slotDoc = await getDoc(doc(firestore, "examSlots", duty.slotId));
            if (slotDoc.exists()) {
              const sData = slotDoc.data();
              slotStartTime = sData.startTime || "";
              slotEndTime = sData.endTime || "";
            }
          }

          return {
            ...duty,
            roomName,
            roomCode,
            subjectName,
            gradeLevel,
            partnerTeacherName,
            slotStartTime,
            slotEndTime,
          };
        }),
      );

      enriched.sort((a, b) => a.date.localeCompare(b.date) || a.shiftNumber - b.shiftNumber);
      setDuties(enriched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [teacherId]);

  // 3. Listen to swap requests related to this teacher
  useEffect(() => {
    if (!teacherId) return;

    const qReq = query(
      collection(firestore, "examSwapRequests"),
      where("requesterTeacherId", "==", teacherId),
    );

    let sent: ExamSwapRequest[] = [];
    let received: ExamSwapRequest[] = [];
    const publish = () => setSwaps([...new Map([...sent, ...received].map((r) => [r.id, r])).values()]);
    const unsubscribe = onSnapshot(qReq, (snap) => {
      const data: ExamSwapRequest[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      sent = data;
      publish();
    });
    const unsubscribeReceived = onSnapshot(query(collection(firestore, "examSwapRequests"), where("targetTeacherId", "==", teacherId)), (snap) => {
      received = snap.docs.map((d) => ({ ...d.data(), id: d.id } as ExamSwapRequest));
      publish();
    });
    return () => { unsubscribe(); unsubscribeReceived(); };
  }, [teacherId]);

  // Open Swap Modal
  const handleOpenSwapModal = async (duty: DutyDetail) => {
    setSelectedDuty(duty);
    setTargetTeacherId("");
    setTargetAssignmentId("");
    setSwapReason("");

    // Fetch other supervisor assignments in the same session that belong to OTHER teachers
    try {
      const others = await getExamSwapCandidates(duty.id);

      setOtherAssignments(others);
      setSwapModalOpen(true);
    } catch (err: any) {
      toast.error("Không thể tải danh sách ca coi thi khả dụng để đổi.");
    }
  };

  // Submit Swap Request
  const handleSubmitSwap = async () => {
    if (!selectedDuty) return;
    if (!targetAssignmentId) {
      toast.error("Vui lòng chọn ca coi thi muốn đổi.");
      return;
    }
    if (!swapReason.trim()) {
      toast.error("Vui lòng nhập lý do xin đổi ca.");
      return;
    }

    const targetAssignment = otherAssignments.find((a) => a.id === targetAssignmentId);
    if (!targetAssignment) return;

    setSubmittingSwap(true);
    try {
      await requestExamSwap({
        sessionId: selectedDuty.sessionId,
        requesterTeacherId: teacherId,
        requesterTeacherName: teacherName,
        requesterAssignmentId: selectedDuty.id || "",
        targetTeacherId: targetAssignment.teacherId,
        targetTeacherName: targetAssignment.teacherName || "Giáo viên",
        targetAssignmentId: targetAssignment.id,
        reason: swapReason,
        status: "pending",
        isActive: true,
      });

      toast.success("Đã gửi đơn yêu cầu đổi ca coi thi đến Ban Giám hiệu!");
      setSwapModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Không thể gửi yêu cầu đổi ca.");
    } finally {
      setSubmittingSwap(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["giaovien", "totruong", "admin", "bgh"]}>
      <Shell>
        <div className="mx-auto max-w-5xl space-y-6">
          <PageHeader
            title="Lịch Coi Thi Của Tôi"
            description="Xem chi tiết các ca coi thi được phân công, phòng thi và gửi yêu cầu đổi ca khi cần thiết."
          />
          <Button variant="secondary" disabled={!duties.length} onClick={() => exportTeacherDutyScheduleExcel({
            teacherName, sessionName: "Các đợt kiểm tra được phân công",
            duties: duties.map((duty) => ({ date: duty.date, shiftNumber: duty.shiftNumber,
              time: `${duty.slotStartTime ?? ""} – ${duty.slotEndTime ?? ""}`, roomName: duty.roomName || duty.roomCode || "",
              subjectName: duty.subjectName ?? "", gradeLevel: duty.gradeLevel ?? 0, role: roleLabels[duty.role].label, partnerName: duty.partnerTeacherName })),
          })}>Xuất lịch coi thi Excel</Button>

          {/* Tab Selection */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("duties")}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
                activeTab === "duties"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Lịch Coi Thi ({duties.length})
            </button>
            <button
              onClick={() => setActiveTab("swaps")}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
                activeTab === "swaps"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-4 w-4" />
              Đơn Xin Đổi Ca ({swaps.length})
            </button>
          </div>

          {/* Tab 1: Duties List */}
          {activeTab === "duties" && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : duties.length === 0 ? (
                <EmptyState
                  title="Không có ca coi thi nào"
                  description="Bạn hiện chưa có lịch phân công coi thi trong các đợt kiểm tra đang kích hoạt."
                />
              ) : (
                duties.map((duty) => {
                  const roleMeta = roleLabels[duty.role] || roleLabels.chief;

                  return (
                    <Card key={duty.id} className="p-6 transition hover:shadow-md">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                              Ca {duty.shiftNumber}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleMeta.color}`}
                            >
                              {roleMeta.label}
                            </span>
                            {duty.roomCode && (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {duty.roomCode}
                              </span>
                            )}
                          </div>

                          <h3 className="text-lg font-bold text-foreground">
                            {duty.subjectName
                              ? `Môn: ${duty.subjectName} (Khối ${duty.gradeLevel})`
                              : "Môn kiểm tra tập trung"}
                          </h3>

                          <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-primary" />
                              <span>
                                Ngày: <strong>{duty.date}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              <span>
                                Giờ:{" "}
                                <strong>
                                  {duty.slotStartTime && duty.slotEndTime
                                    ? `${duty.slotStartTime} – ${duty.slotEndTime}`
                                    : "Theo hiệu lệnh"}
                                </strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <DoorOpen className="h-3.5 w-3.5 text-primary" />
                              <span>
                                Phòng: <strong>{duty.roomName || "Chưa xếp phòng"}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <UsersRound className="h-3.5 w-3.5 text-primary" />
                              <span>
                                Giám thị cùng phòng:{" "}
                                <strong>{duty.partnerTeacherName || "Chưa có"}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenSwapModal(duty)}
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            Xin Đổi Ca
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: Swaps List */}
          {activeTab === "swaps" && (
            <div className="space-y-4">
              {swaps.length === 0 ? (
                <EmptyState
                  title="Chưa có yêu cầu đổi ca nào"
                  description="Khi bạn có việc bận đột xuất, bạn có thể gửi yêu cầu đổi ca coi thi tại đây để BGH phê duyệt."
                />
              ) : (
                swaps.map((swap) => {
                  const statusMeta = swapStatusLabels[swap.status] || swapStatusLabels.pending;

                  return (
                    <Card key={swap.id} className="p-5">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusMeta.color}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Đổi với: <strong>{swap.targetTeacherName}</strong>
                            </span>
                          </div>
                          <p className="text-sm font-medium">Lý do: {swap.reason}</p>
                          {swap.reviewNote && (
                            <p className="text-xs text-muted-foreground">
                              Ghi chú từ BGH: {swap.reviewNote}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Modal Đổi Ca Coi Thi */}
          <Modal
            open={swapModalOpen}
            onOpenChange={setSwapModalOpen}
            title="Đề Xuất Đổi Ca Coi Thi"
          >
            {selectedDuty && (
              <div className="space-y-4">
                <div className="rounded-xl bg-muted/50 p-4 text-xs space-y-1">
                  <p className="font-semibold text-foreground">Ca hiện tại của bạn:</p>
                  <p>
                    Ngày: <strong>{selectedDuty.date}</strong> | Ca: <strong>{selectedDuty.shiftNumber}</strong> (
                    {selectedDuty.slotStartTime} – {selectedDuty.slotEndTime})
                  </p>
                  <p>
                    Phòng: <strong>{selectedDuty.roomName}</strong> | Môn:{" "}
                    <strong>{selectedDuty.subjectName}</strong>
                  </p>
                </div>

                <div>
                  <Label>Chọn ca coi thi muốn đổi *</Label>
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={targetAssignmentId}
                    onChange={(e) => {
                      setTargetAssignmentId(e.target.value);
                      const a = otherAssignments.find((x) => x.id === e.target.value);
                      setTargetTeacherId(a?.teacherId || "");
                    }}
                  >
                    <option value="">-- Chọn ca coi thi của giáo viên khác --</option>
                    {otherAssignments.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        GV: {a.teacherName} — Ngày {a.date} (Ca {a.shiftNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Lý do xin đổi ca *</Label>
                  <Input
                    placeholder="VD: Trùng lịch khám bệnh, việc gia đình đột xuất..."
                    value={swapReason}
                    onChange={(e) => setSwapReason(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="secondary" onClick={() => setSwapModalOpen(false)}>
                    Hủy
                  </Button>
                  <Button onClick={handleSubmitSwap} loading={submittingSwap}>
                    <Send className="h-4 w-4" />
                    Gửi Đơn Xin Đổi
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}
