import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { app } from "electron";
import type { PhotoResultDocument } from "../utils/database";

let dbInstance: DatabaseSync | null = null;

function getSQLiteDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "photobooth.db");

  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_results (
      id TEXT PRIMARY KEY,
      photo_path TEXT NOT NULL,
      selected_theme TEXT NOT NULL DEFAULT '',
      user_info TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_photo_results_created_at ON photo_results(created_at);
    CREATE INDEX IF NOT EXISTS idx_photo_results_photo_path ON photo_results(photo_path);
  `);

  dbInstance = db;
  return db;
}

export function savePhotoResultToSQLite(document: PhotoResultDocument): void {
  const db = getSQLiteDatabase();

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO photo_results 
     (id, photo_path, selected_theme, user_info, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  stmt.run(
    document.id,
    document.photoPath,
    JSON.stringify(document.selectedTheme),
    JSON.stringify(document.userInfo),
    document.createdAt,
    document.updatedAt,
  );
}

export function getAllPhotoResultsFromSQLite(): PhotoResultDocument[] {
  const db = getSQLiteDatabase();
  const stmt = db.prepare(
    "SELECT * FROM photo_results ORDER BY created_at DESC",
  );
  const rows = stmt.all();

  return rows.map((row: unknown) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      photoPath: r.photo_path as string,
      selectedTheme: JSON.parse(r.selected_theme as string),
      userInfo: JSON.parse(r.user_info as string),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });
}

export function getPhotoResultByIdFromSQLite(
  id: string,
): PhotoResultDocument | null {
  const db = getSQLiteDatabase();
  const stmt = db.prepare("SELECT * FROM photo_results WHERE id = ?");
  const row = stmt.get(id) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id as string,
    photoPath: row.photo_path as string,
    selectedTheme: JSON.parse(row.selected_theme as string),
    userInfo: JSON.parse(row.user_info as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
