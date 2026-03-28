# Image Resizer Pro

> **Công cụ chỉnh kích thước & tối ưu ảnh hoàn toàn phía client — sẵn sàng deploy lên GitHub Pages.**

---

## 🚀 Tính năng hoàn thành

| Tính năng | Mô tả |
|---|---|
| **4 ô Drop Zone** | Kéo & thả hoặc chọn ảnh cho Logo (400×400), Favicon (512×512), Banner (1920×600), Bài viết (500×762) |
| **Xóa nền AI** | Logo và Favicon được xóa nền tự động bằng `@imgly/background-removal` (WASM, chạy offline) |
| **Pan & Zoom** | Kéo ảnh để reposition, cuộn chuột để zoom, nút +/- và reset |
| **Export WebP** | Mỗi ảnh được xuất đúng kích thước mục tiêu sang định dạng WebP |
| **Tối ưu <100KB** | Binary-search quality + resize fallback để đảm bảo mỗi file < 100KB |
| **ZIP tự đặt tên** | File ZIP được đặt tên `images_YYYYMMDD_HHmmss.zip` theo ngày giờ xuất |
| **100% Client-side** | Không upload ảnh, không server — hoạt động hoàn toàn trên trình duyệt |
| **Responsive** | Giao diện đẹp trên desktop và mobile |

---

## 📂 Cấu trúc file

```
index.html        — Trang chính với 4 slot card
css/style.css     — Toàn bộ CSS (dark theme, responsive)
js/app.js         — JavaScript logic (ES Module)
README.md         — Tài liệu này
```

---

## 🌐 Cách deploy lên GitHub Pages

1. **Tạo repository mới** trên GitHub (public)
2. **Upload tất cả file** (index.html, css/, js/) lên repo
3. Vào **Settings → Pages → Source**: chọn branch `main`, folder `/root`
4. GitHub sẽ cung cấp URL dạng: `https://<username>.github.io/<repo>/`

> **Lưu ý:** `js/app.js` sử dụng `type="module"` và import ESM từ jsDelivr CDN — yêu cầu HTTPS (GitHub Pages hỗ trợ đầy đủ).

---

## 🔧 Công nghệ sử dụng

| Thư viện | Phiên bản | Mục đích |
|---|---|---|
| [@imgly/background-removal](https://github.com/imgly/background-removal-js) | 1.4.5 | Xóa nền AI (WASM) |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | Tạo file ZIP |
| [Font Awesome](https://fontawesome.com/) | 6.4.0 | Icons |
| [Google Fonts – Inter](https://fonts.google.com/specimen/Inter) | — | Typography |

---

## 📐 Chi tiết 4 Slot

| Slot | Kích thước | Xóa nền | Tên file xuất |
|---|---|---|---|
| Logo | 400 × 400 px | ✅ Có | `logo_400x400.webp` |
| Favicon | 512 × 512 px | ✅ Có | `favicon_512x512.webp` |
| Banner | 1920 × 600 px | ❌ Không | `banner_1920x600.webp` |
| Ảnh Bài Viết | 500 × 762 px | ❌ Không | `post_500x762.webp` |

---

## ⚠️ Lưu ý

- Lần đầu xóa nền có thể mất 10–30 giây để tải model WASM (~40MB) từ CDN
- Sau lần đầu, model được cache bởi browser — các lần sau sẽ nhanh hơn
- Hỗ trợ ảnh: JPG, PNG, GIF, WebP, BMP, SVG
- File ảnh lớn (>5MB) có thể mất nhiều thời gian xử lý hơn

---

## 🔮 Tính năng có thể phát triển thêm

- [ ] Hỗ trợ paste ảnh từ clipboard (Ctrl+V)
- [ ] Preview trước khi export
- [ ] Chọn màu nền tùy chỉnh sau khi xóa nền
- [ ] Export từng ảnh riêng lẻ (không cần ZIP)
- [ ] Thêm watermark / text overlay
- [ ] Undo/redo

---

*Image Resizer Pro — Hoàn toàn client-side, an toàn & bảo mật*
