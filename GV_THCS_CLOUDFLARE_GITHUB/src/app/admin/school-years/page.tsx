import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function SchoolYearsPage() {
  return <AdminCatalogPage
    title="Năm học"
    description="Tạo năm học, chọn năm đang hoạt động và khóa dữ liệu năm học đã kết thúc. Không xóa dữ liệu lịch sử."
    collectionName="schoolYears"
    fields={[
      { name: "code", label: "Mã năm học", required: true, placeholder: "2026-2027" },
      { name: "name", label: "Tên năm học", required: true, placeholder: "Năm học 2026–2027" },
      { name: "startDate", label: "Ngày bắt đầu", type: "date", required: true },
      { name: "endDate", label: "Ngày kết thúc", type: "date", required: true },
      { name: "status", label: "Trạng thái", type: "select", required: true, options: [
        { value: "draft", label: "Chuẩn bị" },
        { value: "active", label: "Đang hoạt động" },
        { value: "archived", label: "Đã khóa/lưu trữ" },
      ] },
      { name: "isActive", label: "Cho phép sử dụng", type: "checkbox" },
    ]}
  />;
}
