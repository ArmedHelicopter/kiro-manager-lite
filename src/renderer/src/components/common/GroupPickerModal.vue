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
  /** 标题里的条目名称（如「账户」「API Key」）；不传则用 entity */
  titleEntity?: string
}>()

/** 保存 / 移出后的提示只停留 1.5 秒，默认 3 秒太久 */
const TOAST_SECONDS = 1.5

const title = computed(() => `设置分组（${props.ids.length}个${props.titleEntity ?? props.entity}）`)

const emit = defineEmits<{
  close: []
  /** 打开管理分组弹窗，由页面负责挂载 */
  manage: []
}>()

const groups = computed(() => props.api.groups)

/**
 * 选中的分组（可多个），保存时把所选条目的分组整体替换成这些。
 * 只设置一个条目时（右键「设置分组」）预选它当前的分组，改起来是在原有基础上增减；
 * 批量设置时从空开始，避免把第一个条目的分组误套到其它条目上。
 */
const picked = ref<string[]>(props.ids.length === 1 ? props.api.groupsOf(props.ids[0]) : [])
const single = computed(() => props.ids.length === 1)

function toggle(id: string): void {
  picked.value = picked.value.includes(id) ? picked.value.filter((g) => g !== id) : [...picked.value, id]
}

// 选中的分组在管理弹窗里被删掉时一并去掉
watch(groups, (list) => {
  const alive = new Set(list.map((g) => g.id))
  if (picked.value.some((id) => !alive.has(id))) picked.value = picked.value.filter((id) => alive.has(id))
})

/** 单个条目允许保存成「一个分组都不选」（等价于移出分组）；批量时没选就什么也不做 */
const canSubmit = computed(() => single.value || picked.value.length > 0)

async function submit(): Promise<void> {
  if (!props.ids.length) return void message.info(`没有选中的${props.entity}`)
  if (!canSubmit.value) return void emit('close')
  const res = await props.api.assign(props.ids, picked.value)
  if (res.error) return void message.error(res.error)
  if (!picked.value.length) {
    message.success(`已将 ${res.changed} 个${props.entity}移出分组`, TOAST_SECONDS)
  } else {
    const names = groups.value.filter((g) => picked.value.includes(g.id)).map((g) => `「${g.name}」`)
    message.success(`已将 ${res.changed} 个${props.entity}设置为 ${names.join('、')}`, TOAST_SECONDS)
  }
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
      const res = await props.api.assign(props.ids, [])
      if (res.error) return void message.error(res.error)
      message.success(`已将 ${res.changed} 个${props.entity}移出分组`, TOAST_SECONDS)
      emit('close')
    }
  })
}
</script>

<template>
  <a-modal
    :open="true"
    :title="title"
    centered
    width="720px"
    @cancel="emit('close')"
  >
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
        <a-button type="primary" :disabled="!canSubmit" @click="submit">
          保存{{ picked.length ? `（${picked.length}）` : '' }}
        </a-button>
      </div>
    </template>

    <p class="muted tip">
      可多选。保存后，所选 {{ props.ids.length }} 个{{ props.entity }}的分组会替换为选中的这些分组。
    </p>

    <GroupGrid
      v-if="groups.length"
      :groups="groups"
      :selected="picked"
      :counts="props.api.counts"
      :columns="3"
      :rows="10"
      @select="toggle"
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
