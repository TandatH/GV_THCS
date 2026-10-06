"use client";

import { CirclePlus, PencilLine, RefreshCcw, Search, Settings2, Trash2 } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RoleGuard } from "@/features/auth/role-guard";
import { useAuth } from "@/features/auth/use-auth";
import { deleteCatalogItem, type CatalogCollectionName } from "@/lib/firebase/catalog-admin-callables";
import { firebaseErrorMessage } from "@/lib/firebase/callables";
import { firestore } from "@/lib/firebase/client";
import { firebaseDataErrorMessage } from "@/lib/firebase/errors";
import { formatDate } from "@/lib/utils";

import { PageHeader } from "./page-header";
import { Shell } from "./shell";
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Skeleton } from "./ui";

type FieldType = "text" | "number" | "date" | "datetime-local" | "time" | "select" | "checkbox" | "textarea";

export type CatalogField = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  optionsCollection?: string;
  optionLabelFields?: string[];
  optionFilters?: {
    formField: string;
    optionField: string;
    mode?: "equals" | "arrayIncludes" | "equalsOrBoth" | "teachingGradeIncludes";
  }[];
  optionAllowedValues?: {
    optionField: string;
    values: string[];
    allowMissing?: boolean;
  }[];
};

type CatalogRow = DocumentData & { id: string };

type CatalogAdminPageProps = {
  title: string;
  description: string;
  collectionName: string;
  fields: CatalogField[];
};

type FormState = Record<string, string | boolean>;

function normalizeDocId(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function initialState(fields: CatalogField[], row?: CatalogRow | null): FormState {
  return fields.reduce<FormState>((state, field) => {
    if (field.type === "checkbox") {
      state[field.name] = row ? row[field.name] !== false : true;
      return state;
    }
    const value = row?.[field.name];
    if (field.type === "datetime-local") {
      const date = typeof value === "object" && value && "toDate" in value ? (value as { toDate(): Date }).toDate() : value ? new Date(value) : null;
      if (date && !Number.isNaN(date.getTime())) {
        const offset = date.getTimezoneOffset();
        state[field.name] = new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
      } else {
        state[field.name] = "";
      }
      return state;
    }
    state[field.name] = value === undefined || value === null ? "" : String(value);
    return state;
  }, {});
}

function fieldValueForFirestore(field: CatalogField, value: string | boolean) {
  if (field.type === "checkbox") return Boolean(value);
  if (field.type === "number") return value === "" ? null : Number(value);
  if (field.type === "datetime-local") return value ? Timestamp.fromDate(new Date(String(value))) : null;
  return typeof value === "string" ? value.trim() : value;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "object" && "toDate" in value) return formatDate(value);
  return String(value);
}

function statusTone(row: CatalogRow) {
  if (row.isActive === false || row.status === "inactive") return "danger" as const;
  if (row.status === "archived") return "neutral" as const;
  if (row.status === "draft") return "warning" as const;
  return "success" as const;
}

function referenceLabel(row: CatalogRow, fields: string[] | undefined) {
  const preferred = fields?.length ? fields : ["name", "fullName", "code", "email"];
  const values = preferred.map((field) => row[field]).filter((value) => typeof value === "string" && value.trim());
  return values.length ? values.join(" · ") : row.id;
}

function staticOptionLabel(field: CatalogField, value: unknown) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return field.options?.find((option) => option.value === normalized)?.label || displayValue(value);
}

function staticOptionsForField(field: CatalogField, form: FormState) {
  const options = field.options ?? [];
  if (field.name !== "grade") return options;
  const schoolLevel = String(form.schoolLevel ?? "");
  if (schoolLevel !== "primary" && schoolLevel !== "secondary") return options;
  return options.filter((option) => {
    const grade = Number(option.value);
    if (!Number.isInteger(grade)) return true;
    return schoolLevel === "primary" ? grade >= 1 && grade <= 5 : grade >= 6 && grade <= 9;
  });
}

function filteredReferenceOptions(field: CatalogField, form: FormState, rows: CatalogRow[] | undefined) {
  const filters = field.optionFilters ?? [];
  const allowedValueFilters = field.optionAllowedValues ?? [];
  return (rows ?? []).filter((row) => {
    const matchesDynamicFilters = filters.every((filter) => {
      const expected = String(form[filter.formField] ?? "").trim();
      if (!expected) return true;
      const actual = row[filter.optionField];
      if (filter.mode === "arrayIncludes") {
        if (Array.isArray(actual)) return actual.map(String).includes(expected);
        if (typeof actual === "string") return actual === expected || actual === "both";
        if (filter.optionField === "schoolLevels") {
          const singularLevel = row.schoolLevel;
          if (Array.isArray(singularLevel)) return singularLevel.map(String).includes(expected);
          if (typeof singularLevel === "string") return singularLevel === expected || singularLevel === "both";
          // Hồ sơ giáo viên cũ chưa có schoolLevels được xem là THCS để giữ tương thích dữ liệu hiện tại.
          return expected === "secondary" && (actual === undefined || actual === null || actual === "");
        }
        return false;
      }
      if (filter.mode === "equalsOrBoth") {
        const value = String(actual ?? "").trim();
        return !value || value === "both" || value === expected;
      }
      if (filter.mode === "teachingGradeIncludes") {
        const grade = Number(expected);
        if (!Number.isInteger(grade) || grade < 1 || grade > 9) return true;
        const assignments = Array.isArray(row.teachingAssignments) ? row.teachingAssignments : [];
        // Hồ sơ cũ chưa có teachingAssignments vẫn được hiển thị để không làm mất GVCN hiện hữu.
        if (assignments.length === 0) return true;
        return assignments.some((assignment) => {
          if (!assignment || typeof assignment !== "object") return false;
          const gradeLevels = (assignment as Record<string, unknown>).gradeLevels;
          return Array.isArray(gradeLevels) && gradeLevels.map(Number).includes(grade);
        });
      }
      return String(actual ?? "").trim() === expected;
    });
    if (!matchesDynamicFilters) return false;

    return allowedValueFilters.every((filter) => {
      const value = String(row[filter.optionField] ?? "").trim();
      if (!value && filter.allowMissing) return true;
      return filter.values.includes(value);
    });
  });
}

export function AdminCatalogPage({ title, description, collectionName, fields }: CatalogAdminPageProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState<FormState>(() => initialState(fields));
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [formError, setFormError] = useState("");
  const [referenceOptions, setReferenceOptions] = useState<Record<string, CatalogRow[]>>({});
  const [referenceError, setReferenceError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const unsubscribe = onSnapshot(
      query(collection(firestore, collectionName), limit(300)),
      (snapshot) => {
        setRows(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        setLoading(false);
      },
      (snapshotError) => {
        setError(firebaseDataErrorMessage(snapshotError));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [collectionName, reloadKey]);

  useEffect(() => {
    const referenceFields = fields.filter((field) => field.optionsCollection);
    if (referenceFields.length === 0) return;
    setReferenceError("");
    const unsubscribers = referenceFields.map((field) => onSnapshot(
      query(collection(firestore, field.optionsCollection!), limit(500)),
      (snapshot) => {
        const nextRows = snapshot.docs
          .map((document): CatalogRow => ({ id: document.id, ...document.data() }))
          .filter((row) => row.isActive !== false && row.status !== "inactive" && row.status !== "archived")
          .sort((first, second) => referenceLabel(first, field.optionLabelFields).localeCompare(referenceLabel(second, field.optionLabelFields), "vi"));
        setReferenceOptions((current) => ({ ...current, [field.name]: nextRows }));
      },
      (snapshotError) => setReferenceError(firebaseDataErrorMessage(snapshotError)),
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [fields]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (!keyword) return rows;
    return rows.filter((row) => JSON.stringify(row).toLocaleLowerCase("vi").includes(keyword));
  }, [rows, search]);

  const visibleFields = fields.filter((field) => field.name !== "isActive");

  function openCreate() {
    setEditingRow(null);
    setForm(initialState(fields));
    setFormError("");
    setOpen(true);
  }

  function openEdit(row: CatalogRow) {
    setEditingRow(row);
    setForm(initialState(fields, row));
    setFormError("");
    setOpen(true);
  }

  async function handleDelete(row: CatalogRow) {
    const label = String(row.name || row.code || row.id);
    const confirmation = window.prompt(
      `Xóa vĩnh viễn “${label}”?\nDữ liệu đang được sử dụng ở các mục khác sẽ không thể xóa.\nNhập XOA để xác nhận.`,
      "",
    );
    if (confirmation !== "XOA") return;

    setDeletingId(row.id);
    try {
      await deleteCatalogItem(collectionName as CatalogCollectionName, row.id);
      toast.success("Đã xóa dữ liệu.");
    } catch (deleteError) {
      toast.error(firebaseErrorMessage(deleteError));
    } finally {
      setDeletingId("");
    }
  }

  function setField(name: string, value: string | boolean) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "schoolLevel") {
        const schoolLevel = String(value);
        const grade = Number(next.grade);
        if (Number.isInteger(grade) && grade > 0) {
          const isValidGrade = schoolLevel === "primary" ? grade >= 1 && grade <= 5 : grade >= 6 && grade <= 9;
          if (!isValidGrade) {
            next.grade = "";
          }
        }
        for (const field of fields) {
          if (field.optionFilters?.some((filter) => filter.formField === "schoolLevel")) {
            const currentSelected = String(next[field.name] ?? "").trim();
            if (currentSelected && referenceOptions[field.name]) {
              const valid = filteredReferenceOptions(field, next, referenceOptions[field.name]);
              if (!valid.some((item) => item.id === currentSelected)) {
                next[field.name] = "";
              }
            }
          }
        }
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const schoolLevel = String(form.schoolLevel ?? "");
    const grade = Number(form.grade ?? 0);
    if ((schoolLevel === "primary" || schoolLevel === "secondary") && Number.isInteger(grade) && grade > 0) {
      const validGrade = schoolLevel === "primary" ? grade >= 1 && grade <= 5 : grade >= 6 && grade <= 9;
      if (!validGrade) {
        setFormError(schoolLevel === "primary" ? "Tiểu học chỉ sử dụng khối 1–5." : "THCS chỉ sử dụng khối 6–9.");
        return;
      }
    }
    for (const field of fields) {
      if (!field.optionsCollection || (!(field.optionFilters?.length) && !(field.optionAllowedValues?.length))) continue;
      const selectedId = String(form[field.name] ?? "").trim();
      if (!selectedId) continue;
      const validOptions = filteredReferenceOptions(field, form, referenceOptions[field.name]);
      if (!validOptions.some((option) => option.id === selectedId)) {
        setFormError(`${field.label} không phù hợp với cấp học/khối hoặc vai trò đã chọn.`);
        return;
      }
    }

    const code = String(form.code || "").trim();
    const docId = editingRow?.id || normalizeDocId(code);
    if (!docId) {
      setFormError("Vui lòng nhập mã/ID hợp lệ.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const reference = doc(firestore, collectionName, docId);
      const existing = await getDoc(reference);
      if (!editingRow && existing.exists()) {
        throw new Error("Mã này đã tồn tại. Vui lòng chọn mã khác hoặc sửa bản ghi hiện có.");
      }
      const payload = fields.reduce<Record<string, unknown>>((next, field) => {
        next[field.name] = fieldValueForFirestore(field, form[field.name]);
        return next;
      }, {});
      payload.code = code.toUpperCase();
      payload.updatedAt = serverTimestamp();
      payload.updatedBy = user.uid;
      if (!editingRow) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = user.uid;
        payload.isActive = payload.isActive ?? true;
      }
      await setDoc(reference, payload, { merge: Boolean(editingRow) });
      toast.success(editingRow ? "Đã cập nhật dữ liệu." : "Đã tạo mới dữ liệu.");
      setOpen(false);
    } catch (submitError) {
      setFormError(firebaseDataErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["admin"]}>
      <Shell>
        <PageHeader
          eyebrow="Thiết lập hệ thống"
          title={title}
          description={description}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
                <RefreshCcw className="h-4 w-4" />
                Làm mới
              </Button>
              <Button onClick={openCreate}>
                <CirclePlus className="h-4 w-4" />
                Thêm {title.toLocaleLowerCase("vi")}
              </Button>
            </div>
          }
        />

        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {referenceError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Không thể tải đầy đủ danh sách liên kết: {referenceError}</div> : null}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo mã, tên hoặc thông tin liên kết..." />
            </div>
            <p className="text-sm text-muted-foreground">{error ? "Không tải được dữ liệu" : `${filteredRows.length} bản ghi`}</p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : error ? null : filteredRows.length === 0 ? (
            <EmptyState
              icon={<Settings2 className="h-6 w-6" />}
              title="Chưa có dữ liệu"
              description="Tạo bản ghi đầu tiên để hoàn tất thiết lập danh mục."
              action={<Button onClick={openCreate}>Thêm {title.toLocaleLowerCase("vi")}</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[920px]">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tên</th>
                    {visibleFields.slice(2).map((field) => <th key={field.name}>{field.label}</th>)}
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td><p className="font-semibold">{row.code || row.id}</p><p className="text-xs text-muted-foreground">ID: {row.id}</p></td>
                      <td>{row.name || "—"}</td>
                      {visibleFields.slice(2).map((field) => { const reference = referenceOptions[field.name]?.find((option) => option.id === row[field.name]); return <td key={field.name}>{reference ? referenceLabel(reference, field.optionLabelFields) : staticOptionLabel(field, row[field.name])}</td>; })}
                      <td><Badge tone={statusTone(row)}>{row.isActive === false || row.status === "inactive" ? "Ngừng hoạt động" : "Đang hoạt động"}</Badge></td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}><PencilLine className="h-4 w-4" />Sửa</Button>
                          <Button size="sm" variant="danger" loading={deletingId === row.id} onClick={() => void handleDelete(row)}><Trash2 className="h-4 w-4" />Xóa</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal
          open={open}
          onOpenChange={setOpen}
          title={editingRow ? `Sửa ${title.toLocaleLowerCase("vi")}` : `Thêm ${title.toLocaleLowerCase("vi")}`}
          description="Nhập thông tin chi tiết để cập nhật bản ghi trong hệ thống."
          wide
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button><Button form="catalog-form" loading={submitting} type="submit">Lưu</Button></div>}
        >
          <form id="catalog-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            {fields.map((field) => (
              <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
                <Label>{field.label}</Label>
                {field.type === "select" || field.optionsCollection ? (
                  <select className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" required={field.required} value={String(form[field.name] ?? "")} onChange={(event) => setField(field.name, event.target.value)}>
                    <option value="">Chọn {field.label.toLocaleLowerCase("vi")}</option>
                    {staticOptionsForField(field, form).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    {filteredReferenceOptions(field, form, referenceOptions[field.name]).map((option) => <option key={option.id} value={option.id}>{referenceLabel(option, field.optionLabelFields)}</option>)}
                  </select>
                ) : field.type === "checkbox" ? (
                  <label className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3 text-sm">
                    <input type="checkbox" checked={Boolean(form[field.name])} onChange={(event) => setField(field.name, event.target.checked)} />
                    Đang hoạt động
                  </label>
                ) : field.type === "textarea" ? (
                  <textarea className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" required={field.required} value={String(form[field.name] ?? "")} onChange={(event) => setField(field.name, event.target.value)} placeholder={field.placeholder} />
                ) : (
                  <Input disabled={editingRow !== null && field.name === "code"} required={field.required} type={field.type || "text"} value={String(form[field.name] ?? "")} onChange={(event) => setField(field.name, event.target.value)} placeholder={field.placeholder} />
                )}
              </div>
            ))}
            {formError ? <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div> : null}
          </form>
        </Modal>
      </Shell>
    </RoleGuard>
  );
}
