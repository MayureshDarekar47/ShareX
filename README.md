# ⚡ ShareX — Lifetime-Free Local File Sharing

A fast, private, local-network file sharing system. No cloud, no signup, no ads, no subscriptions.

> **Works on:** Windows, Linux, Android (Chrome), iPhone (Safari) — on the same Wi-Fi or hotspot.

---

## ✨ Features

- 🔒 **100% local** — files never leave your network
- 📱 **No app required** — phones use their browser
- 🔐 **PIN + approval pairing** — explicit device authorization
- ⇄ **Host relay** — phone-to-phone transfers via the host
- 📊 **Live progress** — upload/download speed and ETA
- 🎯 **Any file type** — images, video, audio, ZIP, APK, documents
- 🔄 **Multi-file transfers** with drag-and-drop
- ✅ **SHA-256 checksums** verify file integrity
- 🌙 **Dark + Light themes** — installable PWA
- ⚡ **No cloud, no internet required** after install

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** — https://nodejs.org/
- Both devices on the **same Wi-Fi or mobile hotspot**

### Windows
```batch
# Double-click or run in terminal:
scripts\start.bat
```

### Linux / macOS
```bash
chmod +x scripts/start.sh
./scripts/start.sh
```

### Manual
```bash
# 1. Install & build backend
cd backend
npm install
npm run build

# 2. Install & build frontend
cd ../frontend
npm install
npm run build

# 3. Start server
cd ../backend
node dist/server.js
```

Then open **http://localhost:7788** in your browser.

---

## 📱 Connecting Other Devices

1. Start ShareX on the host computer
2. Open your browser on the phone and navigate to:
   - Scan the **QR code** shown in the browser dashboard, **OR**
   - Type the **local URL** shown in the terminal (e.g. `http://192.168.1.5:7788`)
3. Enter the **6-digit PIN** shown in the terminal
4. Host approves the device → connection established

---

## 📁 Project Structure

```
ShareX/
├── backend/                 # Node.js + TypeScript server
│   ├── src/
│   │   ├── server.ts        # Express + WebSocket entry point
│   │   ├── config.ts        # Configuration
│   │   ├── types.ts         # Shared TypeScript types
│   │   ├── routes/
│   │   │   ├── auth.ts      # Pairing & PIN routes
│   │   │   ├── devices.ts   # Device management
│   │   │   └── files.ts     # Upload / download / transfer routes
│   │   ├── services/
│   │   │   ├── deviceStore.ts    # Device pairing state
│   │   │   └── transferService.ts # Transfer lifecycle & cleanup
│   │   ├── middleware/
│   │   │   ├── auth.ts      # Session token validation
│   │   │   ├── rateLimit.ts # Rate limiting
│   │   │   └── security.ts  # Helmet, error handling
│   │   ├── websocket/
│   │   │   └── handler.ts   # WS connection management
│   │   └── utils/
│   │       ├── network.ts   # IP discovery
│   │       ├── qrcode.ts    # QR generation
│   │       └── crypto.ts    # Checksums, tokens, path safety
│   ├── tests/               # Jest integration tests
│   ├── uploads/             # Temp upload storage (auto-created)
│   └── received/            # Completed received files (auto-created)
├── frontend/                # React + Vite PWA
│   └── src/
│       ├── api/             # HTTP client + WebSocket client
│       ├── context/         # App state (AppContext)
│       ├── pages/           # PairingPage, DashboardPage
│       └── components/      # Navbar
├── shared/                  # Canonical shared types (reference)
├── scripts/
│   ├── start.bat            # Windows launcher
│   └── start.sh             # Linux/macOS launcher
├── README.md
├── LICENSE                  # MIT
└── .gitignore
```

---

## ⚙️ Configuration

Copy `backend/.env.example` to `backend/.env` and edit:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7788` | Server port |
| `SHAREX_PIN` | auto-generated | 6-digit pairing PIN |
| `REQUIRE_PIN` | `true` | Require PIN for pairing |
| `REQUIRE_APPROVAL` | `true` | Host must approve each device |
| `MAX_FILE_SIZE_MB` | `2048` | Max transfer size (MB) |
| `MAX_STORAGE_GB` | `10` | Storage quota (GB) |
| `RECEIVED_DIR` | `./received` | Where received files are saved |

---

## 🔒 Security

- **Session tokens** for all authorized requests
- **PIN-based pairing** with rate limiting (5 attempts max)
- **Host approval** required before a device can transfer
- **Path traversal protection** — all filenames sanitized
- **SHA-256 checksums** verify file integrity
- **No arbitrary filesystem access** — only configured directories
- **Local network only** — server binds `0.0.0.0` but is not exposed to the internet

### Firewall

**Windows** (run as Administrator):
```batch
netsh advfirewall firewall add rule name="ShareX" protocol=TCP dir=in localport=7788 action=allow profile=private
```

**Linux UFW:**
```bash
sudo ufw allow 7788/tcp
```

**Linux firewalld:**
```bash
sudo firewall-cmd --add-port=7788/tcp --permanent && sudo firewall-cmd --reload
```

---

## 📱 Platform Notes

| Platform | Notes |
|---|---|
| **Android Chrome** | Full support — upload, download, background transfers limited |
| **iPhone Safari** | Full support — Safari may show a share sheet for downloads instead of auto-saving |
| **Windows** | Full support including drag-and-drop |
| **Linux** | Full support |

### Known Limitations
- **Background transfers**: Browsers suspend JavaScript when the tab is backgrounded; keep the tab active during large transfers
- **Safari downloads**: iOS Safari may prompt to open files in a compatible app instead of saving directly to Files
- **Phone-to-phone**: Both phones must stay connected to the host; the host relays the data
- **Max performance**: Transfer speed depends entirely on your local network — not ShareX

---

## 🧪 Development

```bash
# Backend dev (hot reload)
cd backend && npm run dev

# Frontend dev (Vite HMR)
cd frontend && npm run dev

# Run tests
cd backend && npm test

# Production build
cd backend && npm run build
cd frontend && npm run build
```

---

## 📜 License

MIT — see [LICENSE](LICENSE)
