import {
  MediaGatewayError,
  getMediaErrorMessage,
} from '../services/media-gateway'

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
  wx.showToast({ title: message, icon: 'none' })
}
