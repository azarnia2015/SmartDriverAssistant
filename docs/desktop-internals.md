# راننده هوشمند — نسخهٔ دسکتاپ ویندوز (Electron)

پوستهٔ دسکتاپ برای همان اپ وب (`driver-assistant/web`) — بدون تغییر منطق، با پنجرهٔ مستقل،
منوی مخفی، آیکن اختصاصی و تأییدیهٔ بستن.

## ساخت پرتابل (روی لینوکس/مک/ویندوز)
```bash
cd desktop
npm install
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --dir
# خروجی: dist/win-unpacked/SmartDriverAssistant.exe
```

## ساخت نصب‌کنندهٔ واقعی (Setup.exe + Uninstall + میان‌بر)
روی **ویندوز**:
```bat
cd desktop
npm install
npx electron-builder --win nsis
:: خروجی: dist/SmartDriverAssistant-Setup-2.0.0.exe
```
یا روی لینوکس با نصب wine:
```bash
sudo apt install -y wine wine64
npx electron-builder --win nsis
```
> در این محیط wine در دسترس نبود (کاربر بدون دسترسی روت)، بنابراین نصب‌کنندهٔ NSIS ساخته نشد؛
> پکیج پرتابل کامل و قابل اجرا تولید شد.

## ساختار
| فایل | نقش |
|---|---|
| `main.js` | پنجرهٔ ۴۷۰×۹۰۰، آیکن، منوی خاموش، بازکردن لینک خارجی در مرورگر سیستم، تأییدیهٔ بستن، `will-navigate` |
| `app/` | همان `index.html` + `app.js` + `style.css` + `xlsx.js` + فونت‌های وزیرمتن + `icon.ico` |
| `package.json` | electron 38.2.2، electron-builder 25.1.8، `signAndEditExecutable:false` (بدون گواهی کد) |

## نکته‌ها
- ذخیره‌سازی: `localStorage` داخل `%APPDATA%\SmartDriverAssistant` (کلید `driver_assistant_v2`).
- خروجی اکسل: همان `xlsx.js` بدون شبکه؛ فایل در `Downloads` ذخیره می‌شود.
- صدای فارسی: `speechSynthesis` ویندوز (SAPI). تشخیص گفتار میکروفون در Electron عملاً ممکن نیست →
  برای گزارش صوتی از APK اندروید استفاده شود.
