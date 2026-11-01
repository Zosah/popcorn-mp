import type {
  ApiMediaAsset,
  ApiMediaPurpose,
  ApiSignedObject,
} from '../types/api'

export interface MediaGateway {
  upload(
    filePath: string,
    purpose: ApiMediaPurpose,
    fileSize?: number,
  ): Promise<ApiMediaAsset>
  get(mediaId: string): Promise<ApiMediaAsset>
}

export class MediaGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MediaGatewayError'
  }
}

export function signedObjectFor(
  asset: ApiMediaAsset,
  variant: 'display' | 'thumb',
): ApiSignedObject {
  return variant === 'thumb' ? asset.thumb : asset.display
}

export function getMediaErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof MediaGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'FILE_TOO_LARGE':
      return '图片不能超过 10 MiB'
    case 'UNSUPPORTED_MEDIA_TYPE':
      return '只支持 JPEG、PNG 或 WebP 图片'
    case 'INVALID_IMAGE':
      return '这张图片无法读取，请换一张试试'
    case 'NETWORK_ERROR':
      return mediaNetworkErrorMessage(error.message)
    case 'MEDIA_STORAGE_UNAVAILABLE':
    case 'SERVICE_UNAVAILABLE':
      return '图片服务暂时不可用'
    case 'MEDIA_NOT_FOUND':
      return '图片不存在或已失效，请重新上传'
    default:
      return error.message || fallback
  }
}

function mediaNetworkErrorMessage(message: string): string {
  const detail = compactDiagnostic(message)
  if (/url not in domain list|合法域名|domain list/i.test(message)) {
    return withDiagnostic('图片上传域名未放行，请重新打开小程序或检查后台配置', detail)
  }
  if (/file not found|no such file|文件不存在|temp.*file/i.test(message)) {
    return withDiagnostic('图片临时文件已失效，请重新选择', detail)
  }
  if (/timeout|timed out|超时/i.test(message)) {
    return withDiagnostic('图片上传超时，请检查网络后重试', detail)
  }
  if (/ssl|tls|certificate|证书|handshake/i.test(message)) {
    return withDiagnostic('图片上传安全连接失败，请稍后重试', detail)
  }
  return withDiagnostic('图片上传没有完成，请检查网络后重试', detail)
}

function compactDiagnostic(message: string): string {
  const value = message.replace(/^uploadFile:fail\s*/i, '').trim()
  return value.length > 80 ? `${value.slice(0, 80)}…` : value
}

function withDiagnostic(message: string, detail: string): string {
  return detail ? `${message}（${detail}）` : message
}
