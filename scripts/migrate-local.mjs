import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const filename = readdirSync(directory).find(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (!filename) throw Error('请先启动一次本地预览，创建 D1 数据库。');
const db = new DatabaseSync(resolve(directory, filename));
try {
  for (const file of ['0000_mean_salo.sql', '0001_maker_console.sql']) {
    const sql = readFileSync(resolve('drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', '')
      .replaceAll('CREATE TABLE `', 'CREATE TABLE IF NOT EXISTS `')
      .replaceAll('CREATE UNIQUE INDEX `', 'CREATE UNIQUE INDEX IF NOT EXISTS `');
    db.exec(sql);
  }
  console.log('本地管理后台数据库已准备好。');
} finally { db.close(); }
