<script setup lang="ts">
/**
 * 分组管理弹窗：新建、改名、删除、排序都集中在这里。
 * 从分组筛选浮层标题右侧的「管理」或批量设置分组弹窗的「管理分组」打开。
 *
 * 点分组是勾选 / 取消勾选，配合全选、反选做批量删除；长按拖动排序，右键或三点改名、删除。
 * 账号列表与 API Key 列表共用，读写全部走 GroupApi。
 */
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue'
import GroupGrid from '@/components/common/GroupGrid.vue'
import GroupEmpty from '@/components/common/GroupEmpty.vue'
import type { GroupApi } from '@/utils/groupApi'
import type { AccountGroup } from '@shared/types'

const props = defineProps<{
  api: GroupApi
  /** 条目名称，用于文案：账号 / Key */
  entity: string
}>()

const emit = defineEmits<{ close: [] }>()

const groups = computed(() => props.api.groups)
const counts = computed(() => props.api.counts)

const checked = ref<string[]>([])
const newName = ref('')
const saving = ref(false)
const deleting = ref(false)
const renaming = ref<AccountGroup | null>(null)
const renameValue = ref('')
/** 改名的校验错误，显示在输入框下方；改动输入后清掉 */
const renameError = ref('')
watch(renameValue, () => (renameError.value = ''))

// 分组被删掉（这里或别处）后，勾选里不能留下已经不存在的 id
watch(groups, (list) => {
  const alive = new Set(list.map((g) => g.id))
  checked.value = checked.value.filter((id) => alive.has(id))
})

const allChecked = computed(
  () => groups.value.length > 0 && checked.value.length === groups.value.length
)
/** 勾选的分组下共有多少条目，工具栏里提示 */
const checkedItems = computed(() =>
  checked.value.reduce((sum, id) => sum + (counts.value[id] ?? 0), 0)
)

function toggle(id: string): void {
  checked.value = checked.value.includes(id)
    ? checked.value.filter((v) => v !== id)
    : [...checked.value, id]
}

function checkAll(): void {
  checked.value = allChecked.value ? [] : groups.value.map((g) => g.id)
}

function invert(): void {
  const set = new Set(checked.value)
  checked.value = groups.value.filter((g) => !set.has(g.id)).map((g) => g.id)
}

async function submitNew(): Promise<void> {
  const name = newName.value.trim()
  if (!name || saving.value) return
  saving.value = true
  try {
    const res = await props.api.add(name)
    if (res.error) return void message.error(res.error)
    newName.value = ''
    // 同名会复用已有分组，什么也没新建，用警告提示
    if (res.created) message.success(`已添加分组「${res.group?.name}」`)
    else message.warning(`分组「${res.group?.name}」已存在`)
  } finally {
    saving.value = false
  }
}

/** 删除气泡里的说明：其下有条目时提醒会变为未分组，条目本身不删 */
function removeText(ids: string[], label: string): string {
  const items = ids.reduce((sum, id) => sum + (counts.value[id] ?? 0), 0)
  return items
    ? `确认删除${label}？其下 ${items} 个${props.entity}会变为未分组，${props.entity}本身不会被删除。`
    : `确认删除${label}？`
}

const batchRemoveText = computed(() =>
  removeText(checked.value, `选中的 ${checked.value.length} 个分组`)
)

function groupRemoveText(group: AccountGroup): string {
  return removeText([group.id], `分组「${group.name}」`)
}

/** 气泡里确认后执行；GroupApi 只有单个删除，逐个删 */
async function removeIds(ids: string[]): Promise<void> {
  deleting.value = true
  try {
    for (const id of ids) {
      const error = await props.api.remove(id)
      if (error) return void message.error(error)
    }
    message.success(`已删除 ${ids.length} 个分组`)
  } finally {
    deleting.value = false
  }
}

function openRename(group: AccountGroup): void {
  renaming.value = group
  renameValue.value = group.name
  renameError.value = ''
}

async function submitRename(): Promise<void> {
  const target = renaming.value
  if (!target) return
  const error = await props.api.rename(target.id, renameValue.value)
  if (error) return void (renameError.value = error)
  renaming.value = null
  message.success('已修改分组名称')
}

async function reorder(orderedIds: string[]): Promise<void> {
  const error = await props.api.reorder(orderedIds)
  if (error) message.error(error)
}
</script>

<template>
  <a-modal
    :open="true"
    title="管理分组"
    centered
    width="760px"
    :z-index="1050"
    :footer="null"
    @cancel="emit('close')"
  >
    <div class="manage">
      <!-- 输入框与按钮做成一组；不写 size，跟随全局组件尺寸设置 -->
      <a-space-compact block>
        <a-input
          v-model:value="newName"
          placeholder="新建分组名称"
          :maxlength="30"
          allow-clear
          @press-enter="submitNew"
        />
        <a-button type="primary" :disabled="!newName.trim()" :loading="saving" @click="submitNew">
          <template #icon><PlusOutlined /></template>
          添加
        </a-button>
      </a-space-compact>

      <div class="toolbar">
        <span class="muted">
          {{ checked.length ? `已选 ${checked.length} 个分组，共 ${checkedItems} 个${props.entity}` : '点击分组勾选，长按可拖动排序，右键或右侧三点可改名 / 删除' }}
        </span>
        <a-space :size="4">
          <a-button size="small" :disabled="!groups.length" @click="checkAll">
            {{ allChecked ? '取消全选' : '全选' }}
          </a-button>
          <a-button size="small" :disabled="!groups.length" @click="invert">反选</a-button>
          <a-popconfirm
            :disabled="!checked.length"
            placement="bottomRight"
            title="批量删除分组"
            :description="batchRemoveText"
            ok-text="确认删除"
            cancel-text="取消"
            :ok-button-props="{ danger: true }"
            :overlay-style="{ zIndex: 1100, maxWidth: '320px' }"
            @confirm="removeIds([...checked])"
          >
            <a-button size="small" danger :disabled="!checked.length" :loading="deleting">
              <template #icon><DeleteOutlined /></template>
              批量删除
            </a-button>
          </a-popconfirm>
        </a-space>
      </div>

      <GroupGrid
        v-if="groups.length"
        :groups="groups"
        :selected="checked"
        :counts="counts"
        :columns="3"
        :rows="10"
        multiple
        editable
        :remove-text="groupRemoveText"
        @select="toggle"
        @rename="openRename"
        @remove="(group) => removeIds([group.id])"
        @reorder="reorder"
      />
      <GroupEmpty v-else text="还没有分组，先在上面新建一个" height="432px" />
    </div>

    <a-modal
      v-if="renaming"
      :open="true"
      title="编辑分组名称"
      centered
      width="420px"
      :z-index="1100"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitRename"
      @cancel="renaming = null"
    >
      <a-form-item
        :validate-status="renameError ? 'error' : ''"
        :help="renameError || undefined"
        style="margin: 0"
      >
        <a-input
          v-model:value="renameValue"
          placeholder="分组名称"
          :maxlength="30"
          allow-clear
          @press-enter="submitRename"
        />
      </a-form-item>
    </a-modal>
  </a-modal>
</template>

<style scoped>
.manage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 输入框吃掉剩余宽度，按钮按内容宽 */
.manage :deep(.ant-space-compact .ant-input-affix-wrapper),
.manage :deep(.ant-space-compact .ant-input) {
  flex: 1;
  min-width: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}


.muted {
  color: var(--kal-muted);
}
</style>
