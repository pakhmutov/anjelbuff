import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { db } from './client.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await db.query(sql);
    console.log('✅ DB schema applied');
}
