import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function DepartmentsPage() {
  return <AdminCatalogPage title="Bộ môn" description="Tạo và cập nhật danh mục bộ môn dùng cho giáo viên, môn học, lịch dạy và phân quyền tổ trưởng." collectionName="departments" fields={[
    { name: "code", label: "Mã bộ môn", required: true, placeholder: "TOAN" },
    { name: "name", label: "Tên bộ môn", required: true, placeholder: "Tổ Toán" },
    { name: "description", label: "Mô tả", type: "textarea" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
