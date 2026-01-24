import { createApp, App, Component, ref, reactive, h } from 'vue'
import store from '@/store'

import ConfirmDialog from '@/components/framework/ConfirmDialog.vue'
import PromptDialog from '@/components/framework/PromptDialog.vue'

export interface DialogPosition {
  x?: number
  y?: number
  w?: number
  h?: number
}

interface MountedDialog {
  app: App
  el: HTMLElement
  close: () => void
  output?: any
}

class DialogService {
  mountedComponents: { [id: string]: MountedDialog } = {}
  dialogPositions: { [id: string]: DialogPosition } = {}
  isInteracting = false
  hasDialogOpened = false
  pickerInstance: any = null
  pickerApp: App | null = null

  createComponent(
    component: Component,
    props: any = {},
    resolve: ((value: any) => void) | null = null,
    dialogId?: string
  ): MountedDialog {
    const container = document.createElement('div')
    
    let output: any = undefined
    
    // Create a wrapper component that handles close
    const WrappedComponent = {
      setup() {
        return () => h(component, {
          ...props,
          dialogId,
          onClose: (result: any) => {
            output = result
            cleanup()
          },
          'onUpdate:output': (val: any) => {
            output = val
          }
        })
      }
    }

    const app = createApp(WrappedComponent)
    app.use(store)
    
    const instance = app.mount(container)

    const cleanup = () => {
      if (dialogId && this.mountedComponents[dialogId]) {
        delete this.mountedComponents[dialogId]
        this.hasDialogOpened = Object.keys(this.mountedComponents).length > 0
      }

      if (this.pickerInstance === result) {
        this.pickerInstance = null
        this.pickerApp = null
      }

      app.unmount()
      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }

      if (typeof resolve === 'function') {
        resolve(output)
      }
    }

    const result: MountedDialog = {
      app,
      el: container,
      close: cleanup,
      get output() { return output }
    }

    return result
  }

  async openAsPromise(component: Component, props = {}, dialogId?: string): Promise<any> {
    return new Promise(resolve => {
      const dialog = this.createComponent(component, props, resolve, dialogId)
      this.mountDialog(dialog, dialogId)
    })
  }

  open(component: Component, props = {}, dialogId?: string, onClose?: () => void): MountedDialog {
    const dialog = this.createComponent(component, props, onClose || null, dialogId)
    this.mountDialog(dialog, dialogId)
    return dialog
  }

  mountDialog(dialog: MountedDialog, dialogId?: string) {
    const container = document.getElementById('app') || document.body
    container.appendChild(dialog.el)

    if (dialogId) {
      if (this.mountedComponents[dialogId]) {
        this.mountedComponents[dialogId].close()
      }

      this.mountedComponents[dialogId] = dialog
      this.hasDialogOpened = Object.keys(this.mountedComponents).length > 0
    }
  }

  isDialogOpened(name: string) {
    return !!this.mountedComponents[name]
  }

  async openPicker(
    initialColor: string,
    label?: string,
    onInput?: (color: string) => void,
    onClose?: () => void
  ) {
    // For picker, we need a different approach since it needs to persist
    // and handle multiple calls
    if (this.pickerInstance) {
      // Update existing picker
      if (this.pickerInstance.setColorFromProp) {
        this.pickerInstance.setColorFromProp(initialColor)
      }
      if (typeof label !== 'undefined') {
        this.pickerInstance.label = label
      }
    } else {
      const component = (await import('@/components/framework/picker/ColorPickerDialog.vue')).default
      const dialog = this.open(
        component,
        {
          value: initialColor,
          label,
          onInput
        },
        undefined,
        onClose
      )
      this.pickerInstance = dialog
    }

    return this.pickerInstance
  }

  async openIndicator(paneId: string, indicatorId: string) {
    return this.open(
      (await import('@/components/indicators/IndicatorDialog.vue')).default,
      {
        paneId,
        indicatorId
      },
      'indicator'
    )
  }

  async confirm(options: any) {
    if (!options) {
      return
    }

    if (typeof options === 'string') {
      options = {
        message: options
      }
    }

    if (!options.message) {
      return
    }

    return this.openAsPromise(ConfirmDialog, options)
  }

  async prompt(options: any, dialogId = 'prompt') {
    if (!options) {
      return
    }

    if (typeof options === 'string') {
      options = {
        action: options
      }
    }

    if (!options.action) {
      return
    }

    return this.openAsPromise(PromptDialog, options, dialogId)
  }
}

export default new DialogService()
