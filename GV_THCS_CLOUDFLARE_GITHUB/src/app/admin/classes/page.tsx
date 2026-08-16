import { AdminCatalogPage } from "@/components/admin-catalog-page";

const schoolLevelOptions = [
  { value: "primary", label: "Tiểu học (lớp 1–5)" },
  { value: "secondary", label: "THCS (lớp 6–9)" },
];

const gradeOptions = Array.from({ length: 9 }, (_, index) => {
  const grade = index + 1;
  return { value: String(grade), label: `Khối ${grade}` };
});

export default function ClassesPage() {
  return <AdminCatalogPage title="Lớp học" description="Quản lý lớp từ khối 1 đến khối 9 theo cấp học, năm học, cơ sở và giáo viên chủ nhiệm." collectionName="classes" fields={[
    { name: "code", label: "Mã lớp", required: true, placeholder: "1.1 / 6.1" },
    { name: "name", label: "Tên lớp", required: true, placeholder: "Lớp 1.1" },
    { name: "schoolLevel", label: "Cấp học", type: "select", required: true, options: schoolLevelOptions },
    { name: "grade", label: "Khối", type: "select", required: true, options: gradeOptions },
    { name: "schoolYearId", label: "Năm học", required: true, optionsCollection: "schoolYears", optionLabelFields: ["name", "code"] },
    { name: "campusId", label: "Cơ sở", required: true, optionsCollection: "campuses", optionLabelFields: ["name", "code"] },
    {
      name: "homeroomTeacherId",
      label: "Giáo viên chủ nhiệm",
      optionsCollection: "teachers",
      optionLabelFields: ["fullName", "teacherCode"],
      optionFilters: [
        { formField: "schoolLevel", optionField: "schoolLevels", mode: "arrayIncludes" },
        { formField: "grade", optionField: "teachingAssignments", mode: "teachingGradeIncludes" },
      ],
      optionAllowedValues: [
        { optionField: "teachingRole", values: ["chu_nhiem", "ca_hai"], allowMissing: true },
        { optionField: "teacherType", values: ["co_huu"] },
      ],
    },
    { name: "expectedSize", label: "Sĩ số dự kiến", type: "number" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
