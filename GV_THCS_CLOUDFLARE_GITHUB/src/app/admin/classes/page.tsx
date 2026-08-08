import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function ClassesPage() {
  return <AdminCatalogPage title="Lớp học" description="Tạo lớp theo năm học, khối, cơ sở và giáo viên chủ nhiệm." collectionName="classes" fields={[
    { name: "code", label: "Mã lớp", required: true, placeholder: "6A1" },
    { name: "name", label: "Tên lớp", required: true, placeholder: "Lớp 6A1" },
    { name: "schoolYearId", label: "Năm học", required: true, optionsCollection: "schoolYears", optionLabelFields: ["name", "code"] },
    { name: "grade", label: "Khối", type: "select", required: true, options: ["6", "7", "8", "9"].map((value) => ({ value, label: `Khối ${value}` })) },
    { name: "campusId", label: "Cơ sở", required: true, optionsCollection: "campuses", optionLabelFields: ["name", "code"] },
    { name: "homeroomTeacherId", label: "Giáo viên chủ nhiệm", optionsCollection: "teachers", optionLabelFields: ["fullName", "teacherCode"] },
    { name: "expectedSize", label: "Sĩ số dự kiến", type: "number" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
