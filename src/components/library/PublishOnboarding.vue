<template>
  <form @submit.prevent="submit">
    <transition
      name="dialog"
      size="medium"
      :duration="500"
      @after-leave="onHide"
    >
      <Dialog
        v-if="dialogOpened"
        class="publish-onboarding"
        @clickOutside="hide"
        size="large"
        borderless
      >
        <template v-slot:header>
          <div class="dialog__title">How it works ?</div>
        </template>

        <ul
          class="publish-onboarding__pictos"
          @mouseover="stopTimer"
          @mouseleave="startTimer"
        >
          <li
            v-for="(step, index) in STEPS"
            class="publish-onboarding-picto"
            :key="index"
            :class="[stepIndex === index && 'publish-onboarding-picto--active']"
            @mouseover="stepIndex = index"
            @touchstart="stepIndex = index"
          >
            <div class="publish-onboarding-picto__image">
              <img :src="STEPS[index].picto" :alt="step.title" />
            </div>
          </li>
        </ul>

        <div class="publish-onboarding__background">
          <TransitionHeight
            class="publish-onboarding__wrapper"
            stepper
            :name="`slide-fade-${isBack ? 'left' : 'right'}`"
            :duration="500"
          >
            <div
              :key="`step-content-${stepIndex}`"
              class="publish-onboarding-step"
            >
              <h2>{{ stepIndex + 1 }}. {{ STEPS[stepIndex].title }}</h2>
              <p v-html="STEPS[stepIndex].content" />
            </div>
          </TransitionHeight>

          <div class="publish-onboarding__footer">
            <label class="checkbox-control">
              <input
                type="checkbox"
                class="form-control"
                v-model="dismissOnSubmit"
              />
              <div class="mr8"></div>
              <span>Never see again</span>
            </label>
            <Btn type="submit" class="btn -green ml8 -large">
              <span class="mr8">Next</span>
              <i class="icon-down -small"></i>
            </Btn>
          </div>
        </div>
      </Dialog>
    </transition>
  </form>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import TransitionHeight from '@/components/framework/TransitionHeight.vue'
import Btn from '@/components/framework/Btn.vue'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'
import Picto1 from './publish-1.png'
import Picto2 from './publish-2.png'
import Picto3 from './publish-3.png'
import notificationService from '@/services/notificationService'

const STEPS = [
  {
    picto: Picto1,
    title: `Share script`,
    content: `Kickstart your journey by sharing your unique indicators with
              the community. It's as simple as clicking the
              <code class="-filled">Publish</code> button below.`
  },
  {
    picto: Picto2,
    title: `Wait for review`,
    content: `Your indicator enters a swift and secure
              validation phase. Each GitHub pull request is reviewed to ensure <code class="-filled">quality</code> and
              <code class="-filled">security</code> standards are met.
              This step is crucial for maintaining the integrity of our
              platform.`
  },
  {
    picto: Picto3,
    title: `It's live !`,
    content: `After a successful review, your indicator is now live and
              accessible to all within the
              <code class="-filled">Community&nbsp;scripts</code> library.`
  }
]

const emit = defineEmits<{
  close: [value: unknown]
}>()

const { output, close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const dialogOpened = ref(false)
const stepIndex = ref(0)
const isBack = ref(false)
const dismissOnSubmit = ref(false)
let timerTimeout: ReturnType<typeof setTimeout> | null = null

watch(stepIndex, (currentStep, previousStep) => {
  isBack.value = currentStep < previousStep
})

onMounted(() => {
  show()
  startTimer()
})

onBeforeUnmount(() => {
  stopTimer()
})

function show() {
  dialogOpened.value = true
}

function hide() {
  dialogOpened.value = false
}

function onHide() {
  close()
}

function submit() {
  if (dismissOnSubmit.value) {
    notificationService.dismiss('publish-onboarding')
  }

  output.value = true
  hide()
}

function startTimer() {
  if (timerTimeout) {
    return
  }

  timerTimeout = setTimeout(() => {
    timerTimeout = null
    stepIndex.value = (stepIndex.value + 1) % STEPS.length
    startTimer()
  }, 5000)
}

function stopTimer() {
  if (!timerTimeout) {
    return
  }

  clearTimeout(timerTimeout)
  timerTimeout = null
}

defineExpose({ output, close })
</script>
<style lang="scss" scoped>
.publish-onboarding {
  &__pictos {
    display: flex;
    gap: 10%;
    justify-content: space-evenly;
    padding: 10% 10% 10%;
    margin: -1rem -1rem 0 -1rem;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
  }

  &-picto {
    $item: &;
    counter-increment: count;
    flex-grow: 1;
    width: 1rem;
    list-style: none;
    position: relative;
    --outline-color: var(--theme-background-50);

    &__image {
      background-color: var(--theme-background-base);
      border: 1px solid var(--outline-color);
      border-radius: 0.5rem;
      width: 100%;
      overflow: hidden;
      position: relative;
      transition: transform 0.5s $ease-elastic;

      &:before {
        content: '';
        padding-top: 100%;
        display: block;
      }

      img {
        position: absolute;
        right: 0;
        bottom: 0;
        transition: opacity 0.2s $ease-out-expo;
        opacity: 0.5;

        #{$item}:nth-child(1) & {
          width: 200%;
          left: -50%;
          top: -20%;
        }

        #{$item}:nth-child(2) & {
          width: 150%;
          left: -40%;
          top: -40%;
        }

        #{$item}:nth-child(3) & {
          width: 200%;
          left: -50%;
          top: -50%;
        }
      }
    }

    &::before {
      content: counter(count, decimal);
      position: absolute;
      z-index: 1;
      top: 0.5rem;
      right: -0.4rem;
      font-size: 2rem;
      font-weight: 600;
      text-shadow:
        2px 2px var(--outline-color),
        -1px -1px var(--outline-color),
        1px -1px var(--outline-color),
        -1px 2px var(--outline-color);
      transition: transform 0.2s $ease-out-expo;
    }

    &--active {
      #{$item}__image {
        transform: translateY(5%) scale(1.125);

        img {
          opacity: 1;
        }
      }

      &::before {
        color: var(--theme-buy-200);
        transform: translateY(-5%);
      }
    }

    &--done {
      --outline-color: var(--theme-buy-base);
    }
  }

  &__wrapper {
    position: relative;
  }

  &__background {
    padding-block: 3rem;
    margin-inline: -1rem;
    background-color: var(--theme-base-o25);
    margin: -5rem -1rem -1rem;
    padding: 4rem 0 0;
  }

  &-step {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    h2,
    p {
      margin: 0 10%;
    }
  }

  &__footer {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 1rem;
    margin-top: 1rem;

    .icon-down {
      transform: rotateZ(-90deg);
    }
  }
}
</style>
