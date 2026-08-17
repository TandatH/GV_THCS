import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function TimeSlotsPage() {
  return <AdminCatalogPage
    title="Tiết học"
    description="Tạo khung tiết riêng cho Tiểu học và THCS. Mỗi cấp học có thể dùng giờ khác nhau; mã tiết phải riêng, ví dụ PRI_P01 và SEC_P01."
    collectionName="timeSlots"
    fields={[
      {
        name: "schoolLevel",
        label: "Cấp học áp dụng",
        type: "select",
        required: true,
        options: [
          { value: "primary", label: "Tiểu học" },
          { value: "secondary", label: "THCS" },
        ],
      },
      { name: "code", label: "Mã tiết", required: true, placeholder: "Ví dụ: PRI_P01 hoặc SEC_P01" },
      { name: "name", label: "Tên tiết", required: true, placeholder: "Tiết 1" },
      { name: "periodNumber", label: "Số thứ tự tiết", type: "number", required: true },
      { name: "startTime", label: "Giờ bắt đầu", type: "time", required: true },
      { name: "endTime", label: "Giờ kết thúc", type: "time", required: true },
      { name: "isActive", label: "Trạng thái", type: "checkbox" },
    ]}
  />;
}
