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
      return '图片上传没有完成，请检查网络后重试'
    case 'MEDIA_STORAGE_UNAVAILABLE':
    case 'SERVICE_UNAVAILABLE':
      return '图片服务暂时不可用'
    case 'MEDIA_NOT_FOUND':
      return '图片不存在或已失效，请重新上传'
    default:
      return error.message || fallback
  }
}
