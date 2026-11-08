import { describe, expect, it } from 'vitest'

import { matchInventoryIcon, resolveInventoryIcon } from '../../src/services/inventory-icon'

describe('库存图标匹配', () => {
  it('按关键词匹配生活用品', () => {
    expect(matchInventoryIcon('海飞丝洗发水')).toBe('lotion-bottle')
    expect(matchInventoryIcon('维达抽纸')).toBe('page-facing-up')
    expect(matchInventoryIcon('蓝月亮洗衣液')).toBe('basket')
  })

  it('长关键词优先，抽纸不会被纸抢先命中', () => {
    expect(matchInventoryIcon('抽纸')).toBe('page-facing-up')
  })

  it('都没命中时按品类给默认图标', () => {
    expect(matchInventoryIcon('奇怪的家伙', 'drink')).toBe('cup-with-straw')
    expect(matchInventoryIcon('', 'medicine')).toBe('pill')
  })

  it('用户选择优先于自动匹配', () => {
    const picked = resolveInventoryIcon({ name: '洗发水', iconKey: 'soap' })
    expect(picked.iconKey).toBe('soap')
    expect(picked.iconUrl).toContain('/png128/soap.png')
  })

  it('未上传图片时也有兜底首字与色块', () => {
    const display = resolveInventoryIcon({ name: '纸巾' })
    expect(display.fallbackText).toBe('纸')
    expect(display.fallbackColor).toMatch(/^#/)
  })
})
