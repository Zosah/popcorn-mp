import { resetAuthPreviewSession } from './auth-preview'
import { refreshFeatureSettingsGateway } from './feature-settings'
import { refreshInventoryGateway } from './inventory'
import { refreshJournalGateway } from './journal'
import { refreshMediaGateway } from './media'
import { refreshMenuGateway } from './menu'
import { clearPageCache } from './page-cache'
import { refreshPetGateway } from './pet'
import { refreshReminderGateway } from './reminder'
import { refreshTodoGateway } from './todo'
import { refreshTravelGateway } from './travel'

/**
 * 清空当前设备上的全部小程序数据：登录态、Demo 数据、页面配置和缓存。
 * 不会删除服务端共同空间里的内容。
 */
export function clearAllLocalData(): void {
  clearPageCache()
  resetAuthPreviewSession()
  wx.clearStorageSync()
  refreshFeatureSettingsGateway()
  refreshInventoryGateway()
  refreshJournalGateway()
  refreshMediaGateway()
  refreshMenuGateway()
  refreshPetGateway()
  refreshReminderGateway()
  refreshTodoGateway()
  refreshTravelGateway()
}
