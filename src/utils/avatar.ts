import { mediaGateway } from '../services/media'
import {
  signedObjectFor,
  type MediaGateway,
} from '../services/media-gateway'

type AvatarVariant = 'display' | 'thumb'

/**
 * 业务数据只保存 mediaId；展示时再换取短时签名地址。
 * 头像加载失败不能影响页面主流程，因此这里统一降级为空字符串，
 * 由页面回退到昵称首字或本地配色插画。
 */
export async function resolveAvatarUrl(
  mediaId: string | undefined,
  variant: AvatarVariant = 'thumb',
  gateway: Pick<MediaGateway, 'get'> = mediaGateway,
): Promise<string> {
  const id = mediaId?.trim()
  if (!id) return ''
  try {
    const asset = await gateway.get(id)
    return signedObjectFor(asset, variant).url || ''
  } catch {
    return ''
  }
}
