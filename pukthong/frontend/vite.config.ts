import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    // เปิดจากมือถือใน LAN ได้ (vite ปฏิเสธ host แปลกๆ โดย default)
    strictPort: true,
  },
});
