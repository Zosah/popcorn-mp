import type {
  DemoJournalEntry,
  DemoJournalEntryInput,
} from '../domain/demo-journal'
import {
  addDemoJournalEntry,
  getDemoJournalEntry,
  listDemoJournalEntries,
  removeDemoJournalEntry,
  updateDemoJournalEntry,
} from './demo-journal'
import {
  JournalGatewayError,
  type JournalGateway,
  type JournalItem,
  type JournalListFilters,
  type JournalSummary,
} from './journal-gateway'

export class DemoJournalGateway implements JournalGateway {
  private readonly versions = new Map<string, number>()

  async list(filters: JournalListFilters = {}): Promise<JournalItem[]> {
    const query = filters.query?.trim().toLocaleLowerCase() ?? ''
    const kinds = new Set(filters.kinds ?? [])
    return listDemoJournalEntries()
      .filter((entry) => !kinds.size || kinds.has(entry.kind))
      .filter((entry) => !filters.category || entry.category === filters.category)
      .filter((entry) => !filters.visibility || entry.visibility === filters.visibility)
      .filter((entry) => {
        if (!query) return true
        return `${entry.title}\n${entry.content}`.toLocaleLowerCase().includes(query)
      })
      .map((entry) => this.withVersion(entry))
  }

  async summary(): Promise<JournalSummary> {
    const entries = listDemoJournalEntries()
    return {
      total: entries.length,
      moments: entries.filter((entry) => entry.kind === 'moment').length,
      notes: entries.filter((entry) => entry.kind === 'note').length,
      private: entries.filter((entry) => entry.visibility === 'private').length,
    }
  }

  async get(id: string): Promise<JournalItem | null> {
    const entry = getDemoJournalEntry(id)
    return entry ? this.withVersion(entry) : null
  }

  async create(input: DemoJournalEntryInput): Promise<JournalItem> {
    const created = addDemoJournalEntry(input)
    this.versions.set(created.id, 1)
    return this.withVersion(created)
  }

  async update(
    id: string,
    input: DemoJournalEntryInput,
    _currentVersion: number,
  ): Promise<JournalItem> {
    try {
      const updated = updateDemoJournalEntry(id, input)
      this.bumpVersion(id)
      return this.withVersion(updated)
    } catch (error) {
      throw demoError(error)
    }
  }

  async remove(id: string, _currentVersion: number): Promise<void> {
    if (!removeDemoJournalEntry(id)) {
      throw new JournalGatewayError('NOT_FOUND', '这条记录已经不存在')
    }
    this.versions.delete(id)
  }

  private withVersion(entry: DemoJournalEntry): JournalItem {
    return {
      ...entry,
      version: this.versions.get(entry.id) ?? 1,
      createdBy: '',
    }
  }

  private bumpVersion(id: string): void {
    this.versions.set(id, (this.versions.get(id) ?? 1) + 1)
  }
}

function demoError(error: unknown): JournalGatewayError {
  if (error instanceof JournalGatewayError) return error
  return new JournalGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '记录操作没有完成',
  )
}
