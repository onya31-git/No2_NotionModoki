import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本番では PocketBase が静的ファイルと /api を同一オリジンで配信する。
// 開発時も同じ相対パスで動くよう、/api だけローカルの PocketBase へプロキシする。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8090",
    },
  },
  build: {
    // BlockNote + Mantine で 1MB 前後になるため警告閾値だけ上げる
    chunkSizeWarningLimit: 2000,
  },
});
