import {
  dismissAuthGate,
  hideAuthGate,
  subscribeAuthGate,
} from '../../services/auth-preview'

interface AuthGateSnapshot {
  visible: boolean
  force: boolean
}

Component({
  data: {
    visible: false,
    force: false,
  } as AuthGateSnapshot,

  lifetimes: {
    attached() {
      const component = this as unknown as {
        unsubscribeAuthGate?: () => void
        setData: (data: Partial<AuthGateSnapshot>) => void
      }
      component.unsubscribeAuthGate?.()
      component.unsubscribeAuthGate = subscribeAuthGate((snapshot) => {
        component.setData(snapshot)
      })
    },
    detached() {
      const component = this as unknown as {
        unsubscribeAuthGate?: () => void
      }
      component.unsubscribeAuthGate?.()
      component.unsubscribeAuthGate = undefined
    },
  },

  methods: {
    noop() {},

    goLogin() {
      hideAuthGate()
      wx.navigateTo({ url: '/pages/auth/index?mode=login' })
    },

    dismiss() {
      dismissAuthGate()
    },
  },
})
