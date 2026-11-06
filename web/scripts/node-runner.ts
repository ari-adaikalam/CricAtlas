import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { PLAYER_KIND, type DataFile, type PlayerKind } from '../src/data/sources';
import { currentPlayer } from '../src/data/store';
import { useRunner } from '../src/data/engine';
import { usePointSource } from '../src/data/points';
import { emptyPointSet, parsePointFile } from '../src/domain/pointFile';
import { questionHash } from '../src/data/queryCache';

// Runs the app's own data loaders in Node against the exported files, so a build script gets exactly the answers the browser would. The loaders write file names such as
// 'balls_by_batter.parquet' into their SQL; here each name is replaced by the path of the file it stands for (the current player's own file for the per-player kinds).

export const dataDir = path.resolve(process.env.DATA_DIR ?? '../data/export');

function pathOf(file: DataFile): string {
  const kind = (PLAYER_KIND as Partial<Record<DataFile, PlayerKind>>)[file];
  if (!kind) return path.join(dataDir, file);
  const id = currentPlayer();
  const own = path.join(dataDir, 'p', kind, `${id}.parquet`);
  return fs.existsSync(own) ? own : path.join(dataDir, 'p', kind, '_empty.parquet');
}

/** JSON the browser could have produced: whole numbers as numbers, dates as text. */
function plain(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const v = value as { toString?: () => string; constructor?: { name?: string } };
    const name = v.constructor?.name ?? '';
    if (name !== 'Object') return typeof v.toString === 'function' ? Number.isNaN(Number(v.toString())) ? v.toString() : Number(v.toString()) : null;
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, plain(x)]));
  }
  return value;
}

/** Counts the questions the engine (here, Node) had to answer, with the start of each one's SQL, for checking what a recorded view leaves out. */
export const asked: string[] = [];

/** While set, every answer is also kept here under the hash of its question (see queryCache.ts). */
let recording: Map<string, unknown[]> | null = null;

/** Runs `work` and returns every question it asked with its answer. */
export async function recordAnswers(work: () => Promise<unknown>): Promise<Map<string, unknown[]>> {
  const answers = new Map<string, unknown[]>();
  recording = answers;
  try { await work(); } finally { recording = null; }
  return answers;
}

export async function startNodeRunner(): Promise<DuckDBConnection> {
  // The point files are read from disk here, so the loaders that use them give the browser's answers.
  usePointSource(async (id, kind) => {
    const file = path.join(dataDir, 'p', kind, `${id}.bin`);
    if (!fs.existsSync(file)) return emptyPointSet();
    const bytes = fs.readFileSync(file);
    return parsePointFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  });
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  useRunner(async (files, sql, params) => {
    asked.push(sql.replace(/\s+/g, ' ').trim().slice(0, 90));
    let text = sql;
    for (const file of files) text = text.split(`'${file}'`).join(`'${pathOf(file).replace(/'/g, "''")}'`);
    const reader = await conn.runAndReadAll(text, params as Array<string | number>);
    const rows = reader.getRowObjects().map((row) => plain(row) as Record<string, unknown>);
    // A copy: a loader reverses or sorts the rows it gets in place (the false shot loaders do), and what is recorded must be what the engine answered, not what the loader made of it. A recorded
    // answer kept after the loader reversed it was replayed reversed again, and the False shot trend showed the oldest innings (found 2026-10-20 by comparing the tile with and without the point file).
    if (recording) recording.set(questionHash(files, sql, params), structuredClone(rows));
    return rows;
  });
  return conn;
}
