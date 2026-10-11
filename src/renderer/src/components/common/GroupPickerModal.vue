<script setup lang="ts">
/**
 * 批量设置分组：选中若干条目后指定它们归属的分组，这里只做选择。
 * 新建、改名、删除、排序都在「管理分组」弹窗里，点左下角「管理分组」打开。
 *
 * 账号列表与 API Key 列表共用这一份，读写走 GroupApi 门面。
 * 没选分组就等于「不设置」，保存按钮置灰；要清空归属走「移出分组」。
 */
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { SettingOutlined } from '@ant-design/icons-vue'
import GroupGrid from '@/components/common/GroupGrid.vue'
import GroupEmpty from '@/components/common/GroupEmpty.vue'
import { confirmDanger } from '@/utils/ui'
import type { GroupApi } from '@/utils/groupApi'

/** 移出确认要抬到本弹窗（1000）之上 */
const SUB_POPUP_Z_INDEX = 1100

const props = defineProps<{
  api: GroupApi
  ids: string[]
  /** 条目名称，用于文案：账号 / Key */
  entity: string
}>()

const emit = defineEmits<{
  close: []
  /** 打开管理分组弹窗，由页面负责挂载 */
  manage: []
}>()

/** 选中的目标分组；空串表示没选，保存时什么也不做 */
const picked = ref('')

const groups = computed(() => props.api.groups)
/** 单选：GroupGrid 要的是数组，这里包一层 */
const selected = computed(() => (picked.value ? [picked.value] : []))

// 选中的分组在管理弹窗里被删掉时清掉选中
watch(groups, (list) => {
  if (picked.value && !list.some((g) => g.id === picked.value)) picked.value = ''
})

async function submit(): Promise<void> {
  if (!props.ids.length) return void message.info(`没有选中的${props.entity}`)
  if (!picked.value) return void emit('close')
  const res = await props.api.assign(props.ids, picked.value)
  if (res.error) return void message.error(res.error)
  const name = groups.value.find((group) => group.id === picked.value)?.name
  message.success(`已将 ${res.changed} 个${props.entity}移入「${name}」`)
  emit('close')
}

/** 移出分组：把所选条目变回未分组，二次确认 */
function confirmUnassign(): void {
  if (!props.ids.length) return void message.info(`没有选中的${props.entity}`)
  confirmDanger({
    title: '移出分组',
    content: `确认将所选 ${props.ids.length} 个${props.entity}移出分组？${props.entity}本身与分组都不会被删除。`,
    okText: '移出分组',
    zIndex: SUB_POPUP_Z_INDEX,
    onOk: async () => {
      const res = await props.api.assign(props.ids, null)
      if (res.error) return void message.error(res.error)
      message.success(`已将 ${res.changed} 个${props.entity}移出分组`)
      emit('close')
    }
  })
}
</script>

<template>
  <a-modal :open="true" title="批量设置分组" centered width="720px" @cancel="emit('close')">
    <!-- 左下角放管理与移出，和右侧的取消 / 保存分开，免得误点 -->
    <template #footer>
      <div class="picker-footer">
        <a-button @click="emit('manage')">
          <template #icon><SettingOutlined /></template>
          管理分组
        </a-button>
        <a-button danger :disabled="!props.ids.length" @click="confirmUnassign">
          移出分组（{{ props.ids.length }}）
        </a-button>
        <span class="footer-spacer" />
        <a-button @click="emit('close')">取消</a-button>
        <a-button type="primary" :disabled="!picked" @click="submit">保存</a-button>
      </div>
    </template>

    <p class="muted tip">
      选中一个分组后保存，所选 {{ props.ids.length }} 个{{ props.entity }}都会移入该分组。
    </p>

    <GroupGrid
      v-if="groups.length"
      :groups="groups"
      :selected="selected"
      :counts="props.api.counts"
      :columns="3"
      :rows="10"
      @select="(id) => (picked = picked === id ? '' : id)"
    />
    <GroupEmpty v-else text="还没有分组，点左下角「管理分组」新建" height="432px" />
  </a-modal>
</template>

<style scoped>
.tip {
  margin: 0 0 12px;
  font-size: 12px;
}

.picker-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-spacer {
  flex: 1 1 auto;
}

.muted {
  color: var(--kal-muted);
}
</style>
