import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    // เปิดจากมือถือใน LAN ได้ (vite ปฏิเสธ host แปลกๆ โดย default)
    strictPort: true,
    // ลิงก์ของ cloudflared quick tunnel — ให้มือถือที่ใช้เน็ตตัวเองเปิดได้
    allowedHosts: [".trycloudflare.com"],
    /**
     * ส่ง /api ต่อให้ backend จากฝั่ง vite — browser จึงคุยกับ origin เดียว
     * tunnel เปิดได้แค่พอร์ตเดียว ถ้า browser ต้องยิงไป :8000 เองจะเข้าไม่ถึง
     * ใน docker ตั้ง API_PROXY_TARGET เป็นชื่อ service แทน (localhost คือตัว container)
     */
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000",
    },
  },
});
