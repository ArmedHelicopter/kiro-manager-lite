<script setup lang="ts">
/**
 * 批量导入 Kiro API Key：每行一个，本批共用一个区域，导入后整体校验一次。
 * API Key 管理页的「导入」与账号批量生成后的「添加到 API Key 管理」共用，后者预填生成的 Key 与区域。
 */
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import RegionSelect from '@/components/common/RegionSelect.vue'
import { useKeysStore } from '@/stores/keys'
import { DEFAULT_REGION } from '@shared/regions'

const props = defineProps<{
  initialText?: string
  initialRegion?: string
  /** 从别的弹窗里打开时要压在它上面 */
  zIndex?: number
}>()
const emit = defineEmits<{ close: []; imported: [added: number] }>()

const store = useKeysStore()

const text = ref(props.initialText ?? '')
// 没指定区域时预填上次用过的区域
const region = ref(props.initialRegion || store.data.region || DEFAULT_REGION)
const importing = ref(false)

// 从账号页打开时 Key 管理页可能从没加载过，查重要先有数据
onMounted(() => {
  if (!store.data.keys.length) void store.load()
})

async function submit(): Promise<void> {
  importing.value = true
  try {
    const result = await store.importText(text.value, region.value)
    if (result.error) return void message.error(result.error)
    const synced = result.added ? await store.syncAll(false) : null
    if (synced && !synced.error) store.scheduleUsageRefresh()
    const syncText = synced && !synced.error ? `；校验成功 ${synced.success}，失败 ${synced.failed}` : ''
    message.success(
      `已添加 ${result.added} 个，重复 ${result.skipped} 个，无效 ${result.invalid} 个${syncText}`
    )
    emit('imported', result.added ?? 0)
    emit('close')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <a-modal
    :open="true"
    title="批量导入 API Key"
    centered
    :z-index="props.zIndex"
    :confirm-loading="importing"
    @ok="submit"
    @cancel="emit('close')"
  >
    <a-form layout="vertical">
      <a-form-item label="区域" required>
        <RegionSelect v-model:value="region" />
        <div class="field-hint muted">本批 Key 共用该区域，导入后可在卡片上逐个调整</div>
      </a-form-item>
      <a-form-item label="API Key" required>
        <a-textarea
          v-model:value="text"
          :rows="9"
          placeholder="每行一个 ksk_ 开头的 API Key，自动忽略空行和重复项"
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.field-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
}

.muted {
  color: var(--kal-muted);
}
</style>
