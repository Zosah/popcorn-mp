import type {
  DemoJournalEntry,
  DemoJournalEntryInput,
  DemoJournalKind,
} from '../domain/demo-journal'
import {
  createDemoJournalEntry,
  createDemoJournalMomentSeedEntries,
  createDemoJournalNoteSeedEntries,
  normalizeDemoJournalEntry,
  updateDemoJournalEntry as applyDemoJournalUpdate,
} from '../domain/demo-journal'

const STORAGE_KEY = 'popcorn_demo_journal_v1'
const SEEDED_KEY = 'popcorn_demo_journal_seeded_v1'
const NOTES_SEEDED_KEY = 'popcorn_demo_journal_notes_seeded_v1'

export const DEMO_JOURNAL_STORAGE_KEYS = [
  STORAGE_KEY,
  SEEDED_KEY,
  NOTES_SEEDED_KEY,
] as const

function readStoredEntries(): DemoJournalEntry[] {
  const entries = wx.getStorageSync<DemoJournalEntry[] | ''>(STORAGE_KEY)
  if (!Array.isArray(entries)) return []

  return entries
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => normalizeDemoJournalEntry(entry))
}

function writeStoredEntries(entries: DemoJournalEntry[]): void {
  wx.setStorageSync(STORAGE_KEY, entries)
}

function ensureSeedEntries(): void {
  const seeded = wx.getStorageSync<boolean | ''>(SEEDED_KEY)
  if (seeded !== true) {
    const existing = readStoredEntries()
    if (existing.length > 0) {
      wx.setStorageSync(SEEDED_KEY, true)
    } else {
      wx.setStorageSync(STORAGE_KEY, createDemoJournalMomentSeedEntries())
      wx.setStorageSync(SEEDED_KEY, true)
    }
  }

  const notesSeeded = wx.getStorageSync<boolean | ''>(NOTES_SEEDED_KEY)
  if (notesSeeded === true) return

  const existing = readStoredEntries()
  if (!existing.some((entry) => entry.kind === 'note')) {
    wx.setStorageSync(STORAGE_KEY, [
      ...existing,
      ...createDemoJournalNoteSeedEntries(),
    ])
  }
  wx.setStorageSync(NOTES_SEEDED_KEY, true)
}

export function listDemoJournalEntries(
  kind?: DemoJournalKind,
): DemoJournalEntry[] {
  ensureSeedEntries()
  const entries = readStoredEntries()
  if (!kind) return entries
  return entries.filter((entry) => entry.kind === kind)
}

export function listDemoImportantNotes(): DemoJournalEntry[] {
  return listDemoJournalEntries('note')
}

export function listDemoJournalMoments(): DemoJournalEntry[] {
  return listDemoJournalEntries('moment')
}

export function resetDemoJournalData(): void {
  for (const key of DEMO_JOURNAL_STORAGE_KEYS) {
    wx.removeStorageSync(key)
  }
  ensureSeedEntries()
}

export function getDemoJournalEntry(id: string): DemoJournalEntry | undefined {
  ensureSeedEntries()
  return readStoredEntries().find((entry) => entry.id === id)
}

export function addDemoJournalEntry(
  input: DemoJournalEntryInput,
): DemoJournalEntry {
  ensureSeedEntries()
  const entry = createDemoJournalEntry(input)
  writeStoredEntries([entry, ...readStoredEntries()])
  return entry
}

export function updateDemoJournalEntry(
  id: string,
  input: DemoJournalEntryInput,
): DemoJournalEntry {
  ensureSeedEntries()
  const entries = readStoredEntries()
  const index = entries.findIndex((entry) => entry.id === id)
  const current = entries[index]
  if (!current) throw new Error('这条记录不存在')

  const updated = applyDemoJournalUpdate(current, input)
  const nextEntries = entries.slice()
  nextEntries[index] = updated
  writeStoredEntries(nextEntries)
  return updated
}

export function removeDemoJournalEntry(id: string): boolean {
  ensureSeedEntries()
  const entries = readStoredEntries()
  const nextEntries = entries.filter((entry) => entry.id !== id)
  if (nextEntries.length === entries.length) return false

  writeStoredEntries(nextEntries)
  return true
}
