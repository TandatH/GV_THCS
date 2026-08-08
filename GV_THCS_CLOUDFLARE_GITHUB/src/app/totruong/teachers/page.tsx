"use client";

import { Search, UsersRound } from "lucide-react";
import { collection, limit, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatCurrency } from "@/lib/utils";

type Row = DocumentData & { id: string };
type SubjectRow = DocumentData & { id: string };

function text(value: unknown) { return typeof value === "string" ? value : ""; }

export default function DepartmentTeachersPage() {
  const { claims, loading: authLoading } = useAuth();
  const departmentId = typeof claims?.departmentId === "string" ? claims.departmentId : "";
  const [rows, setRows] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    if (!departmentId) { setError("Tài khoản tổ trưởng chưa được gán bộ môn phụ trách."); setLoading(false); return; }
    const unsubscribers = [
      onSnapshot(query(collection(firestore, "teachers"), where("departmentId", "==", departmentId), limit(300)), (snapshot) => {
        setRows(snapshot.docs.map((document): Row => ({ id: document.id, ...document.data() })).sort((a,b)=>text(a.fullName).localeCompare(text(b.fullName),"vi")));
        setLoading(false);
      }, (e) => { setError(firebaseDataErrorMessage(e)); setLoading(false); }),
      onSnapshot(query(collection(firestore, "subjects"), where("departmentId", "==", departmentId), limit(100)), (snapshot) => {
        setSubjects(snapshot.docs.map((document): SubjectRow => ({ id: document.id, ...document.data() })));
      }, (e) => setError(firebaseDataErrorMessage(e))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [authLoading, departmentId]);

  const subjectName = useMemo(() => new Map(subjects.map((subject) => [subject.id, text(subject.name) || text(subject.code) || subject.id])), [subjects]);
  const filtered = useMemo(() => { const keyword=search.trim().toLocaleLowerCase("vi"); return rows.filter((row) => (typeFilter === "all" || row.teacherType === typeFilter) && (!keyword || [row.fullName,row.teacherCode,row.email,row.phone,row.specialization].filter(Boolean).some((value)=>String(value).toLocaleLowerCase("vi").includes(keyword)))); }, [rows, search, typeFilter]);

  return <RoleGuard allowedRoles={["totruong"]}><Shell>
    <PageHeader eyebrow="Nhân sự trong tổ" title="Giáo viên trong tổ chuyên môn" description="Theo dõi hồ sơ, môn được phân công và định mức của giáo viên thuộc phạm vi phụ trách." />
    {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
    <div className="mb-5 grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-sm text-muted-foreground">Tổng giáo viên</p><p className="mt-2 text-3xl font-extrabold">{rows.length}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Cơ hữu</p><p className="mt-2 text-3xl font-extrabold">{rows.filter((row)=>row.teacherType==="co_huu").length}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Thỉnh giảng</p><p className="mt-2 text-3xl font-extrabold">{rows.filter((row)=>row.teacherType==="thinh_giang").length}</p></Card></div>
    <Card className="mb-5 p-4"><div className="grid gap-3 sm:grid-cols-[1fr_240px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Tìm giáo viên..."/></div><select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)}><option value="all">Tất cả loại giáo viên</option><option value="co_huu">Cơ hữu</option><option value="thinh_giang">Thỉnh giảng</option></select></div></Card>
    <Card className="overflow-hidden">{loading ? <div className="space-y-3 p-5">{Array.from({length:5}).map((_,i)=><Skeleton className="h-16" key={i}/>)}</div> : filtered.length===0 ? <EmptyState icon={<UsersRound className="h-6 w-6"/>} title="Không có giáo viên phù hợp" description="Danh sách chỉ gồm giáo viên thuộc tổ của tài khoản hiện tại."/> : <div className="overflow-x-auto"><table className="data-table min-w-[1050px]"><thead><tr><th>Mã</th><th>Giáo viên</th><th>Môn giảng dạy</th><th>Loại</th><th>Định mức/đơn giá</th><th>Trạng thái</th></tr></thead><tbody>{filtered.map((row)=><tr key={row.id}><td><code className="rounded bg-muted px-2 py-1 text-xs">{row.teacherCode||row.id}</code></td><td><p className="font-semibold">{row.fullName||"—"}</p><p className="text-xs text-muted-foreground">{row.email||row.phone||"—"}</p></td><td><p className="max-w-xs">{(Array.isArray(row.subjectIds)?row.subjectIds:[]).map((id:string)=>subjectName.get(id)||id).join(", ")||"—"}</p></td><td><Badge tone={row.teacherType==="co_huu"?"info":"warning"}>{row.teacherType==="co_huu"?"Cơ hữu":"Thỉnh giảng"}</Badge></td><td>{row.teacherType==="co_huu"?`${row.standardPeriodsPerWeek??0} tiết/tuần`:`${formatCurrency(Number(row.ratePerPeriod||0))}/tiết`}</td><td><Badge tone={row.status==="active"?"success":"danger"}>{row.status==="active"?"Đang công tác":"Ngừng hoạt động"}</Badge></td></tr>)}</tbody></table></div>}</Card>
  </Shell></RoleGuard>;
}
