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
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  DoorOpen,
  Download,
  GraduationCap,
  Layers,
  LayoutGrid,
  RefreshCw,
  Sparkles,
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
  Modal,
} from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { firestore } from "@/lib/firebase/client";
import { exportExamMasterScheduleExcel } from "@/lib/exports/exam-excel";

function ExamMatrixContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "";

  const [session, setSession] = useState<ExamSession | null>(null);
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [supervisors, setSupervisors] = useState<ExamSupervisorAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: View Room Detail
  const [selectedRoom, setSelectedRoom] = useState<ExamRoom | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const unsubSession = onSnapshot(doc(firestore, "examSessions", sessionId), (snap) => {
      if (snap.exists()) {
        setSession({ id: snap.id, ...(snap.data() as any) });
      }
    });

    const qSlots = query(collection(firestore, "examSlots"), where("sessionId", "==", sessionId));
    const unsubSlots = onSnapshot(qSlots, (snap) => {
      const data: ExamSlot[] = snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) }));
      data.sort((a, b) => a.date.localeCompare(b.date) || a.shiftNumber - b.shiftNumber);
      setSlots(data);
    });

    const qSubs = query(collection(firestore, "examSubjects"), where("sessionId", "==", sessionId));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      setExamSubjects(snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const qRooms = query(collection(firestore, "examRooms"), where("sessionId", "==", sessionId));
    const unsubRooms = onSnapshot(qRooms, (snap) => {
      setRooms(snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const qSups = query(collection(firestore, "examSupervisorAssignments"), where("sessionId", "==", sessionId));
    const unsubSups = onSnapshot(qSups, (snap) => {
      setSupervisors(snap.docs.filter((d) => d.data().isActive !== false).map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    });

    return () => {
      unsubSession();
      unsubSlots();
      unsubSubs();
      unsubRooms();
      unsubSups();
    };
  }, [sessionId]);

  const grades = session?.gradeLevels || [6, 7, 8, 9];

  const getRoomsForCell = (slotId: string, grade: number) => {
    return rooms.filter((r) => r.slotId === slotId && r.gradeLevel === grade);
  };

  const getSubjectForCell = (slotId: string, grade: number) => {
    return examSubjects.find((s) => s.slotId === slotId && s.gradeLevel === grade);
  };

  const handleExportExcel = async () => {
    if (!session) return;
    try {
      await exportExamMasterScheduleExcel({
        session,
        slots,
        subjects: examSubjects,
        rooms,
        supervisors,
      });
      toast.success("Đã xuất file Excel tổng hợp lịch thi!");
    } catch (err: any) {
      toast.error("Không thể xuất file Excel tổng hợp.");
    }
  };

  if (!sessionId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Không tìm thấy đợt kiểm tra. Vui lòng quay lại danh sách đợt thi.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[95rem] space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href={`/admin/exam-schedules/detail?sessionId=${sessionId}`}
          className="flex items-center gap-1 hover:text-foreground transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại chi tiết đợt thi
        </Link>
      </div>

      <PageHeader
        eyebrow="Ma trận điều hành"
        title={`Ma Trận Lịch Thi & Giám Thị — ${session?.name || ""}`}
        description="Theo dõi trực quan toàn bộ các ca thi, môn thi, phòng thi và phân bổ giám thị trên toàn trường."
        actions={
          <Button variant="secondary" size="sm" onClick={handleExportExcel}>
            <Download className="h-4 w-4 text-emerald-600" />
            Xuất File Excel Tổng Hợp
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          title="Chưa có ca thi nào"
          description="Vui lòng tạo ít nhất một ca thi trước khi xem ma trận."
          action={
            <Link href={`/admin/exam-schedules/detail?sessionId=${sessionId}`}>
              <Button>Tạo ca thi mới</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 z-10 w-28 border-r border-border bg-muted/80 p-4">
                  Khối Lớp
                </th>
                {slots.map((slot) => (
                  <th key={slot.id} className="min-w-[280px] border-r border-border p-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                          Ca {slot.shiftNumber}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {slot.startTime} – {slot.endTime}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-foreground">{slot.name}</p>
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {slot.date}
                      </p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border text-sm">
              {grades.map((grade) => (
                <tr key={grade} className="transition hover:bg-muted/10">
                  <td className="sticky left-0 z-10 border-r border-border bg-muted/40 p-4 font-bold text-foreground">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      <span>Khối {grade}</span>
                    </div>
                  </td>

                  {slots.map((slot) => {
                    const cellSubject = getSubjectForCell(slot.id, grade);
                    const cellRooms = getRoomsForCell(slot.id, grade);

                    return (
                      <td
                        key={slot.id}
                        className="border-r border-border p-3 align-top min-w-[280px]"
                      >
                        {cellSubject ? (
                          <div className="space-y-2.5">
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-primary">
                                  {cellSubject.subjectName}
                                </span>
                                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                  {cellSubject.durationMinutes}p
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {cellRooms.length > 0 ? `${cellRooms.length} phòng thi` : "Chưa chia phòng"}
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              {cellRooms.map((room) => {
                                const roomSups = supervisors.filter((s) => s.examRoomId === room.id);
                                const hasMissingSupervisors = roomSups.length < (session?.supervisorsPerRoom || 2);

                                return (
                                  <div
                                    key={room.id}
                                    onClick={() => {
                                      setSelectedRoom(room);
                                      setModalOpen(true);
                                    }}
                                    className={`cursor-pointer rounded-lg border p-2.5 text-xs transition hover:border-primary hover:shadow-sm ${
                                      hasMissingSupervisors
                                        ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"
                                        : "border-border bg-background"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-bold">
                                      <span>{room.roomCode} ({room.physicalRoomName})</span>
                                      <span className="text-[10px] text-muted-foreground font-normal">
                                        {room.studentCount} HS
                                      </span>
                                    </div>

                                    <div className="mt-1.5 space-y-0.5 text-[11px]">
                                      {roomSups.length === 0 ? (
                                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                                          <AlertTriangle className="h-3 w-3" /> Chưa phân giám thị
                                        </span>
                                      ) : (
                                        roomSups.map((sup) => (
                                          <p key={sup.id} className="text-muted-foreground truncate">
                                            <strong className="text-foreground">
                                              {sup.role === "chief" ? "GT1:" : "GT2:"}
                                            </strong>{" "}
                                            {sup.teacherName}
                                          </p>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground/60">
                            Không có môn thi
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Xem Chi Tiết Phòng Thi */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={`Chi Tiết Phòng Thi: ${selectedRoom?.roomCode} (${selectedRoom?.physicalRoomName})`}
      >
        {selectedRoom && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-4 text-xs space-y-1.5">
              <p>Khối: <strong>{selectedRoom.gradeLevel}</strong></p>
              <p>Sĩ số: <strong>{selectedRoom.studentCount} học sinh</strong></p>
              <p>Phòng học: <strong>{selectedRoom.physicalRoomName}</strong></p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Cán bộ coi thi phân công:
              </h4>
              <div className="space-y-2">
                {supervisors
                  .filter((s) => s.examRoomId === selectedRoom.id)
                  .map((sup) => (
                    <div
                      key={sup.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"
                    >
                      <div>
                        <p className="font-bold">{sup.teacherName}</p>
                        <p className="text-muted-foreground">{sup.teacherCode || "—"}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          sup.role === "chief"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {sup.role === "chief" ? "Giám thị 1" : "Giám thị 2"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ExamMatrixPage() {
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
          <ExamMatrixContent />
        </Suspense>
      </Shell>
    </RoleGuard>
  );
}
