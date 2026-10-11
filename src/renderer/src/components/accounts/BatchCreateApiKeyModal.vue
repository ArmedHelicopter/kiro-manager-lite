<script setup lang="ts">
/**
 * 账号批量生成 API Key：每个选中账号一行，点「开始生成」后按顺序逐个生成。
 *
 * 一个账号失败只记在它自己那一行，不影响后面的账号继续生成。
 * 串行而非并发：批量并发请求控制面容易被判为异常活动。
 * 完整 Key 上游只返回一次，生成后可逐个复制、复制全部，或通过批量导入添加到 API Key 管理。
 */
import { computed, nextTick, ref } from 'vue'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  KeyOutlined,
  StopOutlined
} from '@ant-design/icons-vue'
import ImportApiKeysModal from '@/components/keys/ImportApiKeysModal.vue'
import { useSettingsStore } from '@/stores/settings'
import { displayEmail } from '@/utils/display'
import { toPlain } from '@/utils/ipc'
import { confirmDanger, copyText } from '@/utils/ui'
import { applyRefreshedCredentials, randomKeyName } from '@/utils/accountApiKey'
import { errorMessage } from '@shared/errors'
import type { Account } from '@shared/types'

/** accounts 由调用方按界面顺序传入 */
const props = defineProps<{ accounts: Account[] }>()
const emit = defineEmits<{ close: [] }>()

const settingsStore = useSettingsStore()

type RowState = 'pending' | 'creating' | 'ok' | 'fail'
interface Row {
  account: Account
  state: RowState
  apiKey?: string
  region?: string
  error?: string
}

const rows = ref<Row[]>(props.accounts.map((account) => ({ account, state: 'pending' })))
const label = ref('')
const running = ref(false)
const aborted = ref(false)
/** 批量导入弹窗 */
const importOpen = ref(false)
/** 生成出的 Key 已复制或已添加过，关闭时不再提醒 */
const saved = ref(false)
const listRef = ref<HTMLElement | null>(null)

const stat = computed(() => ({
  total: rows.value.length,
  ok: rows.value.filter((row) => row.state === 'ok').length,
  fail: rows.value.filter((row) => row.state === 'fail').length,
  pending: rows.value.filter((row) => row.state === 'pending').length
}))
const created = computed(() => rows.value.filter((row) => row.state === 'ok' && row.apiKey))
const started = computed(() => stat.value.ok + stat.value.fail > 0)

function email(row: Row): string {
  return displayEmail(row.account.email, settingsStore.settings.privacyMode)
}

function displayKey(key: string): string {
  if (!settingsStore.settings.privacyMode) return key
  return `${key.slice(0, 8)}…${key.slice(-6)}`
}

/** 正在生成的那一行滚进视野，并多露出两行后续项 */
function revealRow(index: number): void {
  const target = listRef.value?.querySelector<HTMLElement>(
    `[data-row-index="${Math.min(index + 2, rows.value.length - 1)}"]`
  )
  target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

async function start(): Promise<void> {
  if (running.value) return
  running.value = true
  aborted.value = false
  // 只跑还没成功的：重试时已生成的 Key 不会再生成一份
  for (let index = 0; index < rows.value.length; index++) {
    const row = rows.value[index]
    if (aborted.value) break
    if (row.state === 'ok') continue
    row.state = 'creating'
    row.error = undefined
    await nextTick()
    revealRow(index)
    try {
      const name = label.value.trim() || randomKeyName()
      const res = await window.api.createAccountApiKey(toPlain(row.account), name)
      if (res.success && res.data) {
        applyRefreshedCredentials(row.account.id, res.data.refreshed)
        row.state = 'ok'
        row.apiKey = res.data.apiKey
        row.region = res.data.region
        saved.value = false
      } else {
        row.state = 'fail'
        row.error = res.error || '生成失败'
      }
    } catch (cause) {
      row.state = 'fail'
      row.error = errorMessage(cause)
    }
  }
  running.value = false
}

function copyOne(row: Row): void {
  if (!row.apiKey) return
  copyText(row.apiKey, '已复制 API Key')
}

/** 复制全部：一行一个，可直接粘到 API Key 管理的批量导入里 */
function copyAll(): void {
  if (!created.value.length) return
  copyText(created.value.map((row) => row.apiKey).join('\n'), `已复制 ${created.value.length} 个 API Key`)
  saved.value = true
}

/**
 * 添加到 API Key 管理：打开批量导入弹窗，预填生成出的 Key（一行一个）。
 * 导入弹窗一批共用一个区域，这里取第一个生成结果的区域；导入后可在卡片上逐个调整。
 */
function openImport(): void {
  if (created.value.length) importOpen.value = true
}

const importText = computed(() => created.value.map((row) => row.apiKey).join('\n'))
const importRegion = computed(() => created.value[0]?.region)

function abort(): void {
  aborted.value = true
}

/** 生成出的 Key 只显示这一次：既没复制也没添加过就先确认 */
function close(): void {
  if (running.value) abort()
  if (!created.value.length || saved.value) return void emit('close')
  confirmDanger({
    title: '还没有保存生成的 API Key，确认关闭？',
    content: '完整 API Key 关闭后无法再次获取。可以先复制全部，或添加到 API Key 管理。',
    okText: '仍然关闭',
    onOk: () => emit('close')
  })
}
</script>

<template>
  <a-modal :open="true" width="760px" centered :footer="null" :mask-closable="false" @cancel="close">
    <template #title>
      <span class="title"><KeyOutlined />批量生成 API Key</span>
    </template>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="按列表顺序逐个为账号生成一个 API Key，单个失败不影响后续账号。完整 Key 只显示这一次，生成后请复制或添加到 API Key 管理。"
    />

    <a-input
      v-model:value="label"
      placeholder="密钥名称（留空则每个随机生成）"
      :maxlength="64"
      :disabled="running"
      allow-clear
      style="margin-bottom: 12px"
    />

    <div class="summary">
      <span class="count-text">共 {{ stat.total }} 个账号</span>
      <a-tag v-if="stat.ok" color="green" :bordered="false">成功 {{ stat.ok }}</a-tag>
      <a-tag v-if="stat.fail" color="red" :bordered="false">失败 {{ stat.fail }}</a-tag>
      <a-tag v-if="stat.pending" :bordered="false">未生成 {{ stat.pending }}</a-tag>
      <span class="spacer" />
      <span v-if="running" class="count-text">
        正在生成 {{ stat.ok + stat.fail + 1 }}/{{ stat.total }}
      </span>
    </div>

    <div ref="listRef" class="row-list">
      <div
        v-for="(row, index) in rows"
        :key="row.account.id"
        :data-row-index="index"
        class="row"
        :class="row.state"
      >
        <div class="row-main">
          <div class="row-email">{{ email(row) }}</div>
          <div v-if="row.apiKey" class="row-key mono">{{ displayKey(row.apiKey) }}</div>
        </div>
        <div class="row-state">
          <template v-if="row.state === 'pending'">
            <span class="muted">等待生成</span>
          </template>
          <template v-else-if="row.state === 'creating'">
            <a-spin size="small" />
            <span class="creating-text">生成中</span>
          </template>
          <template v-else-if="row.state === 'ok'">
            <CheckCircleFilled class="ok-icon" />
            <span class="ok-text">已生成</span>
            <a-tooltip title="复制 API Key">
              <a-button type="text" size="small" @click="copyOne(row)">
                <template #icon><CopyOutlined /></template>
              </a-button>
            </a-tooltip>
          </template>
          <template v-else>
            <CloseCircleFilled class="fail-icon" />
            <span class="fail-text" :title="row.error">{{ row.error }}</span>
          </template>
        </div>
      </div>
    </div>

    <div class="footer">
      <a-button :disabled="!created.length || running" @click="copyAll">
        <template #icon><CopyOutlined /></template>
        复制全部（{{ created.length }}）
      </a-button>
      <a-button :disabled="!created.length || running" @click="openImport">
        <template #icon><KeyOutlined /></template>
        添加到 API Key 管理
      </a-button>
      <span class="spacer" />
      <a-button @click="close">关闭</a-button>
      <a-button v-if="running" danger @click="abort">
        <template #icon><StopOutlined /></template>中止
      </a-button>
      <a-button
        v-else
        type="primary"
        :disabled="!stat.pending && !stat.fail"
        @click="start"
      >
        <template #icon><KeyOutlined /></template>
        {{ started && stat.fail ? '重试失败项' : '开始生成' }}
      </a-button>
    </div>
  </a-modal>

  <!-- 压在本弹窗之上；导入成功即视为已保存，关闭时不再提醒 -->
  <ImportApiKeysModal
    v-if="importOpen"
    :initial-text="importText"
    :initial-region="importRegion"
    :z-index="1100"
    @imported="(added) => added && (saved = true)"
    @close="importOpen = false"
  />
</template>

<style scoped>
.title { display: inline-flex; align-items: center; gap: 8px; }
.summary { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.spacer { flex: 1 1 auto; }
.count-text { color: var(--kal-muted); font-size: 12px; }

.row-list { max-height: 46vh; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--kal-block-bg);
  border: 1px solid transparent;
  transition: border-color 0.2s, background 0.2s;
}
.row.creating { border-color: var(--kal-primary); }
.row.ok { border-color: #52c41a33; }
.row.fail { border-color: #ff4d4f33; }

.row-main { min-width: 0; flex: 1 1 auto; }
.row-email { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-key { margin-top: 2px; color: var(--kal-muted); font-size: 12px; word-break: break-all; }

.row-state { flex: 0 0 auto; max-width: 52%; display: flex; align-items: center; gap: 6px; font-size: 12px; }
.creating-text { color: var(--kal-primary); }
.ok-icon, .ok-text { color: #52c41a; }
.fail-icon { color: #ff4d4f; flex: 0 0 auto; }
.fail-text { color: #ff4d4f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.footer { display: flex; align-items: center; gap: 8px; margin-top: 16px; }

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.muted { color: var(--kal-muted); }
</style>
