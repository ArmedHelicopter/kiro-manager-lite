<script setup lang="ts">
/**
 * 卡片右键菜单：整页只挂一个，跟随鼠标落点弹出。
 *
 * 为什么不给每张卡片各包一个 a-dropdown：每个 a-dropdown 都带一套 Trigger（事件监听、
 * 弹层管理、对齐计算），虚拟网格滚动时会不断挂载 / 销毁卡片，这些也跟着反复创建销毁，
 * 首屏渲染和滚动都会明显变卡。这里改为卡片只派发原生 contextmenu 事件，
 * 菜单本身只有一个实例，挂在一个 1×1 的固定定位锚点上，锚点放到鼠标位置即可。
 */
import { computed, h, type Component } from 'vue'
import type { ItemType } from 'ant-design-vue'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: Component
  danger?: boolean
  disabled?: boolean
  /** 在这一项上方画分隔线 */
  divided?: boolean
}

const props = defineProps<{
  open: boolean
  /** 鼠标落点（视口坐标） */
  x: number
  y: number
  items: ContextMenuItem[]
}>()

/** close：点菜单外面、按 Esc、点了某一项后菜单都会关闭 */
const emit = defineEmits<{ select: [key: string]; close: [] }>()

/** 转成 a-menu 的 items 配置：分隔线是独立的一项，图标要包成渲染函数 */
const menuItems = computed<ItemType[]>(() =>
  props.items.flatMap((item): ItemType[] => [
    ...(item.divided ? [{ type: 'divider' as const, key: `divider-${item.key}` }] : []),
    {
      key: item.key,
      label: item.label,
      danger: item.danger,
      disabled: item.disabled,
      icon: item.icon ? () => h(item.icon as Component) : undefined
    }
  ])
)

/** 受控模式下点菜单项不会自动关闭，要自己关；先关再派发，弹出的确认框不会和菜单叠在一起 */
function onClick(info: { key: string | number }): void {
  emit('close')
  emit('select', String(info.key))
}

function onOpenChange(open: boolean): void {
  if (!open) emit('close')
}
</script>

<template>
  <!--
    trigger 用 contextmenu：锚点本身不接收鼠标事件，不会被它自己打开；
    选它是为了让 Trigger 在菜单打开时监听菜单外的点击、滚动并自动关闭。
  -->
  <a-dropdown
    :open="props.open"
    :trigger="['contextmenu']"
    placement="bottomLeft"
    destroy-popup-on-hide
    @open-change="onOpenChange"
  >
    <span class="context-anchor" :style="{ left: `${props.x}px`, top: `${props.y}px` }" />
    <template #overlay>
      <a-menu class="card-context-menu" :items="menuItems" @click="onClick" />
    </template>
  </a-dropdown>
</template>

<style scoped>
.context-anchor {
  position: fixed;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

.card-context-menu {
  min-width: 160px;
}
</style>
