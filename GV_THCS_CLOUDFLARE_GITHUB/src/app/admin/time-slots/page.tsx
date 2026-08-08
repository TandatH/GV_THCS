import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function TimeSlotsPage() {
  return <AdminCatalogPage title="Tiết học" description="Tạo danh sách tiết học chuẩn trong ngày." collectionName="timeSlots" fields={[
    { name: "code", label: "Mã tiết", required: true, placeholder: "TIET_1" },
    { name: "name", label: "Tên tiết", required: true, placeholder: "Tiết 1" },
    { name: "periodNumber", label: "Số thứ tự tiết", type: "number", required: true },
    { name: "startTime", label: "Giờ bắt đầu", type: "time", required: true },
    { name: "endTime", label: "Giờ kết thúc", type: "time", required: true },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
