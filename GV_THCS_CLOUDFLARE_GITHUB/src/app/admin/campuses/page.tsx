import { AdminCatalogPage } from "@/components/admin-catalog-page";

export default function CampusesPage() {
  return <AdminCatalogPage title="Cơ sở" description="Tạo cơ sở/điểm dạy để gắn phòng học và lịch dạy." collectionName="campuses" fields={[
    { name: "code", label: "Mã cơ sở", required: true, placeholder: "CS1" },
    { name: "name", label: "Tên cơ sở", required: true, placeholder: "Cơ sở 1" },
    { name: "address", label: "Địa chỉ", required: true },
    { name: "phone", label: "Số điện thoại" },
    { name: "isActive", label: "Trạng thái", type: "checkbox" },
  ]} />;
}
