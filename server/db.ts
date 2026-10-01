import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AuditEntry } from '../shared/api'

// Entities are stored as JSON documents keyed by id, with case_id indexed for lookups.
// Insertion order (rowid) is preserved on update, which keeps the evidence ledger in order.

const ENTITY_TABLES = ['users', 'cases', 'evidence', 'missions', 'work_orders', 'public_updates', 'files'] as const
export type EntityTable = (typeof ENTITY_TABLES)[number]

export class Store {
  readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    for (const table of ENTITY_TABLES) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, case_id TEXT, data TEXT NOT NULL)`)
      this.db.exec(`CREATE INDEX IF NOT EXISTS ${table}_case ON ${table}(case_id)`)
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, case_id TEXT, detail TEXT NOT NULL)`)
  }

  get<T>(table: EntityTable, id: string): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as T) : undefined
  }

  put<T extends { id: string }>(table: EntityTable, record: T, caseId: string | null = null): T {
    this.db.prepare(`INSERT INTO ${table} (id, case_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET case_id = excluded.case_id, data = excluded.data`)
      .run(record.id, caseId, JSON.stringify(record))
    return record
  }

  all<T>(table: EntityTable): T[] {
    return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map(r => JSON.parse(r.data) as T)
  }

  byCase<T>(table: EntityTable, caseId: string): T[] {
    return (this.db.prepare(`SELECT data FROM ${table} WHERE case_id = ? ORDER BY rowid`).all(caseId) as { data: string }[]).map(r => JSON.parse(r.data) as T)
  }

  count(table: EntityTable): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  }

  audit(actorId: string, action: string, caseId: string | null, detail: string): void {
    this.db.prepare('INSERT INTO audit (at, actor_id, action, case_id, detail) VALUES (?, ?, ?, ?, ?)').run(new Date().toISOString(), actorId, action, caseId, detail)
  }

  auditLog(): AuditEntry[] {
    return this.db.prepare('SELECT id, at, actor_id AS actorId, action, case_id AS caseId, detail FROM audit ORDER BY id DESC').all() as unknown as AuditEntry[]
  }

  reset(): void {
    for (const table of ENTITY_TABLES) if (table !== 'users') this.db.exec(`DELETE FROM ${table}`)
  }

  close(): void { this.db.close() }
}
