"use client";

import { Search, WalletCards } from "lucide-react";
import { collection, limit, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { finiteNumber } from "@school/shared";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatCurrency } from "@/lib/utils";

type Row = DocumentData & { id: string };

function statusLabel(status: unknown) { return ({ draft: "Nháp", pending_approval: "Chờ duyệt", review_required: "Yêu cầu rà soát", reviewed: "Đã rà soát", approved: "Đã duyệt", locked: "Đã khóa", paid: "Đã thanh toán" } as Record<string, string>)[String(status)] || String(status || "Nháp"); }
function tone(status: unknown) { return status === "paid" ? "success" as const : status === "locked" || status === "approved" ? "info" as const : "warning" as const; }

export default function TeacherPayrollPage() {
  const { user } = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { if (!user) return; let active = true; void getCurrentTeacherContext(user.uid).then((context) => { if (active) { setTeacherId(context.teacherId); setTeacherName(String(context.teacherProfile.fullName || context.userProfile.displayName || "Giáo viên")); } }).catch((e) => active && setError(firebaseDataErrorMessage(e))); return () => { active = false; }; }, [user]);
  useEffect(() => { if (!teacherId) return; setLoading(true); return onSnapshot(query(collection(firestore, "payroll"), where("teacherId", "==", teacherId), limit(100)), (snapshot) => { setRows(snapshot.docs.map((document): Row => ({ id: document.id, ...document.data() })).sort((a,b) => String(b.month || "").localeCompare(String(a.month || "")))); setLoading(false); }, (e) => { setError(firebaseDataErrorMessage(e)); setLoading(false); }); }, [teacherId]);
  const filtered = useMemo(() => { const keyword = search.trim().toLowerCase(); return rows.filter((row) => !keyword || [row.month,row.status,row.schoolYearId].some((v) => String(v || "").toLowerCase().includes(keyword))); }, [rows,search]);
  // Hiển thị kết quả kỳ đã tổng hợp; không cộng dạy thế lần hai vào actualPeriods.
  const totalPeriods = rows.reduce((sum,row) => sum + finiteNumber(row.actualPeriods),0);
  const totalPaid = rows.filter((row) => row.status === "paid").reduce((sum,row) => sum + finiteNumber(row.amount),0);

  return <RoleGuard allowedRoles={["giaovien", "bgh", "totruong", "admin"]}><Shell><PageHeader eyebrow="Thù lao" title="Bảng tổng hợp thù lao" description="Thù lao được tổng hợp dựa trên số tiết dạy thực tế đã được nhà trường đối soát và xác nhận hoàn thành." />
  {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
  <div className="mb-5 grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-sm text-muted-foreground">Giáo viên</p><p className="mt-2 text-lg font-bold">{teacherName || "—"}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Tiết thực dạy đã xác nhận</p><p className="mt-2 text-3xl font-extrabold">{totalPeriods}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Đã thanh toán</p><p className="mt-2 text-2xl font-extrabold">{formatCurrency(totalPaid)}</p></Card></div>
  <Card className="mb-5 p-4"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Tìm tháng, năm học, trạng thái..."/></div></Card>
  <Card className="overflow-hidden">{loading ? <div className="space-y-3 p-5">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-16"/>)}</div> : filtered.length===0 ? <EmptyState icon={<WalletCards className="h-6 w-6"/>} title="Chưa có dữ liệu tổng hợp" description="Dữ liệu thù lao sẽ hiển thị sau khi kỳ đối soát và tính lương được phê duyệt."/> : (
    <div className="overflow-x-auto"><table className="data-table min-w-[1200px]">
      <thead><tr><th>Tháng</th><th>Năm học</th><th>Tiết thực dạy</th><th>Cấp 1</th><th>Cấp 2</th><th>Dạy thế</th><th>Tiết vắng</th><th>Tiết chuẩn (đối chiếu)</th><th>Điều chỉnh</th><th>Thành tiền</th><th>Trạng thái</th></tr></thead>
      <tbody>{filtered.map((row) => <tr key={row.id}>
        <td className="font-semibold">{row.month || "—"}</td><td>{row.schoolYearId || "—"}</td>
        <td>{row.actualPeriods ?? 0}</td>
        <td>{row.primaryActual ?? "—"}<p className="text-xs text-muted-foreground">{row.primaryRate === undefined ? "" : `${formatCurrency(finiteNumber(row.primaryRate))}/tiết`}</p></td>
        <td>{row.secondaryActual ?? "—"}<p className="text-xs text-muted-foreground">{row.secondaryRate === undefined ? "" : `${formatCurrency(finiteNumber(row.secondaryRate))}/tiết`}</p></td>
        <td>{row.substituteCount ?? "—"}</td><td>{row.absentCount ?? "—"}</td><td>{row.standardPeriods ?? "—"}</td>
        <td title={String(row.adjustmentReason || "")}>{formatCurrency(finiteNumber(row.adjustmentAmount))}</td>
        <td>{row.amount === null || row.amount === undefined ? "Chưa cấu hình" : formatCurrency(finiteNumber(row.amount))}</td>
        <td><Badge tone={tone(row.status)}>{statusLabel(row.status)}</Badge></td>
      </tr>)}</tbody>
    </table></div>
  )}</Card>
  </Shell></RoleGuard>;
}
