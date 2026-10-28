import { appConfig } from '../config/env'
import { DemoJournalGateway } from './demo-journal-gateway'
import { HttpJournalGateway } from './http-journal'
import type { JournalGateway } from './journal-gateway'

function createJournalGateway(): JournalGateway {
  return appConfig.demoMode
    ? new DemoJournalGateway()
    : new HttpJournalGateway()
}

export let journalGateway = createJournalGateway()

export function refreshJournalGateway(): void {
  journalGateway = createJournalGateway()
}
