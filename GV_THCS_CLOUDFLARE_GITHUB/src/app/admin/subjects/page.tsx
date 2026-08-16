import { AdminCatalogPage } from "@/components/admin-catalog-page";

const schoolLevelOptions = [
  { value: "primary", label: "Tiểu học (lớp 1–5)" },
  { value: "secondary", label: "THCS (lớp 6–9)" },
];

const gradeOptions = Array.from({ length: 9 }, (_, index) => {
  const grade = index + 1;
  return { value: String(grade), label: `Khối ${grade}` };
});

export default function SubjectsPage() {
  return <AdminCatalogPage title="Môn học" description="Tạo môn học theo cấp học/khối và liên kết với tổ chuyên môn phụ trách." collectionName="subjects" fields={[
    { name: "code", label: "Mã môn học", required: true, placeholder: "MATH-G01 / TECH-G08" },
    { name: "name", label: "Tên môn học", required: true, placeholder: "Toán 1 / Công nghệ 8" },
    { name: "schoolLevel", label: "Cấp học", type: "select", required: true, options: schoolLevelOptions },
    { name: "grade", label: "Khối", type: "select", required: true, options: gradeOptions },
    {
      name: "departmentId",
      label: "Tổ chuyên môn",
      required: true,
      optionsCollection: "departments",
      optionLabelFields: ["name", "code"],
      optionFilters: [{ formField: "schoolLevel", optionField: "schoolLevel", mode: "equalsOrBoth" }],
    },
    { name: "description", label: "Mô tả", type: "textarea" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
