<script setup lang="ts">
/**
 * 批量查询生效时显示在搜索框旁边：几个关键字有结果、几个一条都没找到。
 * 点标签重新打开查询弹窗编辑，点 × 取消批量查询；没找到的可以一键复制出来核对。
 */
import { copyText } from '@/utils/ui'

const props = defineProps<{
  total: number
  hits: number
  missing: string[]
}>()
const emit = defineEmits<{ edit: []; clear: [] }>()
</script>

<template>
  <span class="batch-query-tag">
    <a-tag
      color="processing"
      closable
      class="query-tag"
      @click="emit('edit')"
      @close.prevent="emit('clear')"
    >
      批量查询：{{ props.hits }} / {{ props.total }} 个关键字有结果
    </a-tag>
    <a-button
      v-if="props.missing.length"
      type="link"
      size="small"
      class="missing-link"
      @click="copyText(props.missing.join('\n'), `已复制 ${props.missing.length} 个未找到的`)"
    >
      复制未找到（{{ props.missing.length }}）
    </a-button>
  </span>
</template>

<style scoped>
.batch-query-tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.query-tag {
  margin: 0;
  cursor: pointer;
}

.missing-link {
  padding: 0 6px;
}
</style>
