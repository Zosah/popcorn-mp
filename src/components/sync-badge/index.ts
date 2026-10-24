/**
 * 数据来源标识。
 * 目前除库存链路外，其余模块的数据都只存在当前设备，必须在界面上说清楚，
 * 避免用户以为宠物、菜单、记录已经跨设备同步。
 */
Component({
  properties: {
    state: {
      type: String,
      value: 'local',
    },
    text: {
      type: String,
      value: '',
    },
  },
})
