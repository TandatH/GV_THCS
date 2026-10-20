"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileSpreadsheet,
  Filter,
  History,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  User,
  Users,
} from "lucide-react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
  Skeleton,
} from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { cn, formatDate } from "@/lib/utils";

type AuditLogRow = DocumentData & {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: any;
  after: any;
  createdAt: any;
};

const actionLabels: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" | "neutral" }> = {
  record_discipline_violation: { label: "Ghi nhận vi phạm", tone: "info" },
  resubmit_discipline_entry: { label: "Nộp lại phiếu vi phạm", tone: "warning" },
  review_discipline_violation_approved: { label: "Duyệt vi phạm (Hợp lệ)", tone: "success" },
  review_discipline_violation_returned: { label: "Trả lại phiếu vi phạm", tone: "warning" },
  review_discipline_violation_rejected: { label: "Từ chối phiếu vi phạm", tone: "danger" },
  submit_discipline_appeal: { label: "GVCN gửi khiếu nại", tone: "warning" },
  resolve_discipline_appeal_approved: { label: "Chấp thuận khiếu nại (Hủy lỗi)", tone: "success" },
  resolve_discipline_appeal_rejected: { label: "Từ chối khiếu nại", tone: "danger" },
  sign_weekly_discipline_score: { label: "Ký xác nhận điểm tuần", tone: "success" },
  lock_weekly_discipline: { label: "Khóa sổ tuần thi đua", tone: "danger" },
  reopen_weekly_discipline: { label: "Mở khóa tuần thi đua", tone: "warning" },
  assign_discipline_role: { label: "Phân công vai trò thi đua", tone: "info" },
  assign_weekly_signer: { label: "Phân công người tổng kết", tone: "info" },
};

export default function DisciplineAuditLogsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center"><Skeleton className="h-40 w-full" /></div>}>
      <DisciplineAuditLogsContent />
    </Suspense>
  );
}

function DisciplineAuditLogsContent() {
  const { user, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, { name: string; email?: string }>>({});

  // Bộ lọc
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal xem chi tiết JSON
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  // 1. TẢI DANH SÁCH USER ĐỂ HIỂN THỊ TÊN NGƯỜI THỰC HIỆN
  useEffect(() => {
    async function loadUsers() {
      try {
        const uSnap = await getDocs(collection(firestore, "users"));
        const map: Record<string, { name: string; email?: string }> = {};
        uSnap.docs.forEach((d) => {
          const dat = d.data();
          map[d.id] = {
            name: dat.fullName || dat.name || dat.displayName || d.id,
            email: dat.email,
          };
        });
        setUsersMap(map);
      } catch (err) {
        console.error("Lỗi tải users:", err);
      }
    }
    loadUsers();
  }, []);

  // 2. TẢI REALTIME AUDIT LOGS CHO MODULE KỶ LUẬT & THI ĐUA
  useEffect(() => {
    setLoading(true);

    const q = query(
      collection(firestore, "auditLogs"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AuditLogRow[] = [];
        snap.docs.forEach((d) => {
          const dat = d.data() as AuditLogRow;
          // Lọc các hành động liên quan đến thi đua kỷ luật
          if (
            dat.entityType?.startsWith("discipline") ||
            dat.action?.includes("discipline") ||
            dat.action?.includes("appeal") ||
            dat.action?.includes("signer")
          ) {
            list.push({ ...dat, id: d.id });
          }
        });
        setLogs(list);
        setLoading(false);
      },
      (err) => {
        console.error("Lỗi tải audit logs:", err);
        toast.error("Không thể tải nhật ký kiểm toán.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Lọc theo action và search query
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedAction !== "all" && log.action !== selectedAction) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const userName = usersMap[log.actorId]?.name?.toLowerCase() || "";
        const actorId = log.actorId?.toLowerCase() || "";
        const entityId = log.entityId?.toLowerCase() || "";
        const action = log.action?.toLowerCase() || "";

        if (!userName.includes(q) && !actorId.includes(q) && !entityId.includes(q) && !action.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedAction, searchQuery, usersMap]);

  return (
    <RoleGuard allowedRoles={["admin", "bgh"]}>
      <Shell>
        <div className="space-y-6">
          <PageHeader
            title="Nhật ký Kiểm toán Thi đua (Audit Logs)"
            description="Hồ sơ ghi nhận bất biến mọi thay đổi dữ liệu (tạo phiếu, duyệt, khiếu nại, ký điểm, mở khóa) tại máy chủ tin cậy phục vụ chống gian lận và hậu kiểm."
          />

          {/* BỘ LỌC VÀ TÌM KIẾM */}
          <Card className="p-4 border bg-card">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Hành động:</span>
                  <select
                    className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                  >
                    <option value="all">Tất cả hành động ({logs.length})</option>
                    {Object.entries(actionLabels).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Tìm theo người thực hiện, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 pr-2.5 rounded-lg border border-border bg-background text-xs w-60 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Hiển thị <span className="font-bold text-foreground">{filteredLogs.length}</span> sự kiện gần nhất
              </div>
            </div>
          </Card>

          {/* BẢNG AUDIT LOGS */}
          <Card className="p-4 border">
            {loading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <EmptyState
                icon={<History className="h-8 w-8" />}
                title="Không có nhật ký nào phù hợp"
                description="Chưa phát sinh hành động kiểm toán nào hoặc không có nhật ký khớp với bộ lọc."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3 w-40">Thời gian</th>
                      <th className="py-2.5 px-3">Người thực hiện</th>
                      <th className="py-2.5 px-3">Hành động nghiệp vụ</th>
                      <th className="py-2.5 px-3">Đối tượng tác động</th>
                      <th className="py-2.5 px-3">Lý do / Nội dung tóm tắt</th>
                      <th className="py-2.5 px-3 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLogs.map((log) => {
                      const actionInfo = actionLabels[log.action] || { label: log.action, tone: "neutral" };
                      const actor = usersMap[log.actorId];
                      const logDate = log.createdAt ? (log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt)) : null;

                      // Trích xuất lý do hoặc nội dung chính
                      let summaryText = "";
                      if (log.after?.reason) summaryText = `Lý do: ${log.after.reason}`;
                      else if (log.after?.reviewNote) summaryText = `Ghi chú: ${log.after.reviewNote}`;
                      else if (log.after?.resolutionNote) summaryText = `Ý kiến: ${log.after.resolutionNote}`;
                      else if (log.after?.note) summaryText = log.after.note;
                      else if (log.after?.snapshotHash) summaryText = `Hash: ${log.after.snapshotHash.substring(0, 16)}...`;

                      return (
                        <tr key={log.id} className="hover:bg-muted/30 transition">
                          <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                            {logDate ? formatDate(logDate) : "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-foreground">
                              {actor?.name || log.actorId}
                            </span>
                            {actor?.email && (
                              <span className="block text-[10px] text-muted-foreground">{actor.email}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge tone={actionInfo.tone}>{actionInfo.label}</Badge>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {log.entityType}/{log.entityId ? log.entityId.substring(0, 12) : "—"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate text-muted-foreground">
                            {summaryText || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setSelectedLog(log);
                                setDetailModalOpen(true);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                              JSON
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* MODAL XEM CHI TIẾT JSON BEFORE / AFTER */}
          <Modal
            open={detailModalOpen}
            onOpenChange={setDetailModalOpen}
            title="Chi tiết Nhật ký Kiểm toán"
            description="Bản ghi trạng thái Trước (Before) và Sau (After) của thao tác, lưu vết không thể chỉnh sửa."
          >
            {selectedLog && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-xl">
                  <div>
                    <span className="text-muted-foreground">Mã sự kiện: </span>
                    <span className="font-mono">{selectedLog.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hành động: </span>
                    <span className="font-semibold">{selectedLog.action}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Người thực hiện: </span>
                    <span>{usersMap[selectedLog.actorId]?.name || selectedLog.actorId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Đối tượng: </span>
                    <span className="font-mono">{selectedLog.entityType}/{selectedLog.entityId}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-bold text-muted-foreground">Trạng thái Trước khi sửa (Before):</div>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-[11px] max-h-40">
                    {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : "null (Tạo mới đối tượng)"}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="font-bold text-muted-foreground">Trạng thái Sau khi sửa (After):</div>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto text-[11px] max-h-48">
                    {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : "null (Đã xóa)"}
                  </pre>
                </div>

                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => setDetailModalOpen(false)}>
                    Đóng
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
