<script setup lang="ts">
/**
 * 分组筛选面板：挂在列表工具栏「分组」按钮的浮层里，只做按分组筛选。
 * 新建、改名、删除、排序都集中在「管理分组」弹窗，由面板头部右侧的「管理」打开。
 *
 * 账号列表与 API Key 列表共用这一份：分组数据走 GroupApi 门面，
 * 筛选条件由各自的页面持有（两边一个在 store、一个在页面本地），所以用 props / emits 传。
 */
import { computed } from 'vue'
import { SettingOutlined } from '@ant-design/icons-vue'
import GroupGrid from '@/components/common/GroupGrid.vue'
import GroupEmpty from '@/components/common/GroupEmpty.vue'
import { UNGROUPED } from '@/utils/groups'
import type { GroupApi } from '@/utils/groupApi'

const props = defineProps<{
  api: GroupApi
  /** 当前参与筛选的分组 id（含 UNGROUPED） */
  selected: string[]
  /** 命中条数，显示在底部 */
  matched: number
  /** 条目名称，用于文案：账号 / Key */
  entity: string
}>()

const emit = defineEmits<{
  /** 点某个分组：由调用方切换它在筛选里的选中态 */
  toggle: [id: string]
  clear: []
  /** 打开管理分组弹窗，由页面负责挂载 */
  manage: []
}>()

const groups = computed(() => props.api.groups)
const counts = computed(() => props.api.counts)
const ungroupedCount = computed(() => counts.value[UNGROUPED] ?? 0)
</script>

<template>
  <div class="group-panel">
    <div class="panel-head">
      <span class="panel-title">分组</span>
      <a-button type="link" size="small" @click="emit('manage')">
        <template #icon><SettingOutlined /></template>
        管理
      </a-button>
    </div>

    <div v-if="groups.length" class="panel-hint muted">点击分组按其筛选，可多选</div>

    <GroupGrid
      v-if="groups.length"
      :groups="groups"
      :selected="props.selected"
      :counts="counts"
      :columns="3"
      multiple
      @select="(id) => emit('toggle', id)"
    />
    <GroupEmpty v-else text="还没有分组，点右上角「管理」新建" />

    <!-- 未分组单独一行：它不是真实分组，但要能参与筛选 -->
    <button
      class="ungrouped"
      :class="{ on: props.selected.includes(UNGROUPED) }"
      @click="emit('toggle', UNGROUPED)"
    >
      未分组<span class="muted">（{{ ungroupedCount }}）</span>
    </button>

    <div class="panel-footer">
      <span class="muted">命中 {{ props.matched }} 个{{ props.entity }}</span>
      <a-button type="link" size="small" :disabled="!props.selected.length" @click="emit('clear')">
        清除分组筛选
      </a-button>
    </div>
  </div>
</template>

<style scoped>
.group-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 一排三个分组 + 计数，名字不至于太快被截断 */
  width: 540px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  font-weight: 600;
}

.panel-hint {
  font-size: 12px;
  line-height: 1.5;
}

.ungrouped {
  padding: 7px 10px;
  border: 1px dashed var(--kal-border);
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.ungrouped:hover {
  border-color: var(--kal-primary);
}

.ungrouped.on {
  border-style: solid;
  border-color: var(--kal-primary);
  background: var(--kal-block-bg);
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
  border-top: 1px solid var(--kal-border);
}

.muted {
  color: var(--kal-muted);
}
</style>
