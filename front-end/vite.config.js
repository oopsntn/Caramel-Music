import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';
import path from 'path';
import os from 'os'

const interfaces = os.networkInterfaces()
let hostIP = '0.0.0.0'
for (const iface of Object.values(interfaces)) {
    for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
            hostIP = info.address
            break
        }
    }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // https: {
    //   key: fs.readFileSync(path.resolve(__dirname, 'cert/key.pem')),
    //   cert: fs.readFileSync(path.resolve(__dirname, 'cert/cert.pem')),
    // },
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/albumArtUrl': {
        target: 'http://0.0.0.0:5000',
        changeOrigin: true,
        secure: false
      },
      '/api/items': {
        target: 'http://0.0.0.0:9999',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
      '/api/browse': {
        target: 'http://0.0.0.0:5000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  }
})
