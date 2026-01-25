<template>
  <transition name="draggable-market">
    <div class="draggable-market" :style="styles">
      <i :class="`icon-${market.exchange}`" class="draggable-market__icon"></i>
      {{ market.id }}
    </div>
  </transition>
</template>

<script>
export default {
  name: 'DraggableMarket',
  props: {
    market: {
      type: Object
    },
    target: {
      type: Object
    }
  },
  data() {
    return {
      currentTarget: this.target,
      position: {
        x: this.target.x,
        y: this.target.y
      }
    }
  },
  computed: {
    styles() {
      return {
        top: Math.round(this.position.y) + 'px',
        left: Math.round(this.position.x) + 'px'
      }
    }
  },
  watch: {
    target(value) {
      this.updateTarget(value)
    }
  },
  methods: {
    updateTarget(target) {
      this.currentTarget = target
      if (!this.animating) {
        this.animate(target)
      }
    },
    animate(target) {
      if (target) {
        this.animating = true
      }

      const offset = {
        x: this.currentTarget.x - this.position.x,
        y: this.currentTarget.y - this.position.y
      }

      const distance = Math.abs(offset.x) + Math.abs(offset.y)

      if (distance < 1) {
        this.animating = false
        return
      }

      this.position.x += offset.x * 0.125
      this.position.y += offset.y * 0.125

      requestAnimationFrame(this.animate)
    }
  },
  expose: ['updateTarget']
}
</script>
<style lang="scss">
.draggable-market {
  pointer-events: none;
  position: absolute;
  display: inline-flex;
  align-items: center;
  background-color: var(--theme-background-100);
  box-shadow: rgba(0, 0, 0, 0.2) 0px 18px 50px -10px;
  padding: 0.5rem;
  border-radius: 0.5rem;
  gap: 0.25rem;
  z-index: 10;
  line-height: 1;

  &__icon {
    font-size: 1.25rem;
  }

  &-enter-active {
    transition:
      all 0.2s $ease-out-expo,
      transform 0.2s $ease-elastic;
    pointer-events: none;
  }

  &-leave-active {
    transition: all 0.5s $ease-out-expo;
  }

  &-leave-from,
  &-enter-to {
    opacity: 1;
    transform: none;
  }

  &-enter-from,
  &-leave-to {
    opacity: 0;
    transform: scale(0.8);
  }
}
</style>
