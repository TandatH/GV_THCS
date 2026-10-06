import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function SemestersPage() {
  return <AdminCatalogPage title="Học kỳ" description="Thiết lập học kỳ trong năm học và thời hạn đăng ký khung giờ trống." collectionName="semesters" fields={[
    { name: "code", label: "Mã học kỳ", required: true, placeholder: "HK1_2026_2027" },
    { name: "name", label: "Tên học kỳ", required: true, placeholder: "Học kỳ I năm học 2026–2027" },
    { name: "schoolYearId", label: "Năm học", required: true, optionsCollection: "schoolYears", optionLabelFields: ["name", "code"] },
    { name: "startDate", label: "Ngày bắt đầu", type: "date", required: true },
    { name: "endDate", label: "Ngày kết thúc", type: "date", required: true },
    { name: "availabilityDeadline", label: "Hạn đăng ký khung giờ trống", type: "datetime-local" },
    { name: "status", label: "Trạng thái", type: "select", required: true, options: [{ value: "active", label: "Đang hoạt động" }, { value: "inactive", label: "Ngừng hoạt động" }] },
    { name: "isActive", label: "Đang hoạt động", type: "checkbox" },
  ]} />;
}
