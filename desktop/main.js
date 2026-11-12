const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");

let win = null;

// شناسهٔ ویندوز برای آیکن نوار وظیفه
try {
  app.setAppUserModelId("ir.smartdriver.assistant");
} catch (_) {}

function createWindow() {
  win = new BrowserWindow({
    width: 470,
    height: 900,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: "#F5EFE3",
    title: "راننده هوشمند",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "app", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "app", "index.html"));

  // لینک‌های خارجی (واتساپ و ...) در مرورگر سیستم باز شوند
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // هر ناوبری خارجی (واتساپ، تلگرام، تلفن) در مرورگر پیش‌فرض باز شود
  win.webContents.on("will-navigate", (e, url) => {
    if (!/^file:/i.test(url)) {
      e.preventDefault();
      if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    }
  });

  win.on("close", (e) => {
    if (app.__quitting) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["بستن", "ماندن"],
      defaultId: 1,
      cancelId: 1,
      title: "راننده هوشمند",
      message: "برنامه بسته شود؟",
      detail: "گزارش‌های ثبت‌شده روی همین رایانه ذخیره می‌مانند.",
    });
    if (choice !== 0) {
      e.preventDefault();
    } else {
      app.__quitting = true;
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
