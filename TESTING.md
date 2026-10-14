# ShareX — Cross-Device Manual Test Checklist

## Pre-requisites
- [ ] Host computer (Windows/Linux) running ShareX (`node dist/server.js`)
- [ ] All test devices on the same Wi-Fi network or mobile hotspot
- [ ] Port 7788 allowed through host firewall

---

## 1. Server Startup
- [ ] Server starts without errors
- [ ] Terminal shows PIN, local URLs, and network address
- [ ] `http://localhost:7788` opens in browser and serves the UI
- [ ] `GET /api/host-info` returns JSON with addresses

---

## 2. QR Code & Connection
- [ ] QR code is visible in the browser dashboard
- [ ] Scanning QR code with Android phone camera opens the URL correctly
- [ ] Scanning QR code with iPhone camera opens URL in Safari
- [ ] Manually entering the local URL works as fallback

---

## 3. Pairing — Android Chrome
- [ ] Enter device name → click Connect
- [ ] PIN entry screen appears (6 boxes)
- [ ] Entering wrong PIN shows error with attempts remaining
- [ ] Entering correct PIN proceeds (auto-approve or wait screen)
- [ ] Device appears in host dashboard as "Connected"
- [ ] WebSocket connection established (status dot turns green)

---

## 4. Pairing — iPhone Safari
- [ ] Same pairing flow works in Safari
- [ ] No app install prompt (browser-only flow)
- [ ] Device correctly identified in connected list

---

## 5. Windows/Linux → Phone (Host sends to phone)
- [ ] Connect phone first (paired)
- [ ] On host browser: select phone as receiver
- [ ] Select 1 file via file picker or drag-and-drop
- [ ] Click "Send Files"
- [ ] Phone shows incoming transfer request with file name and size
- [ ] Phone accepts the transfer
- [ ] Progress bar updates in real time on both devices
- [ ] Transfer completes — phone shows "Save" / download button
- [ ] Download the file on phone — content is correct
- [ ] Try with: image (.jpg), video (.mp4), audio (.mp3), PDF, ZIP

---

## 6. Phone → Windows/Linux (Phone sends to host)
- [ ] On phone: select "Host Computer" as receiver
- [ ] Select file using browser file picker
- [ ] Click Send — upload starts immediately
- [ ] Progress bar shows on phone
- [ ] File appears in `backend/received/` directory on host
- [ ] Verify file contents are identical to original (open the file)
- [ ] Try large file (>100 MB) — streaming works without RAM spike

---

## 7. Phone → Phone (Relay)
- [ ] Both phones are connected to host
- [ ] Phone A selects Phone B as receiver
- [ ] Selects a file and clicks Send
- [ ] Phone B shows incoming transfer approval prompt
- [ ] Phone B accepts
- [ ] File transfers: Phone A → Host → Phone B
- [ ] Phone B can download the file
- [ ] File content is identical to original

---

## 8. Multi-File Transfer
- [ ] Select 5+ files of different types
- [ ] Send to host
- [ ] All files received correctly
- [ ] Each file shows correct name and size
- [ ] History shows all files

---

## 9. Large File (>500 MB)
- [ ] Initiate transfer of a large file
- [ ] Server RAM stays stable (streaming, not buffering entire file)
- [ ] Transfer completes without timeout
- [ ] Checksum verification passes (check server logs)

---

## 10. Cancel & Retry
- [ ] Start a transfer, click Cancel before completion
- [ ] Transfer marked as Cancelled
- [ ] Temp file cleaned up from server
- [ ] Click Retry — transfer restarts from beginning

---

## 11. Error Handling
- [ ] Disconnect phone's Wi-Fi mid-transfer — error shown
- [ ] Send file that exceeds size limit — rejected with clear error
- [ ] Upload malicious filename (`../../etc/passwd`) — sanitized, not traversed

---

## 12. Security
- [ ] Unauthorized request (no token) returns 401
- [ ] Wrong session token returns 401
- [ ] More than 5 wrong PINs returns rate limit error
- [ ] WebSocket connection without valid token is rejected

---

## 13. Transfer History
- [ ] Completed transfers appear in History tab
- [ ] History shows file names, sizes, timestamps, status
- [ ] "Clear History" empties the list
- [ ] History does not expose server file paths

---

## 14. Device Management
- [ ] Rename own device — name updates on all connected clients
- [ ] Devices tab shows all connected devices
- [ ] Refresh button updates device list

---

## 15. PWA Install
- [ ] On Android Chrome: browser shows "Add to home screen" prompt
- [ ] Installed PWA opens correctly
- [ ] App works offline for UI (network still needed for transfers)

---

## 16. Theme
- [ ] Dark theme is default
- [ ] Light theme toggle works
- [ ] Theme persists across page refresh

---

## Test Results Log

| Test | Platform | Result | Notes |
|------|----------|--------|-------|
| Server startup | Windows | | |
| QR pairing | Android | | |
| QR pairing | iPhone | | |
| Phone→Host upload | Android | | |
| Host→Phone download | iPhone | | |
| Phone→Phone relay | Android↔Android | | |
| Large file (500MB) | Windows→Android | | |
| Cancel transfer | | | |
| Security — bad token | | | |
