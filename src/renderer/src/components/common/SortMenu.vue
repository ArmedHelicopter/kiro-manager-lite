<script setup lang="ts">
/**
 * 列表排序的下拉按钮：一级是排序字段，点字段直接按降序排；
 * 悬停展开二级可改选降序 / 升序。按钮上显示当前的「字段 + 方向」。
 */
import { computed } from 'vue'
import { DownOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons-vue'
import {
  DIR_LABELS,
  parseSortKey,
  sortLabelOf,
  type SortDir,
  type SortField,
  type SortFieldOption,
  type SortKey
} from '@/utils/listSort'

const props = defineProps<{
  fields: SortFieldOption[]
  size?: 'small' | 'middle' | 'large'
}>()
const model = defineModel<SortKey>({ required: true })

const current = computed(() => parseSortKey(model.value))
const label = computed(() => sortLabelOf(props.fields, model.value))
/** 一级高亮当前字段，二级高亮当前方向 */
const selectedKeys = computed(() => [current.value[0], model.value])

const DIRS: SortDir[] = ['desc', 'asc']

function pick(field: SortField, dir: SortDir = 'desc'): void {
  model.value = `${field}:${dir}`
}
</script>

<template>
  <a-dropdown>
    <a-button :size="props.size">
      <template #icon>
        <SortAscendingOutlined v-if="current[1] === 'asc'" />
        <SortDescendingOutlined v-else />
      </template>
      {{ label }}
      <DownOutlined />
    </a-button>
    <template #overlay>
      <a-menu :selected-keys="selectedKeys">
        <a-sub-menu
          v-for="item in props.fields"
          :key="item.field"
          :title="item.label"
          @title-click="pick(item.field)"
        >
          <a-menu-item v-for="dir in DIRS" :key="`${item.field}:${dir}`" @click="pick(item.field, dir)">
            <template #icon>
              <SortAscendingOutlined v-if="dir === 'asc'" />
              <SortDescendingOutlined v-else />
            </template>
            {{ DIR_LABELS[dir] }}
          </a-menu-item>
        </a-sub-menu>
      </a-menu>
    </template>
  </a-dropdown>
</template>
