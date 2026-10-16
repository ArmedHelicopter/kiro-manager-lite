<script setup lang="ts">
/**
 * 回收站开关：放在视图模式切换的右边。
 * 打开后列表只显示回收站里的条目，再点一次回到正常列表；图标右边的数字是回收站里的数量。
 */
import { RestOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  active: boolean
  count: number
  size?: 'small' | 'middle' | 'large'
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <!-- 数量直接跟在图标右边，不用角标：角标会压住相邻按钮，数字大了也挤 -->
  <a-tooltip :title="props.active ? '返回列表' : '回收站'">
    <a-button
      :size="props.size"
      :type="props.active ? 'primary' : 'default'"
      :aria-label="`回收站，${props.count} 项`"
      @click="emit('toggle')"
    >
      <template #icon><RestOutlined /></template>
      {{ props.active ? `回收站（${props.count}）` : props.count }}
    </a-button>
  </a-tooltip>
</template>
