function ascii(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, '')
}

function escapePdf(value) {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrap(text, width) {
  const words = ascii(text).split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > width && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

export function downloadPurchaseOrderPdf(view) {
  const commands = []
  let y = 800
  const write = (text, size, bold = false) => {
    commands.push('BT')
    commands.push(`/${bold ? 'F2' : 'F1'} ${size} Tf`)
    commands.push(`48 ${y} Td`)
    commands.push(`(${escapePdf(text)}) Tj`)
    commands.push('ET')
    y -= size + 6
  }
  const gap = (n = 8) => {
    y -= n
  }

  write('HYDROFERRIC NIGERIA LIMITED', 11, true)
  write('Purchase order', 20, true)
  gap(4)
  write(view.number, 12, true)
  write(`Issued ${view.issued}`, 10)
  gap(8)
  write(`Supplier: ${view.supplier}`, 11, true)
  write(view.supplierAddress || 'Address on supplier file', 10)
  write(`Project: ${view.project}`, 11)
  write(`Site: ${view.site || '—'}`, 10)
  write(`Request: ${view.request}`, 10)
  write(`Quotation: ${view.quotation}`, 10)
  gap(8)
  write('Description', 10, true)
  for (const line of view.lines) {
    for (const row of wrap(`${line.qty} ${line.unit}  ${line.description}  NGN ${line.amount}`, 88)) {
      write(row, 10)
    }
  }
  gap(6)
  write(`Total  NGN ${view.total}`, 13, true)
  gap(8)
  write('Delivery terms', 10, true)
  for (const row of wrap(view.deliveryTerms || 'As agreed on the approved quotation.', 90)) write(row, 10)
  gap(8)
  for (const row of wrap(view.control, 90)) write(row, 9)
  gap(8)
  write(`Authorised through quotation approval by ${view.approver}.`, 10)
  write('This document is the controlled purchase order for the chain above.', 9)

  const stream = commands.join('\n')
  const objects = []
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n')
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n')
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj\n',
  )
  objects.push(`4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`)
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n')
  objects.push('6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n')

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(pdf.length)
    pdf += object
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const blob = new Blob([pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${view.number}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
