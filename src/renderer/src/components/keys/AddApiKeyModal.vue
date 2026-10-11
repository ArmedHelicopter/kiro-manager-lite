<script setup lang="ts">
/**
 * 添加单个 Kiro API Key：保存后立刻用它查一次额度做远端校验。
 * API Key 管理页的「添加 API Key」与账号生成 Key 后的「添加到 API Key 管理」共用，
 * 后者会预填 Key、区域与备注。
 */
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import RegionSelect from '@/components/common/RegionSelect.vue'
import { useKeysStore } from '@/stores/keys'
import { DEFAULT_REGION } from '@shared/regions'

const props = defineProps<{
  initialKey?: string
  initialRegion?: string
  initialNote?: string
  /** 从别的弹窗里打开时要压在它上面 */
  zIndex?: number
}>()
const emit = defineEmits<{ close: []; added: [] }>()

const store = useKeysStore()

const key = ref(props.initialKey ?? '')
const note = ref(props.initialNote ?? '')
// 没指定区域时预填上次用过的区域，连续添加同区域的 Key 不用反复选
const region = ref(props.initialRegion || store.data.region || DEFAULT_REGION)
const adding = ref(false)

// 从账号页打开时 Key 管理页可能从没加载过，查重与上次区域都要先有数据
onMounted(() => {
  if (!store.data.keys.length) void store.load()
})

async function submit(): Promise<void> {
  adding.value = true
  try {
    const rawKey = key.value.trim()
    const error = await store.add(rawKey, note.value, region.value)
    if (error) return void message.error(error)
    const added = store.data.keys.find((entry) => entry.key === rawKey)
    const verifyError = added ? await store.sync(added.id) : null
    if (verifyError) message.warning(`Key 已保存，但远端校验失败：${verifyError}`)
    else message.success('API Key 已添加并校验通过')
    emit('added')
    emit('close')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <a-modal
    :open="true"
    title="添加 Kiro API Key"
    centered
    :z-index="props.zIndex"
    :confirm-loading="adding"
    @ok="submit"
    @cancel="emit('close')"
  >
    <a-form layout="vertical">
      <a-form-item label="API Key" required>
        <a-input v-model:value="key" class="mono" placeholder="ksk_..." allow-clear />
      </a-form-item>
      <a-form-item label="区域" required>
        <RegionSelect v-model:value="region" />
        <div class="field-hint muted">不同 Key 可能属于不同区域，选错会导致额度查询与请求失败</div>
      </a-form-item>
      <a-form-item label="备注">
        <a-input v-model:value="note" placeholder="例如：主力 Key" @press-enter="submit" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.field-hint {
  margin-top: 4px;
  font-size: 12px;
}

.muted {
  color: var(--kal-muted);
}

.mono :deep(input),
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
