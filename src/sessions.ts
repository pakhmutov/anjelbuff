import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import fs from 'fs';

const DB_FILE = './sessions.db';
let db: Database;

export async function initDb(): Promise<void> {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_FILE)) {
        const fileBuffer = fs.readFileSync(DB_FILE);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      user_id INTEGER PRIMARY KEY,
      cookies  TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    )
  `);
}

// Сохраняем db на диск после каждого изменения
function persist(): void {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
}

export function saveSession(userId: number, cookies: unknown[]): void {
    db.run(
        `
    INSERT INTO sessions (user_id, cookies, saved_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET cookies = excluded.cookies, saved_at = excluded.saved_at
  `,
        [userId, JSON.stringify(cookies), Date.now()],
    );
    persist();
}

export function getSession(userId: number): unknown[] | null {
    const stmt = db.prepare(`SELECT cookies FROM sessions WHERE user_id = ?`);
    stmt.bind([userId]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        return JSON.parse(row.cookies as string);
    }
    return null;
}

export function hasSession(userId: number): boolean {
    return getSession(userId) !== null;
}

export function deleteSession(userId: number): void {
    db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    persist();
}

export function cookiesToHeader(cookies: Array<{ key: string; value: string }>): string {
    return cookies.map((c) => `${c.key}=${c.value}`).join('; ');
}
