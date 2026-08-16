import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function DepartmentsPage() {
  return <AdminCatalogPage title="Bộ môn" description="Quản lý tổ/khối chuyên môn cho Tiểu học, THCS hoặc dùng chung cả hai cấp." collectionName="departments" fields={[
    { name: "code", label: "Mã bộ môn", required: true, placeholder: "PRI-G01 / MATH / TECH" },
    { name: "name", label: "Tên bộ môn", required: true, placeholder: "Tổ Khối 1 / Tổ Toán / Tổ Công Nghệ - Tin" },
    {
      name: "schoolLevel",
      label: "Phạm vi cấp học",
      type: "select",
      required: true,
      options: [
        { value: "primary", label: "Tiểu học" },
        { value: "secondary", label: "THCS" },
        { value: "both", label: "Dùng chung Tiểu học + THCS" },
      ],
    },
    { name: "description", label: "Mô tả", type: "textarea" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
