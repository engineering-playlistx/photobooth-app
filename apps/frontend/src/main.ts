import {
  app,
  BrowserWindow,
  session,
  ipcMain,
  Menu,
  dialog,
  protocol,
  net,
  globalShortcut,
} from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let started = false;
try {
  started = require("electron-squirrel-startup");
} catch {
  // Module may not be available in all environments
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-file",
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true },
  },
]);

const createWindow = () => {
  // Create the browser window with 9:16 aspect ratio (width:height = 9:16)
  const ASPECT_RATIO = 9 / 16;
  let isResizing = false;

  const mainWindow = new BrowserWindow({
    width: isDev ? 2160 : 1080,
    height: 1920,
    minWidth: 540,
    minHeight: 960,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Create application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Home",
          accelerator: "CmdOrCtrl+H",
          click: () => {
            mainWindow.webContents.send("navigate-to-home");
          },
        },
        {
          label: "View Data",
          accelerator: "CmdOrCtrl+D",
          click: () => {
            mainWindow.webContents.send("navigate-to-data");
          },
        },
        { type: "separator" },
        {
          role: "quit",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload" },
        { role: "forceReload", label: "Force Reload" },
        { role: "toggleDevTools", label: "Toggle Developer Tools" },
        { type: "separator" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toggle Full Screen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize", label: "Minimize" },
        { role: "close", label: "Close" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () => {
            void dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About PlaylistX Photobooth",
              message: "PlaylistX Photobooth",
              detail: `Version: 1.0.0\nAuthor: PlaylistX Studio\n\nPhotobooth application for capturing and managing photos.`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Enforce 9:16 aspect ratio on resize
  let lastWidth = 1080;
  let lastHeight = 1920;

  mainWindow.on("resize", () => {
    if (isResizing) {
      return;
    }

    isResizing = true;
    const [width, height] = mainWindow.getSize();
    const currentRatio = width / height;

    if (Math.abs(currentRatio - ASPECT_RATIO) > 0.01) {
      const widthChanged = width !== lastWidth;
      const heightChanged = height !== lastHeight;

      if (widthChanged) {
        const newHeight = Math.round(width / ASPECT_RATIO);
        mainWindow.setSize(width, newHeight, false);
        lastWidth = width;
        lastHeight = newHeight;
      } else if (heightChanged) {
        const newWidth = Math.round(height * ASPECT_RATIO);
        mainWindow.setSize(newWidth, height, false);
        lastWidth = newWidth;
        lastHeight = height;
      }
    } else {
      lastWidth = width;
      lastHeight = height;
    }

    isResizing = false;
  });

  // Adjust CSP so Vite scripts and inline scripts are allowed in dev, but locked down in prod
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self' blob:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      // `connect-src 'self' https://api.iconify.design ${process.env.VITE_API_BASE_URL || ""} ${process.env.VITE_SUPABASE_URL || ""}`,
      `connect-src 'self' local-file: https://api.iconify.design http://localhost:* https://*`,
      "font-src 'self'",
      "media-src 'self'",
      "frame-src 'self'",
      "",
    ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools only in development.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  protocol.handle("local-file", (request) => {
    const filePath = request.url.replace("local-file://", "");
    return net.fetch(pathToFileURL(decodeURIComponent(filePath)).href);
  });
  createWindow();

  // Ctrl+Shift+S opens the KioskSettings overlay in the renderer
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      win.webContents.send("open-kiosk-settings");
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// database feature
import { savePhotoFileToFilesystem } from "./utils/filesystem";
import {
  savePhotoResultToSQLite,
  getAllPhotoResultsFromSQLite,
  getPhotoResultByIdFromSQLite,
} from "./database/sqlite";
import type { PhotoResultDocument } from "./utils/database";

ipcMain.handle(
  "save-photo-file",
  (_event, base64Data: string, fileName: string) => {
    try {
      const filePath = savePhotoFileToFilesystem(base64Data, fileName);
      return { success: true, filePath };
    } catch (error) {
      console.error("Failed to save photo file:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle(
  "db-save-photo-result",
  (_event, document: PhotoResultDocument) => {
    try {
      savePhotoResultToSQLite(document);
      return { success: true };
    } catch (error) {
      console.error("Failed to save photo result:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);

ipcMain.handle("db-get-all-photo-results", () => {
  try {
    const results = getAllPhotoResultsFromSQLite();
    return { success: true, data: results };
  } catch (error) {
    console.error("Failed to get photo results:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: [],
    };
  }
});

ipcMain.handle("db-get-photo-result-by-id", (_event, id: string) => {
  try {
    const result = getPhotoResultByIdFromSQLite(id);
    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to get photo result:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
});

// printing feature
ipcMain.handle(
  "print-window",
  async (_event, filePath: string, printerName?: string) => {
    try {
      // Create a hidden window for printing
      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Create HTML file path
      const htmlPath = path.join(path.dirname(filePath), "print-temp.html");
      const fs = require("fs");

      // Create HTML content with file reference
      const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @page {
            margin: 0;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            width: 4.05in;
            height: 6.05in;
            position: relative;
            background: black;
          }

          img {
            position: absolute;
            top: 0.756in;
            left: 50%;
            transform: translateX(-50%) rotate(90deg);
            width: 2.15in;
            height: auto;
          }
        </style>
      </head>
      <body>
        <img src="file:///${filePath.replace(/\\/g, "/")}" />
      </body>
    </html>
  `;

      // Write HTML file
      fs.writeFileSync(htmlPath, htmlContent);

      // Load the HTML file and wait for all content (including images) to render
      await printWindow.loadFile(htmlPath);
      await new Promise<void>((resolve) => {
        if (printWindow.webContents.isLoading()) {
          printWindow.webContents.once("did-finish-load", () => resolve());
        } else {
          resolve();
        }
      });

      const cleanup = () => {
        printWindow.close();
        const tempHtmlPath = path.join(
          path.dirname(filePath),
          "print-temp.html",
        );
        try {
          if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath);
          }
        } catch (err) {
          console.error("Failed to delete temp HTML file:", err);
        }
      };

      // Print the window; cleanup runs in the completion callback
      console.log(
        `[print-window] filePath=${filePath}, printerName=${JSON.stringify(printerName)}`,
      );
      if (!printerName) {
        throw new Error("printerName is required but was not configured");
      }

      printWindow.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          printBackground: true,
          landscape: true,
          color: true,
          margins: {
            marginType: "none",
          },
        },
        (success, failureReason) => {
          if (!success) {
            console.error("Print job failed:", failureReason);
          }
          cleanup();
        },
      );

      return { success: true };
    } catch (error) {
      console.error("Print failed", error);
      throw error;
    }
  },
);

// kiosk config feature
interface KioskConfig {
  eventId: string;
  apiBaseUrl: string;
  apiClientKey: string;
}

const KIOSK_ADMIN_PIN = process.env.KIOSK_ADMIN_PIN ?? "0000";
if (KIOSK_ADMIN_PIN === "0000") {
  console.warn(
    "[main] KIOSK_ADMIN_PIN is using the default value — set it before deploying to production",
  );
}

ipcMain.handle("get-kiosk-config", () => {
  const fs = require("fs");
  const configPath = path.join(app.getPath("userData"), "kiosk.config.json");

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8") as string;
      return JSON.parse(raw) as KioskConfig;
    } catch (err) {
      console.error(
        "[get-kiosk-config] Failed to parse kiosk.config.json:",
        err,
      );
    }
  }

  if (isDev) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env ?? {};
    const config: KioskConfig = {
      eventId: (env.VITE_EVENT_ID as string | undefined) ?? "",
      apiBaseUrl:
        (env.VITE_API_BASE_URL as string | undefined) ??
        "http://localhost:3000",
      apiClientKey: (env.VITE_API_CLIENT_KEY as string | undefined) ?? "",
    };
    return config;
  }

  // Prod: missing config is fatal
  dialog.showErrorBox(
    "Configuration Missing",
    "kiosk.config.json was not found. Please contact your system administrator.",
  );
  app.quit();
  throw new Error("kiosk.config.json not found");
});

ipcMain.handle("save-kiosk-config", (_event, updates: Partial<KioskConfig>) => {
  const fs = require("fs");
  const configPath = path.join(app.getPath("userData"), "kiosk.config.json");
  // Seed defaults from env vars in dev so that a first-time save (no existing file)
  // doesn't write empty apiBaseUrl/apiClientKey into kiosk.config.json.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = isDev ? ((import.meta as any).env ?? {}) : {};
  let existing: KioskConfig = {
    eventId: (env.VITE_EVENT_ID as string | undefined) ?? "",
    apiBaseUrl:
      (env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000",
    apiClientKey: (env.VITE_API_CLIENT_KEY as string | undefined) ?? "",
  };
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(
        fs.readFileSync(configPath, "utf-8") as string,
      ) as KioskConfig;
    } catch {
      // Ignore parse errors — overwrite with merged config
    }
  }
  const merged = { ...existing, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
});

ipcMain.handle("get-kiosk-admin-pin", () => KIOSK_ADMIN_PIN);

// printing feature pdf
ipcMain.handle("print-window-pdf", async (_event, imageDataUrl: string) => {
  try {
    // Create a hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Create HTML content with just the image
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page {
              margin: 0
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              width: 4in;
              height: 6in;
              margin: 0;
              padding: 0;
            }
            img {
              width: 100%;
              height: auto;
              display: block;
              object-fit: cover;
            }
          </style>
        </head>
        <body>
          <img src="${imageDataUrl}" />
        </body>
      </html>
    `;

    // Load the HTML content
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
    );

    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Print the window
    const pdfData = await printWindow.webContents.printToPDF({
      printBackground: true,
      landscape: false,
      // landscape: true,
      margins: {
        marginType: "none",
      },
      pageSize: {
        width: 4, // 4in × 72 = 288pt
        height: 6, // 6in × 72 = 432pt
      },
    });

    // save PDF to desktop
    const fs = require("fs");
    const os = require("os");
    const desktopPath = path.join(os.homedir(), "Desktop");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(desktopPath, `print-${timestamp}.pdf`);

    fs.writeFileSync(filePath, pdfData);
    console.log(`Pdf saved to ${filePath}`);

    // Close the print window after a delay
    setTimeout(() => {
      printWindow.close();
    }, 1000);

    return { success: true, filePath };
  } catch (error) {
    console.error("Print failed", error);
    throw error;
  }
});
