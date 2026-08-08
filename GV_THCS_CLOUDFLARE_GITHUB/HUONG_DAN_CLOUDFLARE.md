# Triển khai GV THCS lên Cloudflare

## Kiến trúc sau khi chuyển

- Cloudflare Workers Static Assets: giao diện Next.js đã export tĩnh.
- Firebase Authentication: giữ nguyên.
- Cloud Firestore: giữ nguyên.
- Firebase Storage: giữ nguyên.
- Firebase Cloud Functions (asia-southeast1): giữ nguyên.
- Firestore/Storage Rules và custom claims: giữ nguyên.

Project Firebase hiện tại: `teacher-management-e718b`.

## Vì sao có thể dùng Static Export

Phần web không có API Route, Server Action hoặc Firebase Admin SDK. Middleware cũ chỉ chuyển `/` sang `/dashboard` và đã được thay bằng trang redirect phía client. Quyền thật vẫn do Firebase custom claims, Firestore/Storage Rules và Cloud Functions kiểm tra.

## 1. Đưa thư mục này lên GitHub

Không upload `node_modules`, `.next` hoặc `out`.

## 2. Tạo Worker từ GitHub

Cloudflare -> Workers & Pages -> Create/Import repository.

Cấu hình:

- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Root directory: `/` nếu các file `package.json`, `wrangler.jsonc`, `src/` nằm ngay gốc repository.

Wrangler sẽ deploy thư mục `out/` được Next.js tạo ra.

## 3. Gắn tên miền

Tên đề xuất:

`giaovien.quanlytieuhoc-fma-tamha.site`

Vào Worker -> Domains -> Add Domain và nhập tên trên.

Bạn có thể dùng subdomain khác; không cần sửa source code.

## 4. Firebase Authentication - bắt buộc

Firebase Console -> Authentication -> Settings -> Authorized domains.

Thêm:

`giaovien.quanlytieuhoc-fma-tamha.site`

Nếu dùng tên khác thì thêm đúng hostname đó, không có `https://`.

Giữ `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=teacher-management-e718b.firebaseapp.com`; không đổi sang domain Cloudflare.

## 5. Firebase App Check / reCAPTCHA - rất quan trọng

Web đang bật Firebase App Check bằng reCAPTCHA v3. Hãy thêm hostname Cloudflare mới vào danh sách domain được phép của reCAPTCHA site key đang dùng.

Nếu sau này bật App Check Enforce mà chưa thêm domain mới, Firestore/Storage/Functions có thể bị chặn dù đăng nhập thành công.

## 6. Backend Firebase

Nếu Functions, Rules, Indexes và Storage Rules đã deploy thành công trước đây thì KHÔNG cần deploy lại chỉ vì chuyển hosting.

Không xóa Firebase Functions hoặc Firestore. Cloudflare chỉ thay lớp hosting web.

## 7. Smoke test trước khi tắt Firebase App Hosting

Kiểm tra ít nhất:

- `/login/`
- `/dashboard/`
- đăng nhập Google/email
- Admin tạo/sửa danh mục
- giáo viên xem lịch
- gửi đơn nghỉ + upload file
- tổ trưởng duyệt/chọn dạy thay
- callable Functions
- App Check metrics

Giữ Firebase App Hosting cũ chạy song song cho đến khi các bước trên ổn định.

## 8. Nếu Cloudflare báo Static Assets only

Đây là bình thường với bản này. Backend không chạy trên Worker; backend vẫn là Firebase.
