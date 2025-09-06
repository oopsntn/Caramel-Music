# 🎶 fangnhip

[![Made with React](https://img.shields.io/badge/Frontend-React-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![Made with Express](https://img.shields.io/badge/Backend-Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Music Quality](https://img.shields.io/badge/Hi--Res-Audio-orange?logo=spotify&logoColor=white)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **fangnhip** là một dự án nghe nhạc chất lượng cao, stream trực tiếp từ **DLNA server** với các định dạng Hi-Res như **FLAC, WAV**, mang lại trải nghiệm âm thanh chân thực và mạnh mẽ 🎧.  
<img width="1536" height="1024" alt="ChatGPT Image Sep 2, 2025, 08_33_27 PM" src="https://github.com/user-attachments/assets/0966b8df-d0a4-4752-892a-096225cc201b" />
---

## ✨ Tính năng nổi bật
- 🔗 **Kết nối DLNA Server**: Lấy nhạc trực tiếp từ server trong mạng nội bộ.  
- 🎵 **Nghe nhạc Hi-Res**: Hỗ trợ FLAC, WAV, cùng nhiều định dạng lossless khác.  
- 📱 **Giao diện hiện đại**: Xây dựng bằng React, tối ưu trải nghiệm người dùng.  
- ⚡ **Streaming mượt mà**: ExpressJS làm backend để quản lý stream nhạc hiệu quả.  
- 🔍 **Tìm kiếm & quản lý**: Dễ dàng tìm bài hát, album, nghệ sĩ.  

---

## 📂 Cấu trúc dự án
fangnhip/
│── back-end/ # Express server (API, stream)
│── front-end/ # React app (UI)
│── .gitignore
│── README.md


---

## 🚀 Cài đặt & Chạy thử

### 1. Clone repo
```bash
git clone https://github.com/your-username/fangnhip.git
cd fangnhip

2. Cài đặt backend (Express)
cd back-end
npm install
npm start

Thư viện back-end: axios cors dotenv express fast-xml-parser music-metadata node-fetch
👉 Server chạy mặc định tại: http://localhost:5000

3. Cài đặt frontend (React)
cd ../front-end
npm install
npm start


👉 Ứng dụng React chạy tại: http://localhost:3000

🎧 Demo giao diện (ảnh minh họa)

📌 Roadmap

 Kết nối DLNA server và phát nhạc.

 Hỗ trợ playlist cá nhân.

 Chế độ Dark/Light theme.

 Ứng dụng mobile (React Native).

🤝 Đóng góp

Fork dự án.

Tạo branch mới: git checkout -b feature/ten-tinh-nang.

Commit thay đổi: git commit -m "Add new feature".

Push lên branch: git push origin feature/ten-tinh-nang.

Tạo Pull Request.

📜 Giấy phép

Dự án này sử dụng giấy phép MIT License – bạn được phép sử dụng, chỉnh sửa và phân phối.

🎵 fangnhip – nơi âm nhạc Hi-Res sống dậy cùng từng nhịp tim.
