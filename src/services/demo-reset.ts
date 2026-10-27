import { resetDemoInventory } from './demo-inventory'
import { resetDemoInviteData } from './demo-invite'
import { resetDemoJournalData } from './demo-journal'
import { resetDemoMenuData } from './demo-menu'
import { resetDemoPetData } from './demo-pet'
import { resetDemoReminderSettings } from './demo-reminders'
import { resetDemoSpaceName } from './demo-space'
import { resetDemoTodoData } from './demo-todo'
import { refreshInventoryGateway } from './inventory'

export function resetAllDemoData(): void {
  resetDemoInventory()
  refreshInventoryGateway()
  resetDemoPetData()
  resetDemoJournalData()
  resetDemoMenuData()
  resetDemoReminderSettings()
  resetDemoSpaceName()
  resetDemoInviteData()
  resetDemoTodoData()
}
