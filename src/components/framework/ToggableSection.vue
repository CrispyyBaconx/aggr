<template>
  <section
    class="toggable-section"
    :class="[
      small && 'toggable-section--small',
      outline && 'toggable-section--outline',
      inset && 'toggable-section--inset',
      disabled && 'toggable-section--disabled',
      value && 'toggable-section--expanded'
    ]"
  >
    <div class="toggable-section__wrapper">
      <div class="toggable-section__header" @click="toggle">
        <slot name="title">
          <div class="toggable-section__title">
            {{ title }}
            <span v-if="!value && badge" class="badge -outline ml8">{{
              badge
            }}</span>
          </div>
        </slot>
        <small v-if="description">
          {{ description }}
        </small>
        <div
          v-if="$slots.control"
          class="toggable-section__control"
          @click.stop
        >
          <slot name="control" />
        </div>
        <i class="icon-up-thin"></i>
      </div>
      <div
        class="toggable-section__content-wrapper"
        :class="[value && 'toggable-section__content-wrapper--open']"
      >
        <div class="toggable-section__content">
          <div class="toggable-section__spacer" />
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { randomString } from '../../utils/helpers'

export default {
  name: 'ToggableSection',
  emits: ['update:model'],
  props: {
    model: {
      required: false,
      default: () => []
    },
    id: {
      required: false,
      default: null
    },
    disabled: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: null
    },
    description: {
      type: String,
      default: null
    },
    inset: {
      type: Boolean,
      default: false
    },
    small: {
      type: Boolean,
      default: false
    },
    outline: {
      type: Boolean,
      default: false
    },
    badge: {
      default: null
    },
    autoClose: {
      type: Boolean,
      default: false
    },
    autoOpen: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    sections() {
      if (this.id) {
        return this.$store.state.settings.sections
      }

      return this.model
    },
    value() {
      return this.sections.indexOf(this.sectionId) !== -1
    }
  },
  created() {
    if (!this.id) {
      this.sectionId = randomString(8)
    } else {
      this.sectionId = this.id
    }

    if (this.autoOpen && !this.value) {
      this.toggle()
    }
  },
  methods: {
    toggle(event?: MouseEvent) {
      if (event) {
        event.stopPropagation()
      }

      if (this.id) {
        this.$store.commit('settings/TOGGLE_SECTION', this.sectionId)
        return
      }

      let index = this.model.indexOf(this.sectionId)
      let newModel = [...this.model]

      if (this.autoClose && newModel.length) {
        newModel = []

        if (index !== -1) {
          this.$emit('update:model', newModel)
          return
        }

        index = -1
      }

      if (index === -1) {
        newModel.push(this.sectionId)
      } else {
        newModel.splice(index, 1)
      }

      this.$emit('update:model', newModel)
    }
  }
}
</script>

<style lang="scss" scoped>
.toggable-section {
  padding: 1rem;

  &--inset {
    margin: -1rem;

    + .toggable-section {
      margin-top: 1rem;
    }
  }

  &--disabled {
    opacity: 0.5;
    pointer-events: none;
    cursor: default;
  }

  &--outline {
    border: 1px solid var(--theme-color-o20);
    border-radius: 0.5rem;

    &:not(:last-child) {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    + .toggable-section {
      border-top: 0;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
  }

  &--small {
    padding: 0;

    .toggable-section__header {
      margin: 0;
      padding: 0.5rem;
    }

    .toggable-section__spacer {
      margin: 0;
    }
  }

  &__wrapper {
    position: relative;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    margin: -1rem;
    padding: 1rem;
    color: var(--theme-color-100);
    position: relative;
    cursor: pointer;

    small {
      visibility: hidden;
      margin-left: auto;
      font-size: 12px;
      line-height: 1;
      text-align: right;
      padding-left: 1rem;
      color: var(--theme-color-200);

      + .icon-up-thin {
        margin-left: 1rem;
      }
    }

    .icon-up-thin {
      margin-left: 0.5rem;
      transition: transform 0.2s $ease-elastic;
      transform: rotateZ(180deg);
    }
  }

  &--expanded {
    .toggable-section__header {
      color: var(--theme-color-base);

      .icon-up-thin {
        transform: rotateZ(0deg);
      }
    }
  }

  &__spacer {
    margin-top: 0.5rem;
  }

  &__content-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &--open {
      grid-template-rows: 1fr;
    }
  }

  &__content {
    position: relative;
    overflow: hidden;
    min-height: 0;
  }

  &__control {
    position: absolute;
    right: 0.75rem;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    width: 0;
  }

  &__title {
    position: relative;
    display: flex;
    align-items: center;

    .badge {
      margin-left: 0.5rem;
      font-size: 0.75rem;
    }
  }

  &:hover {
    background-color: var(--theme-background-150);

    .toggable-section__header {
      opacity: 1;

      small {
        visibility: visible;
      }
    }
  }
}
</style>
