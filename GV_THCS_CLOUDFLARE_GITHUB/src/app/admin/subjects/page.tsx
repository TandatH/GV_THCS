import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function SubjectsPage() {
  return <AdminCatalogPage title="Môn học" description="Tạo môn học và liên kết với tổ chuyên môn phụ trách." collectionName="subjects" fields={[
    { name: "code", label: "Mã môn học", required: true, placeholder: "TOAN" },
    { name: "name", label: "Tên môn học", required: true, placeholder: "Toán" },
    { name: "departmentId", label: "Tổ chuyên môn", required: true, optionsCollection: "departments", optionLabelFields: ["name", "code"] },
    { name: "description", label: "Mô tả", type: "textarea" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
