import { describe, expect, it } from 'vitest'

import {
  MediaGatewayError,
  getMediaErrorMessage,
} from '../../src/services/media-gateway'

describe('图片错误文案', () => {
  it('明确指出上传域名未放行', () => {
    expect(getMediaErrorMessage(
      new MediaGatewayError(
        'NETWORK_ERROR',
        'uploadFile:fail url not in domain list',
      ),
      '图片上传没有完成',
    )).toContain('图片上传域名未放行')
    expect(getMediaErrorMessage(
      new MediaGatewayError(
        'NETWORK_ERROR',
        'uploadFile:fail url not in domain list',
      ),
      '图片上传没有完成',
    )).toContain('url not in domain list')
  })

  it('区分上传超时与普通网络失败', () => {
    expect(getMediaErrorMessage(
      new MediaGatewayError('NETWORK_ERROR', 'uploadFile:fail timeout'),
      '图片上传没有完成',
    )).toContain('图片上传超时')
  })

  it('区分 TLS 握手失败', () => {
    expect(getMediaErrorMessage(
      new MediaGatewayError('NETWORK_ERROR', 'uploadFile:fail ssl handshake error'),
      '图片上传没有完成',
    )).toContain('图片上传安全连接失败')
  })

  it('未知网络错误保留通用重试提示', () => {
    expect(getMediaErrorMessage(
      new MediaGatewayError('NETWORK_ERROR', 'uploadFile:fail'),
      '图片上传没有完成',
    )).toBe('图片上传没有完成，请检查网络后重试')
  })
})
