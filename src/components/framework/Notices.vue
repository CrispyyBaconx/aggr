<template>
  <transition-height
    :name="transitionGroupName"
    tag="div"
    class="notices"
    width-auto
  >
    <div
      v-for="notice in notices"
      :key="notice.id"
      class="notice"
      :class="'-' + notice.type"
    >
      <div class="notice__wrapper" @click="onClick(notice)">
        <i v-if="notice.icon" class="notice__icon" :class="notice.icon"></i>
        <div
          v-if="!notice.html"
          v-text="notice.title"
          class="notice__title"
        ></div>
        <div v-else v-html="notice.title" class="notice__title"></div>
      </div>
    </div>
  </transition-height>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { Notice } from '@/store/app'
import TransitionHeight from './TransitionHeight.vue'

const store = useStore()

const notices = computed<Notice[]>(() => {
  return store.state.app.notices
})

const disableAnimations = computed(() => {
  return store.state.settings.disableAnimations
})

const transitionGroupName = computed(() => {
  if (!disableAnimations.value) {
    return 'slide-notice'
  } else {
    return null
  }
})

function onClick(notice: Notice) {
  if (typeof notice.action === 'function') {
    const result = notice.action()

    if (result === false) {
      return
    }
  }

  store.dispatch('app/hideNotice', notice.id)
}
</script>
