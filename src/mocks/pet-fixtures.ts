import { addCalendarDays, getShanghaiDateOnly } from '../domain/expiry'
import type { DemoPetState } from '../domain/demo-pet'

export function createDemoPetState(nowMs = Date.now()): DemoPetState {
  const today = getShanghaiDateOnly(nowMs)
  const createdAt = new Date(nowMs).toISOString()
  const todayStartMs = Date.parse(`${today}T00:00:00+08:00`)

  return {
    profile: {
      id: 'pet-nuomi',
      name: '糯米',
      species: 'cat',
      breed: '英国短毛猫',
      sex: 'female',
      birthday: '2023-04-18',
      homeOn: '2023-07-02',
      neuteredOn: '2024-01-12',
      status: '精神不错',
    },
    events: [
      { id: 'event-outing', type: 'outing', occurredOn: addCalendarDays(today, -7), title: '去了露台晒太阳', note: '全程使用牵引绳', createdAt },
      { id: 'event-grooming', type: 'grooming', occurredOn: addCalendarDays(today, -15), title: '洗护和剪指甲', note: '这次很配合', createdAt },
      { id: 'event-external', type: 'external-deworm', occurredOn: addCalendarDays(today, -24), title: '完成体外驱虫', note: '大宠爱', createdAt },
      { id: 'event-internal', type: 'internal-deworm', occurredOn: addCalendarDays(today, -80), title: '完成体内驱虫', note: '随餐服用', createdAt },
      { id: 'event-visit', type: 'visit', occurredOn: addCalendarDays(today, -100), title: '眼睛复诊', note: '恢复良好，遵医嘱停药', createdAt },
      { id: 'event-illness', type: 'illness', occurredOn: addCalendarDays(today, -108), title: '左眼有些流泪', note: '已预约就诊', createdAt },
      { id: 'event-vaccine', type: 'vaccine', occurredOn: addCalendarDays(today, -300), title: '完成年度疫苗', note: '猫三联，加强针', createdAt },
      { id: 'event-neuter', type: 'neuter', occurredOn: '2024-01-12', title: '完成绝育', note: '恢复顺利', createdAt },
    ],
    supplies: [
      { id: 'supply-kibble-current', category: 'kibble', name: '鲜肉烘焙猫粮', status: 'current', note: '鸡肉味，日常主粮', recordedOn: addCalendarDays(today, -20) },
      { id: 'supply-can-loved', category: 'can', name: '鸡胸肉主食罐', status: 'loved', note: '每次都光盘', recordedOn: addCalendarDays(today, -12) },
      { id: 'supply-freeze-wishlist', category: 'freeze-dried', name: '鹌鹑冻干', status: 'wishlist', note: '朋友推荐，准备试试', recordedOn: addCalendarDays(today, -4) },
      { id: 'supply-soup-tried', category: 'soup', name: '金枪鱼汤包', status: 'tried', note: '喝汤，肉块剩了一点', recordedOn: addCalendarDays(today, -8) },
      { id: 'supply-litter-current', category: 'litter', name: '豆腐混合猫砂', status: 'current', note: '豆腐砂 70% + 膨润土 30%', recordedOn: addCalendarDays(today, -16) },
      { id: 'supply-litter-dropped', category: 'litter', name: '纯膨润土猫砂', status: 'dropped', note: '扬尘太大，已经拔草', recordedOn: addCalendarDays(today, -45) },
    ],
    weights: [
      { id: 'weight-1', value: '3.6', recordedOn: addCalendarDays(today, -150) },
      { id: 'weight-2', value: '3.7', recordedOn: addCalendarDays(today, -90) },
      { id: 'weight-3', value: '3.8', recordedOn: addCalendarDays(today, -30) },
    ],
    dailyLogs: [
      { id: 'daily-meal', type: 'meal', summary: '早餐吃了 42g 主粮', note: '食欲很好', recordedAt: new Date(todayStartMs + 8 * 60 * 60 * 1000).toISOString() },
      { id: 'daily-water', type: 'water', summary: '主动喝水一次', note: '', recordedAt: new Date(todayStartMs + 9.5 * 60 * 60 * 1000).toISOString() },
      { id: 'daily-urine', type: 'urine', summary: '尿团大小正常', note: '', recordedAt: new Date(todayStartMs + 7 * 60 * 60 * 1000).toISOString() },
    ],
  }
}

export function createSecondDemoPetState(nowMs = Date.now()): DemoPetState {
  const state = createDemoPetState(nowMs)
  const today = getShanghaiDateOnly(nowMs)
  return {
    profile: {
      id: 'pet-zhima',
      name: '芝麻',
      species: 'dog',
      breed: '柯基犬',
      sex: 'male',
      birthday: '2024-02-09',
      homeOn: '2024-05-18',
      neuteredOn: null,
      status: '今天很活泼',
    },
    events: [
      { id: 'zhima-outing', type: 'outing', occurredOn: addCalendarDays(today, -2), title: '公园散步', note: '走了四十分钟', createdAt: new Date(nowMs).toISOString() },
      { id: 'zhima-vaccine', type: 'vaccine', occurredOn: addCalendarDays(today, -120), title: '完成年度疫苗', note: '犬四联', createdAt: new Date(nowMs).toISOString() },
      { id: 'zhima-external', type: 'external-deworm', occurredOn: addCalendarDays(today, -20), title: '完成体外驱虫', note: '', createdAt: new Date(nowMs).toISOString() },
      { id: 'zhima-internal', type: 'internal-deworm', occurredOn: addCalendarDays(today, -70), title: '完成体内驱虫', note: '', createdAt: new Date(nowMs).toISOString() },
    ],
    supplies: state.supplies.filter((item) => item.category !== 'litter').map((item) => ({ ...item, id: `zhima-${item.id}` })),
    weights: [{ id: 'zhima-weight', value: '11.2', recordedOn: addCalendarDays(today, -12) }],
    dailyLogs: [],
  }
}
