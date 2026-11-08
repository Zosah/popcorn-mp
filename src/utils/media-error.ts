import {
  MediaGatewayError,
  getMediaErrorMessage,
} from '../services/media-gateway'

/** 从任意错误里挖出可读细节，方便定位「图片没准备好」到底是哪一步失败。 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  const record = error as { errMsg?: string; message?: string } | null
  return record?.errMsg || record?.message || ''
}

/** 上传网络错误用弹窗展示完整微信诊断信息，避免 Toast 截断关键错误。 */
export function showMediaUploadError(error: unknown, fallback: string): void {
  const message = getMediaErrorMessage(error, fallback)
  if (error instanceof MediaGatewayError && error.code === 'NETWORK_ERROR') {
    wx.showModal({
      title: '图片上传失败',
      content: message,
      showCancel: false,
      confirmText: '知道了',
    })
    return
  }
  const detail = message === fallback ? describeError(error) : ''
  const text = detail ? `${fallback}（${detail.slice(0, 40)}）` : message
  wx.showToast({ title: text.slice(0, 60), icon: 'none' })
}
