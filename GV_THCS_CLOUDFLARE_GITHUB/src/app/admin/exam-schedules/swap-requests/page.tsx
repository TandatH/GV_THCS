"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ExamSwapRequest } from "@school/shared";

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
import { reviewExamSwap } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";

const swapStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ phê duyệt", color: "bg-amber-100 text-amber-800 border-amber-300" },
  approved: { label: "Đã phê duyệt", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejected: { label: "Đã từ chối", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

export default function AdminSwapRequestsPage() {
  const { user } = useAuth();

  const [requests, setRequests] = useState<ExamSwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Review Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<ExamSwapRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    const q = query(collection(firestore, "examSwapRequests"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: ExamSwapRequest[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      data.sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
      setRequests(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredRequests = requests.filter((r) => {
    if (filterStatus === "all") return true;
    return r.status === filterStatus;
  });

  const handleApprove = async (req: ExamSwapRequest) => {
    const reqId = req.id || "";
    if (!reqId) return;
    if (!confirm(`Bạn có chắc chắn duyệt đổi ca giữa thầy/cô ${req.requesterTeacherName} và ${req.targetTeacherName}?`)) {
      return;
    }

    setActionLoadingId(reqId);
    try {
      await reviewExamSwap({
        swapRequestId: reqId,
        action: "approved",
        reviewNote: "Đã được Ban Giám hiệu phê duyệt đổi ca.",
      });
      toast.success("Đã phê duyệt đổi ca coi thi thành công! Lịch phòng thi đã được cập nhật tự động.");
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi duyệt đổi ca.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenReject = (req: ExamSwapRequest) => {
    setSelectedReq(req);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedReq) return;
    const reqId = selectedReq.id || "";
    if (!reqId) return;

    setActionLoadingId(reqId);
    try {
      await reviewExamSwap({
        swapRequestId: reqId,
        action: "rejected",
        reviewNote: rejectReason || "Ban Giám hiệu từ chối đổi ca.",
      });
      toast.success("Đã từ chối đơn đổi ca coi thi.");
      setRejectModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Có lỗi khi từ chối đơn.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="mx-auto max-w-5xl space-y-6">
          <PageHeader
            title="Duyệt Đổi Ca Coi Thi"
            description="Tiếp nhận, kiểm tra xung đột và phê duyệt các yêu cầu hoán đổi ca coi thi từ giáo viên."
          />

          {/* Filter Bar */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Lọc theo:</span>
              <button
                onClick={() => setFilterStatus("pending")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filterStatus === "pending"
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Chờ phê duyệt ({requests.filter((r) => r.status === "pending").length})
              </button>
              <button
                onClick={() => setFilterStatus("approved")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filterStatus === "approved"
                    ? "bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Đã duyệt ({requests.filter((r) => r.status === "approved").length})
              </button>
              <button
                onClick={() => setFilterStatus("rejected")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filterStatus === "rejected"
                    ? "bg-rose-600 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Đã từ chối ({requests.filter((r) => r.status === "rejected").length})
              </button>
              <button
                onClick={() => setFilterStatus("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filterStatus === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Tất cả ({requests.length})
              </button>
            </div>
          </Card>

          {/* List of Swap Requests */}
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              title="Không có yêu cầu đổi ca nào"
              description="Hiện tại không có đơn đổi ca coi thi nào trong trạng thái đã chọn."
            />
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((req) => {
                const statusMeta = swapStatusLabels[req.status] || swapStatusLabels.pending;
                const isLoading = actionLoadingId === req.id;

                return (
                  <Card key={req.id} className="p-6 transition hover:shadow-md">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.color}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-base font-bold text-foreground">
                          <span className="text-primary">{req.requesterTeacherName}</span>
                          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-indigo-600">{req.targetTeacherName}</span>
                        </div>

                        <p className="text-sm text-foreground">
                          <span className="font-semibold">Lý do đổi:</span> {req.reason}
                        </p>

                        {req.reviewNote && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold">Ghi chú duyệt:</span> {req.reviewNote}
                          </p>
                        )}
                      </div>

                      {req.status === "pending" && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleApprove(req)}
                            loading={isLoading}
                          >
                            <Check className="h-4 w-4" />
                            Phê Duyệt
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleOpenReject(req)}
                            disabled={isLoading}
                          >
                            <X className="h-4 w-4" />
                            Từ Chối
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Modal Từ chối */}
          <Modal
            open={rejectModalOpen}
            onOpenChange={setRejectModalOpen}
            title="Từ Chối Đơn Đổi Ca Coi Thi"
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Vui lòng nhập lý do từ chối để thông báo đến giáo viên:
              </p>
              <div>
                <Label>Lý do từ chối</Label>
                <Input
                  placeholder="VD: Không đảm bảo nhân sự, trùng lịch môn thi..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="secondary" onClick={() => setRejectModalOpen(false)}>
                  Hủy
                </Button>
                <Button
                  variant="danger"
                  onClick={handleConfirmReject}
                  loading={Boolean(actionLoadingId)}
                >
                  Xác Nhận Từ Chối
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </Shell>
    </RoleGuard>
  );
}
