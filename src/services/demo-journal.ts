import type {
  DemoJournalEntry,
  DemoJournalEntryInput,
} from '../domain/demo-journal'
import { createDemoJournalEntry } from '../domain/demo-journal'

const STORAGE_KEY = 'popcorn_demo_journal_v1'

export function listDemoJournalEntries(): DemoJournalEntry[] {
  const entries = wx.getStorageSync<DemoJournalEntry[] | ''>(STORAGE_KEY)
  return Array.isArray(entries) ? entries : []
}

export function addDemoJournalEntry(
  input: DemoJournalEntryInput,
): DemoJournalEntry {
  const entry = createDemoJournalEntry(input)
  wx.setStorageSync(STORAGE_KEY, [entry, ...listDemoJournalEntries()])
  return entry
}
