# Overlay Studio — Moonlit Blossom

โปรแกรม Rust สำหรับทำ Overlay ไลฟ์สดใน OBS ธีมกลางคืน ดอกไม้เรืองแสง กลีบดอกไม้ร่วง และหิ่งห้อย
ดึงแชท YouTube ผ่าน innertube (ไม่ต้องใช้ API key) และดึงโดเนทจาก EasyDonate API

## วิธีใช้

1. เปิด `overlay-studio.exe` — หน้าต่างจะขยายเต็มจอ (ปรับขนาดไม่ได้) เนื้อหาเป็นสัดส่วน 16:9
2. **YouTube Live** — ใส่ `@ชื่อช่อง` แล้วกด *ค้นหาไลฟ์* จากนั้นเลือกไลฟ์ หรือเลือก *อัตโนมัติ* ให้ระบบหาไลฟ์ที่ออนอยู่เอง
3. **EasyDonate** — ใส่ API key (`ezdn_v1_…`) ที่สร้างจาก easydonate.app › หน้าจัดการ › โซนผู้พัฒนา › API Keys
   ให้ scope `read:donations` และ `read:widgets` (เพิ่ม `read:profile` ถ้าต้องการชื่อบัญชี)
4. แต่ละซีนกด **คัดลอก URL** แล้วใน OBS เพิ่ม *Browser Source* ขนาด **1920 × 1080**

| ซีน | URL | หมายเหตุ |
| --- | --- | --- |
| Starting Soon | `/scene/starting` | นับถอยหลัง — ติ๊ก *Refresh browser when scene becomes active* |
| Just Chatting | `/scene/chatting` | แชทซ้าย กล้องทรงซุ้มโค้ง (โปร่งใส) วาง Video Capture ไว้ใต้ Browser Source |
| Gameplay | `/scene/gameplay` | พื้นหลังโปร่งใส กล้องทรงโค้งมุมขวาล่าง โดเนทเด้งเป็นป๊อปอัพ |
| Stream Ended | `/scene/ending` | เครดิตผู้สนับสนุน (Top Donate) เลื่อนอัตโนมัติ |
| Chat only | `/widget/chat` | แชทอย่างเดียว ขนาดใดก็ได้ (แนะนำ 450 × 800) |
| Alerts only | `/widget/alerts` | ป๊อปอัพโดเนทอย่างเดียว 1920 × 1080 |

ทุกการตั้งค่าบันทึกอัตโนมัติที่ `%APPDATA%\OverlayStudio\config.json` และ overlay ใน OBS อัปเดตทันที

## ข้อมูลจาก EasyDonate

| ข้อมูล | Endpoint | ความถี่ |
| --- | --- | --- |
| โดเนทใหม่ (การ์ดในแชท + ป๊อปอัพ) | `GET /api/v1/donations` | ทุก 5 วินาที (ตั้งได้) |
| Top Donate อันดับ 1–10 | `GET /api/v1/donations/top-donators?startDate&endDate` | ทุก ~15 วินาที |
| Latest Donate | `GET /api/v1/donations?startDate&endDate` | ทุก ~15 วินาที |
| หลอดโดเนท | `GET /api/v1/widgets/goal` หรือรวมยอดเองตามช่วงเวลา | ทุก ~15 วินาที |


รวมประมาณ 28 request/นาที (นาฬิกาพระจันทร์แสดงเวลาไทย ไม่ได้ดึงจาก API) ต่ำกว่าลิมิต 60 request/นาที ของ EasyDonate
ถ้าตัวเลขไม่ตรง กด *ดูข้อมูลดิบ* ในหน้า EasyDonate เพื่อดู JSON ที่ API ส่งกลับมา

## Build

ต้องมี Rust (MSVC toolchain) และ WebView2 Runtime (มีใน Windows 11 อยู่แล้ว)

```powershell
cargo build --release
# ไฟล์อยู่ที่ target\release\overlay-studio.exe
```

ถ้าโฟลเดอร์โปรเจกต์อยู่ลึกมากจน link ไม่ผ่าน (LNK1104 — path ยาวเกิน 260 ตัวอักษร) ให้ตั้ง `CARGO_TARGET_DIR` เป็นโฟลเดอร์สั้น ๆ เช่น `C:\ostarget`

ตัวเลือกเพิ่มเติม:

- `--headless` รันเฉพาะเซิร์ฟเวอร์ ไม่เปิดหน้าต่าง (เปิด `http://127.0.0.1:3939/studio/` ในเบราว์เซอร์แทน)
- `--config <path>` ใช้ไฟล์ตั้งค่าอื่น

## โครงสร้าง

```
src/main.rs        หน้าต่าง (tao + wry/WebView2) และเริ่มเซิร์ฟเวอร์
src/server.rs      HTTP + SSE (axum) เสิร์ฟ studio และ overlay
src/youtube.rs     innertube: ค้นหาไลฟ์ของช่อง, ตรวจไลฟ์อัตโนมัติ, live chat, ยอดคนดู
src/easydonate.rs  EasyDonate API: โดเนทใหม่, Top, Latest, Goal, Timer
src/state.rs       สถานะกลาง + event bus
web/studio/        หน้าตั้งค่า
web/scene.*        ซีนทั้งหมด
web/shared/        ธีม, เอฟเฟกต์ (ท้องฟ้า กลีบดอกไม้ ดอกไม้เรืองแสง), วิดเจ็ต
```

## ติดตั้ง & อัปเดตอัตโนมัติ

- ตัวติดตั้ง `OverlayStudio-Setup.exe` ติดตั้งแบบผู้ใช้เดียว (ไม่ต้องใช้สิทธิ์ admin) ไปที่ `%LOCALAPPDATA%\Programs\OverlayStudio` พร้อมทางลัดใน Start Menu และหน้าจอ (เลือกได้)
- ทุกครั้งที่เปิดโปรแกรม จะเช็ค release ล่าสุดของ `flixzer/kayleepk-live-widget` บน GitHub ถ้าเวอร์ชันใหม่กว่า จะดาวน์โหลดตัวติดตั้งมาติดตั้งแบบเงียบแล้วเปิดโปรแกรมใหม่เอง (ปิดได้ที่หน้า ข้อมูลช่อง › อัปเดตอัตโนมัติ)
- การตั้งค่าที่ `%APPDATA%\OverlayStudio` ไม่ถูกลบตอนอัปเดตหรือถอนการติดตั้ง
- updater อ่าน release ผ่าน GitHub API แบบไม่ใช้ token จึงต้องเป็น release ที่เปิดสาธารณะ

### ออก release ใหม่

1. แก้ `version` ใน `overlay-studio/Cargo.toml` เช่น `0.2.0`
2. commit แล้ว push ขึ้น `main`
3. push tag ให้ตรงกับเวอร์ชัน: `git tag v0.2.0 && git push origin v0.2.0`

GitHub Actions (`.github/workflows/release.yml`) จะ build, สร้างตัวติดตั้งด้วย Inno Setup และสร้าง GitHub Release ที่มีไฟล์ `OverlayStudio-Setup.exe` ให้อัตโนมัติ
