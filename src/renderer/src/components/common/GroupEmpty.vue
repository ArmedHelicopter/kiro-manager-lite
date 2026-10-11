<!--
 * @Author: lucks-cloud github@ixy.cc
 * @Date: 2026-10-11 12:41:52
 * @LastEditors: lucks-cloud github@ixy.cc
 * @LastEditTime: 2026-10-11 16:04:11
 * @FilePath: /kiro-manager-lite/code/src/renderer/src/components/common/GroupEmpty.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<script setup lang="ts">
/**
 * 还没有分组时的占位：浅灰圆角底 + 分组图标 + 说明。
 * 筛选浮层、批量设置分组、管理分组三处共用，高度由 height 控制。
 */
import { AppstoreOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  text: string
  /** 占位高度，管理与批量设置传列表的固定高度，让有无分组时弹窗一样高 */
  height?: string
}>()
</script>

<template>
  <div class="group-empty" :style="{ height: props.height ?? '140px' }">
    <AppstoreOutlined class="group-empty-icon" />
    <span class="group-empty-text">{{ props.text }}</span>
  </div>
</template>

<style scoped>
.group-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 10px;
  background: var(--kal-block-bg);
  color: var(--kal-muted);
}

.group-empty-icon {
  font-size: 32px;
  opacity: 0.55;
}

.group-empty-text {
  font-size: 12px;
}
</style>
