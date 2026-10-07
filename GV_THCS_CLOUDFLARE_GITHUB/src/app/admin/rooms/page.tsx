import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function RoomsPage() {
  return <AdminCatalogPage title="Phòng học" description="Tạo phòng học theo cơ sở để phục vụ xếp thời khóa biểu." collectionName="rooms" fields={[
    { name: "code", label: "Mã phòng", required: true, placeholder: "A101" },
    { name: "name", label: "Tên phòng", required: true, placeholder: "Phòng A101" },
    { name: "campusId", label: "Cơ sở", required: true, optionsCollection: "campuses", optionLabelFields: ["name", "code"] },
    { name: "capacity", label: "Sức chứa", type: "number" },
    { name: "roomType", label: "Loại phòng", type: "select", options: [
      { value: "normal", label: "Phòng học thường" },
      { value: "computer", label: "Phòng Tin học" },
      { value: "laboratory", label: "Phòng thực hành" },
      { value: "multi_function", label: "Phòng đa năng" },
      { value: "playground", label: "Sân thể dục / Bãi tập" },
    ] },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
