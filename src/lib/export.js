function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function escapeCsv(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function downloadCsv(filename, rows) {
  const list = rows.length ? rows : [{ Notice: 'No rows in the current filter' }]
  const headers = Object.keys(list[0])
  const lines = [
    headers.join(','),
    ...list.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ]
  download(filename, new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }))
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function downloadExcel(filename, rows) {
  const list = rows.length ? rows : [{ Notice: 'No rows in the current filter' }]
  const headers = Object.keys(list[0])
  const headerRow = `<Row>${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join('')}</Row>`
  const body = list
    .map(
      (row) =>
        `<Row>${headers
          .map((header) => `<Cell><Data ss:Type="String">${escapeXml(row[header])}</Data></Cell>`)
          .join('')}</Row>`,
    )
    .join('')
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Report"><Table>${headerRow}${body}</Table></Worksheet>
</Workbook>`
  download(filename.endsWith('.xls') ? filename : `${filename}.xls`, new Blob([xml], { type: 'application/vnd.ms-excel' }))
}

export function downloadJson(filename, data) {
  download(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
}
