/**
 * 极简 xlsx 生成器：手写 OOXML + ZIP，不引第三方表格库。
 *
 * xlsx 本质是一个装着若干 XML 的 zip 包，需要的部件很少：
 *   [Content_Types].xml / _rels/.rels / xl/workbook.xml
 *   xl/_rels/workbook.xml.rels / xl/styles.xml / xl/worksheets/sheet1.xml
 * 单表导出用不到 sharedStrings，字符串一律走 inlineStr，省一层索引。
 */
import { deflateRawSync } from 'zlib'
import type { XlsxCellValue, XlsxColumn, XlsxSheet } from '../shared/types'

// ============ ZIP ============

interface ZipEntry {
  name: string
  /** 原始内容 */
  raw: Buffer
  /** deflate 后的内容 */
  deflated: Buffer
  crc: number
}

const CRC_TABLE = ((): Int32Array => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** ZIP 用的 DOS 时间/日期；1980 年以前的时间没法表示，钳到 1980-01-01 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

/**
 * 打包成 zip：统一用 deflate，不写 data descriptor，长度直接填在本地头里。
 * content 允许直接给 Buffer，这样 xlsx 这类二进制也能塞进同一个包。
 */
function zip(files: { name: string; content: string | Buffer }[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now)
  const entries: ZipEntry[] = files.map((file) => {
    const raw = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf-8')
    return { name: file.name, raw, deflated: deflateRawSync(raw, { level: 9 }), crc: crc32(raw) }
  })

  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
    local.writeUInt16LE(20, 4) // 解压所需版本 2.0
    local.writeUInt16LE(0x0800, 6) // 通用标记：文件名按 UTF-8 解释
    local.writeUInt16LE(8, 8) // 压缩方式 deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(entry.crc, 14)
    local.writeUInt32LE(entry.deflated.length, 18)
    local.writeUInt32LE(entry.raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // 无扩展字段
    locals.push(local, name, entry.deflated)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // 中央目录头签名
    central.writeUInt16LE(20, 4) // 生成者版本
    central.writeUInt16LE(20, 6) // 解压所需版本
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(entry.crc, 16)
    central.writeUInt32LE(entry.deflated.length, 20)
    central.writeUInt32LE(entry.raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // 扩展字段
    central.writeUInt16LE(0, 32) // 注释
    central.writeUInt16LE(0, 34) // 起始磁盘号
    central.writeUInt16LE(0, 36) // 内部属性
    central.writeUInt32LE(0, 38) // 外部属性
    central.writeUInt32LE(offset, 42) // 对应本地头的偏移
    centrals.push(central, name)

    offset += local.length + name.length + entry.deflated.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // 中央目录结束签名
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralBuf, end])
}

// ============ XML ============

/** XML 转义；顺带丢掉 XML 1.0 不允许出现的控制字符，免得整个文件打不开 */
function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 列序号转字母：0 → A、26 → AA */
function columnLetter(index: number): string {
  let letter = ''
  let n = index
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return letter
}

/** 工作表名的硬性限制：31 字符以内且不含 : \ / ? * [ ] */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim()
  return (cleaned || 'Sheet1').slice(0, 31)
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/**
 * 行高：Excel 默认 15（11pt 字体的一行），这里统一放宽到 1.5 倍，表格不那么挤。
 * 每一行都显式写上并标成 customHeight：超链接列开了自动换行，不钉死的话 Excel
 * 会按内容把行撑到十几行高。
 */
const ROW_HEIGHT = 22.5
const ROW_HEIGHT_ATTR = ` ht="${ROW_HEIGHT}" customHeight="1"`
const EPOCH_1900_OFFSET = 25569 // 1970-01-01 在 Excel 1900 日期系统里的序列号
const MS_PER_DAY = 86400000

/**
 * 毫秒时间戳转 Excel 日期序列号。
 * Excel 的序列号没有时区概念，按本地时间落盘，所以要先减掉时区偏移。
 */
function excelSerial(ms: number): number {
  const local = ms - new Date(ms).getTimezoneOffset() * 60000
  return local / MS_PER_DAY + EPOCH_1900_OFFSET
}

function numberFormatCode(column: XlsxColumn): string | null {
  const decimals = Math.max(0, Math.min(10, column.decimals ?? 2))
  const tail = decimals > 0 ? `.${'0'.repeat(decimals)}` : ''
  if (column.format === 'datetime') return 'yyyy-mm-dd hh:mm:ss'
  if (column.format === 'percent') return `0${tail}%`
  if (column.format === 'number') return `#,##0${tail}`
  return null
}

/*
 * cellXfs 里的固定位次：0 常规、1 表头、2 超链接，数字格式从 3 开始按需追加。
 * 把超链接放在定值上，列样式就能一遍扫出来，不必先收齐数字格式再回头算下标。
 */
const LINK_STYLE = 2
const FIRST_FORMAT_STYLE = 3

interface StyleTable {
  /** 每列对应的 cellXfs 下标 */
  columnStyles: number[]
  xml: string
}

/**
 * 生成 styles.xml：0 号常规、1 号表头（加粗 + 浅底），
 * 之后按列上出现过的数字格式各建一个（相同格式复用同一个 xf），
 * 最后一个是超链接样式（蓝色下划线，与 Excel 内置「超链接」样式同色）。
 */
function buildStyles(columns: XlsxColumn[]): StyleTable {
  const codes: string[] = []
  const columnStyles = columns.map((column) => {
    if (column.format === 'link') return LINK_STYLE
    const code = numberFormatCode(column)
    if (!code) return 0
    let index = codes.indexOf(code)
    if (index < 0) index = codes.push(code) - 1
    return FIRST_FORMAT_STYLE + index
  })

  const numFmts = codes.length
    ? `<numFmts count="${codes.length}">${codes
        .map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapeXml(code)}"/>`)
        .join('')}</numFmts>`
    : ''
  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    /*
     * 超链接样式带 wrapText：Excel 只在右边相邻单元格是空的时候才让文字溢出去显示，
     * 一条订阅链接能横跨好几列。开了自动换行就只在本列内排版，再配合把行高钉死
     * （见 ROW_HEIGHT），超出的部分直接被裁掉 ——
     * 单元格里仍是完整地址，编辑栏能看到、复制出来也是全的。
     * 顶对齐：行高裁字时让第一行完整显示，从上往下裁比居中裁两头好读。
     */
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>',
    ...codes.map(
      (_code, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
    )
  ]

  const xml =
    `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    numFmts +
    /*
     * 0 号正文、1 号表头（加粗）、2 号超链接（蓝色下划线）。
     * 颜色写死成 rgb 而不是 theme="1"：包里没有 theme 部件，引用主题色属于悬空引用。
     */
    '<fonts count="3">' +
    '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'

  return { columnStyles, xml }
}

function cellXml(
  ref: string,
  styleIndex: number,
  value: XlsxCellValue,
  format?: XlsxColumn['format']
): string {
  const style = styleIndex > 0 ? ` s="${styleIndex}"` : ''
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    const numeric = format === 'datetime' ? excelSerial(value) : value
    return `<c r="${ref}"${style}><v>${numeric}</v></c>`
  }
  // 字符串走 inlineStr，避免维护 sharedStrings 表
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

/** Excel 的超链接长度上限是 2079 字符，更长的只保留文本，免得整份文件被判定需要修复 */
const MAX_LINK_LENGTH = 2079

/** 超链接列里可以挂成链接的单元格：只认 http(s) 地址 */
function isLinkable(value: XlsxCellValue): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value) && value.length <= MAX_LINK_LENGTH
}

interface SheetLink {
  ref: string
  /** 关系里的地址，不含 # 之后的片段 */
  target: string
  /** # 之后的片段，放在 hyperlink 的 location 属性上 */
  location?: string
}

/**
 * 收集 link 列里的超链接，顺序即关系 id（rId1、rId2…）。
 *
 * 带 # 片段的地址必须拆开：关系的 Target 只放 # 之前的部分，片段走 hyperlink 的
 * location 属性 —— 这也是 Excel 自己的写法。整条塞进 Target 的话，Excel 打开时
 * 会判定内容有问题并「修复」，修复的做法就是把这一列的超链接全部丢掉。
 * Stripe 的结算链接正好带一长串 # 片段，所以这里必须拆。
 */
function collectLinks(sheet: XlsxSheet): SheetLink[] {
  const links: SheetLink[] = []
  sheet.columns.forEach((column, i) => {
    if (column.format !== 'link') return
    const letter = columnLetter(i)
    sheet.rows.forEach((row, rowIndex) => {
      const value = row[i]
      if (!isLinkable(value)) return
      const hash = value.indexOf('#')
      links.push({
        ref: `${letter}${rowIndex + 2}`,
        target: hash < 0 ? value : value.slice(0, hash),
        location: hash < 0 ? undefined : value.slice(hash + 1)
      })
    })
  })
  return links
}

function buildWorksheet(sheet: XlsxSheet, columnStyles: number[], links: SheetLink[]): string {
  const { columns, rows } = sheet
  // 列字母只跟列号有关：先算一遍，几千行 × 十几列就不必反复推算
  const letters = columns.map((_c, i) => columnLetter(i))
  const dimension = `A1:${letters[letters.length - 1] ?? 'A'}${rows.length + 1}`

  const cols = columns.some((c) => c.width)
    ? `<cols>${columns
        .map(
          (c, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 12}" customWidth="1"/>`
        )
        .join('')}</cols>`
    : ''

  const header = `<row r="1"${ROW_HEIGHT_ATTR}>${columns
    .map((c, i) => cellXml(`${letters[i]}1`, 1, c.title))
    .join('')}</row>`

  const body = rows
    .map((row, rowIndex) => {
      const r = rowIndex + 2
      const cells = columns
        .map((column, i) =>
          cellXml(`${letters[i]}${r}`, columnStyles[i], row[i] ?? null, column.format)
        )
        .join('')
      return `<row r="${r}"${ROW_HEIGHT_ATTR}>${cells}</row>`
    })
    .join('')

  return (
    `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dimension}"/>` +
    // 冻结首行，长表格滚动时表头不跑
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetFormatPr defaultRowHeight="${ROW_HEIGHT}" customHeight="1"/>` +
    cols +
    `<sheetData>${header}${body}</sheetData>` +
    (rows.length ? `<autoFilter ref="${dimension}"/>` : '') +
    // 按 OOXML 规定 hyperlinks 必须排在 autoFilter 之后
    (links.length
      ? `<hyperlinks>${links
          .map(
            (link, i) =>
              `<hyperlink ref="${link.ref}" r:id="rId${i + 1}"${link.location ? ` location="${escapeXml(link.location)}"` : ''}/>`
          )
          .join('')}</hyperlinks>`
      : '') +
    '</worksheet>'
  )
}

/**
 * 通用 zip 打包，供「分割导出」把多个文件装进一个压缩包。
 * 复用 xlsx 那套 ZIP 实现，不为此再引一个压缩库。
 */
export function buildZip(files: { name: string; content: string | Buffer }[]): Buffer {
  return zip(files)
}

/** 把一张表渲染成 xlsx 文件内容 */
export function buildXlsx(sheet: XlsxSheet): Buffer {
  const { columnStyles, xml: styles } = buildStyles(sheet.columns)
  const name = safeSheetName(sheet.name)
  const links = collectLinks(sheet)

  // 超链接的目标地址放在工作表自己的关系文件里（外部链接）
  const sheetRels = links.length
    ? [
        {
          name: 'xl/worksheets/_rels/sheet1.xml.rels',
          content:
            `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            links
              .map(
                (link, i) =>
                  `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(link.target)}" TargetMode="External"/>`
              )
              .join('') +
            '</Relationships>'
        }
      ]
    : []

  return zip([
    {
      name: '[Content_Types].xml',
      content:
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'
    },
    {
      name: '_rels/.rels',
      content:
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    },
    {
      name: 'xl/workbook.xml',
      content:
        `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>'
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    },
    { name: 'xl/styles.xml', content: styles },
    { name: 'xl/worksheets/sheet1.xml', content: buildWorksheet(sheet, columnStyles, links) },
    ...sheetRels
  ])
}
