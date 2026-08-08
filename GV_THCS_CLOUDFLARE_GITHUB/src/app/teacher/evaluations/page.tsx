"use client";

import { Award, Search } from "lucide-react";
import { collection, limit, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { firestore } from "@/lib/firebase/client";
import { getCurrentTeacherContext } from "@/lib/firebase/current-teacher";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";

type Row = DocumentData & { id: string };
function average(row: Row) { const items = Array.isArray(row.criteria) ? row.criteria : []; const weight = items.reduce((s: number,i:Record<string,unknown>)=>s+Number(i.weight||1),0); return weight ? Math.round(items.reduce((s:number,i:Record<string,unknown>)=>s+Number(i.score||0)*Number(i.weight||1),0)/weight*10)/10 : 0; }

export default function TeacherEvaluationsPage(){
 const {user}=useAuth(); const [teacherId,setTeacherId]=useState(""); const [teacherName,setTeacherName]=useState(""); const [rows,setRows]=useState<Row[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [search,setSearch]=useState("");
 useEffect(()=>{if(!user)return;let active=true;void getCurrentTeacherContext(user.uid).then((c)=>{if(active){setTeacherId(c.teacherId);setTeacherName(String(c.teacherProfile.fullName||c.userProfile.displayName||"Giáo viên"));}}).catch((e)=>active&&setError(firebaseDataErrorMessage(e)));return()=>{active=false;};},[user]);
 useEffect(()=>{if(!teacherId)return;setLoading(true);return onSnapshot(query(collection(firestore,"evaluations"),where("teacherId","==",teacherId),where("status","==","published"),limit(100)),(snapshot)=>{setRows(snapshot.docs.map((d): Row => ({id:d.id,...d.data()})).sort((a,b)=>Number(b.publishedAt?.seconds||0)-Number(a.publishedAt?.seconds||0)));setLoading(false);},(e)=>{setError(firebaseDataErrorMessage(e));setLoading(false);});},[teacherId]);
 const filtered=useMemo(()=>{const k=search.trim().toLocaleLowerCase("vi");return rows.filter((r)=>!k||[r.periodName,r.notes,r.periodId].some((v)=>String(v||"").toLocaleLowerCase("vi").includes(k)));},[rows,search]); const latest=rows[0];
 return <RoleGuard allowedRoles={["giaovien"]}><Shell><PageHeader eyebrow="Đánh giá chuyên môn" title="Kết quả đánh giá của tôi" description="Chỉ hiển thị kết quả đã được nhà trường công bố." />{error?<div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
 <div className="mb-5 grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-sm text-muted-foreground">Giáo viên</p><p className="mt-2 text-lg font-bold">{teacherName||"—"}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Số kỳ đã công bố</p><p className="mt-2 text-3xl font-extrabold">{rows.length}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Điểm gần nhất</p><p className="mt-2 text-3xl font-extrabold">{latest?average(latest):"—"}</p></Card></div>
 <Card className="mb-5 p-4"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Tìm kỳ đánh giá, nhận xét..."/></div></Card>
 <div className="space-y-4">{loading?Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-52"/>):filtered.length===0?<Card><EmptyState icon={<Award className="h-6 w-6"/>} title="Chưa có kết quả được công bố" description="Kết quả nháp không hiển thị cho giáo viên."/></Card>:filtered.map((row)=><Card className="p-5" key={row.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{row.periodName||row.periodId||"Kỳ đánh giá"}</h2><p className="mt-1 text-sm text-muted-foreground">Công bố: {formatDate(row.publishedAt)}</p></div><Badge tone="success">{average(row)}/10</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{(Array.isArray(row.criteria)?row.criteria:[]).map((item:Record<string,unknown>,index:number)=><div className="rounded-xl border border-border p-3" key={`${row.id}-${index}`}><p className="text-sm text-muted-foreground">{String(item.name||`Tiêu chí ${index+1}`)}</p><p className="mt-1 text-xl font-bold">{Number(item.score||0)}/10</p></div>)}</div>{row.notes?<div className="mt-4 rounded-xl bg-muted p-4 text-sm leading-6"><strong>Nhận xét:</strong> {String(row.notes)}</div>:null}</Card>)}</div>
 </Shell></RoleGuard>;
}
