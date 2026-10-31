import { describe, expect, it } from 'vitest'

import {
  buildPetCareCards,
  buildPetCalendar,
  buildPetDailySummary,
  buildPetHomeActivities,
  buildPetTimeline,
  filterPetSupplies,
  formatPetAge,
  formatPetWeight,
  getDefaultPetCareInterval,
  getCurrentPetSupplies,
  getPetSupplyStatusLabel,
  shiftPetCalendarMonth,
} from '../../src/domain/demo-pet'
import { createDemoPetState } from '../../src/mocks/pet-fixtures'

describe('宠物档案领域逻辑', () => {
  it('按完整月份展示年龄', () => {
    expect(formatPetAge('2023-04-18', '2026-08-27')).toBe('3 岁 4 个月')
    expect(formatPetAge('2026-01-30', '2026-08-27')).toBe('6 个月')
    expect(formatPetAge('2023-08-27', '2026-08-27')).toBe('3 岁')
  })

  it('去掉体重接口固定精度带来的多余尾零', () => {
    expect(formatPetWeight('4.100')).toBe('4.1')
    expect(formatPetWeight('4.000')).toBe('4')
    expect(formatPetWeight('—')).toBe('—')
  })

  it('把出生、到家与持续事件合并为倒序时间线', () => {
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    const timeline = buildPetTimeline(state)

    expect(timeline.some((item) => item.type === 'birthday')).toBe(true)
    expect(timeline.some((item) => item.type === 'home')).toBe(true)
    expect(timeline.some((item) => item.type === 'visit')).toBe(true)
    const first = timeline[0]
    const second = timeline[1]
    if (!first || !second) throw new Error('宠物时间线示例不足')
    expect(first.occurredOn >= second.occurredOn).toBe(true)
  })
})

describe('首页宠物动态', () => {
  it('把今日照护、最近体重和照护事件整理成倒序动态', () => {
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    const activities = buildPetHomeActivities(state, '2026-08-27', 3)

    expect(activities.map((item) => item.typeLabel)).toEqual([
      '日常',
      '外出',
      '体重',
    ])
    expect(activities[0]?.title).toBe('今天的照护已记录')
    expect(activities[2]?.copy).toContain('3.8 kg')
  })

  it('没有照护数据时返回空动态', () => {
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    state.events = []
    state.weights = []
    state.dailyLogs = []

    expect(buildPetHomeActivities(state, '2026-08-27')).toEqual([])
  })
})

describe('周期照护', () => {
  it('覆盖疫苗、洗护和内外驱，并按最近一次记录计算下次日期', () => {
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    const cards = buildPetCareCards(state.events, '2026-08-27')

    expect(cards.map((item) => item.type)).toEqual([
      'vaccine',
      'grooming',
      'internal-deworm',
      'external-deworm',
    ])
    expect(cards.find((item) => item.type === 'internal-deworm')).toMatchObject({
      type: 'internal-deworm',
      nextOn: '2026-09-06',
      status: 'normal',
    })
    expect(cards.find((item) => item.type === 'external-deworm')).toMatchObject({
      type: 'external-deworm',
      nextOn: '2026-09-02',
      status: 'due-soon',
      statusLabel: '6 天后',
    })
  })

  it('没有记录和已经超期时显示明确状态', () => {
    expect(
      buildPetCareCards([], '2026-08-27').every(
        (item) => item.status === 'unrecorded',
      ),
    ).toBe(true)
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    expect(
      buildPetCareCards(state.events, '2026-10-01').find(
        (item) => item.type === 'internal-deworm',
      )?.status,
    ).toBe('overdue')
  })

  it('为四类周期照护提供默认天数', () => {
    expect(getDefaultPetCareInterval('vaccine')).toBe(365)
    expect(getDefaultPetCareInterval('grooming')).toBe(30)
    expect(getDefaultPetCareInterval('internal-deworm')).toBe(90)
    expect(getDefaultPetCareInterval('external-deworm')).toBe(30)
  })
})

describe('吃喝拉撒用品集合', () => {
  const state = createDemoPetState(Date.UTC(2026, 7, 27))

  it('支持按粮、罐头、冻干、汤包和猫砂分类筛选', () => {
    expect(filterPetSupplies(state.supplies, 'litter')).toHaveLength(2)
    expect(
      filterPetSupplies(state.supplies, 'can').every(
        (item) => item.category === 'can',
      ),
    ).toBe(true)
  })

  it('正在使用的用品优先，并可生成当前配置', () => {
    expect(filterPetSupplies(state.supplies, 'all')[0]?.status).toBe('current')
    expect(getCurrentPetSupplies(state.supplies).map((item) => item.category)).toEqual([
      'kibble',
      'litter',
    ])
  })

  it('筛选结果不会暴露原对象引用', () => {
    expect(filterPetSupplies(state.supplies, 'all')[0]).not.toBe(state.supplies[0])
  })

  it('猫砂使用适合用品的状态文案', () => {
    expect(getPetSupplyStatusLabel('litter', 'loved')).toBe('好用')
    expect(getPetSupplyStatusLabel('litter', 'tried')).toBe('用过')
    expect(getPetSupplyStatusLabel('can', 'loved')).toBe('爱吃')
  })
})

describe('每日吃喝拉撒记录', () => {
  it('按上海自然日汇总次数、最近内容和时间', () => {
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    const summary = buildPetDailySummary(state.dailyLogs, '2026-08-27')

    expect(summary.find((item) => item.type === 'meal')).toMatchObject({
      count: 1,
      done: true,
      latestSummary: '早餐吃了 42g 主粮',
      latestTime: '08:00',
    })
    expect(summary.find((item) => item.type === 'stool')).toMatchObject({
      count: 0,
      done: false,
      latestSummary: '今天还没记录',
    })
  })

  it('不把前一天的记录计入今天', () => {
    const summary = buildPetDailySummary(
      [
        {
          id: 'yesterday-meal',
          type: 'meal',
          summary: '昨晚吃饭',
          note: '',
          recordedAt: '2026-08-26T12:00:00.000Z',
        },
      ],
      '2026-08-27',
    )

    expect(summary.find((item) => item.type === 'meal')?.count).toBe(0)
  })
})

describe('宠物日历', () => {
  it('支持跨年切换月份', () => {
    expect(shiftPetCalendarMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftPetCalendarMonth('2026-12', 1)).toBe('2027-01')
  })

  it('生成六周日期网格并统计当天事件', () => {
    const state = createDemoPetState(Date.UTC(2026, 7, 27))
    state.events = [
      {
        id: 'calendar-event',
        type: 'visit',
        occurredOn: '2026-09-02',
        title: '复诊',
        note: '查看恢复情况',
        createdAt: '2026-08-27T00:00:00.000Z',
      },
    ]

    const cells = buildPetCalendar(state.events, '2026-09', '2026-09-02')

    expect(cells).toHaveLength(42)
    expect(cells[0]?.date).toBe('2026-08-30')
    expect(cells.find((item) => item.date === '2026-09-02')).toMatchObject({
      inCurrentMonth: true,
      isToday: true,
      eventCount: 1,
    })
  })
})
