'use strict';
/* ==========================================================================
   MI-CHACRA · Archivos: Excel (.xlsx), PDF (impresión) y compartir
   Todo se genera dentro del celular, sin internet ni librerías externas.
   ========================================================================== */

/* ---------- ZIP sin compresión (lo que necesita un .xlsx) ---------- */
const CRC_TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLA[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipSinCompresion(archivos) {
  const enc = new TextEncoder(), partes = [], centrales = [];
  let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre), datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos, crc = crc32(datos);
    const cab = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0)]);
    partes.push(cab, nombre, datos);
    centrales.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length),
      ...u16(nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nombre);
    offset += cab.length + nombre.length + datos.length;
  }
  const tamCentral = centrales.reduce((s, p) => s + p.length, 0);
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamCentral), ...u32(offset), ...u16(0)]);
  const todo = [...partes, ...centrales, fin];
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0; for (const p of todo) { out.set(p, i); i += p.length; }
  return out;
}

/* ---------- Excel ----------
   hojas: [{ nombre, titulo?, columnas: [{t, tipo: 'texto'|'num'|'soles'|'fecha', ancho?}], filas: [[...]], total?: [...] }] */
const xmlEsc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
function colLetra(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function crearXlsx(hojas) {
  const nombres = [];
  const limpio = n => { let b = String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Hoja'; let x = b, k = 2; while (nombres.includes(x.toLowerCase())) x = b.slice(0, 28) + ' ' + k++; nombres.push(x.toLowerCase()); return x; };
  const hojasXml = hojas.map(h => {
    // estilos: 0 normal, 1 negrita, 2 soles, 3 negrita soles, 4 título, 5 número, 6 negrita número
    const filas = [];
    let r = 1;
    const celda = (c, i, v, tipo, neg) => {
      const ref = colLetra(i) + r;
      if (v === null || v === undefined || v === '') return '';
      if ((tipo === 'soles' || tipo === 'num') && typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '" s="' + (tipo === 'soles' ? (neg ? 3 : 2) : (neg ? 6 : 5)) + '"><v>' + v + '</v></c>';
      if (tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = v.split('-').reverse().join('/');
      return '<c r="' + ref + '" t="inlineStr" s="' + (neg ? 1 : 0) + '"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
    };
    if (h.titulo) { filas.push('<row r="' + r + '"><c r="A' + r + '" t="inlineStr" s="4"><is><t>' + xmlEsc(h.titulo) + '</t></is></c></row>'); r += 2; }
    filas.push('<row r="' + r + '">' + h.columnas.map((c, i) => celda(c, i, c.t, 'texto', true)).join('') + '</row>'); r++;
    for (const f of h.filas) { filas.push('<row r="' + r + '">' + f.map((v, i) => celda(null, i, v, h.columnas[i] && h.columnas[i].tipo)).join('') + '</row>'); r++; }
    if (h.total) { filas.push('<row r="' + r + '">' + h.total.map((v, i) => celda(null, i, v, h.columnas[i] && h.columnas[i].tipo, true)).join('') + '</row>'); r++; }
    const anchos = h.columnas.map((c, i) => {
      const largo = Math.max(String(c.t).length, ...h.filas.slice(0, 200).map(f => String(f[i] === undefined || f[i] === null ? '' : f[i]).length));
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(50, Math.max(8, c.ancho || largo + 3)) + '" customWidth="1"/>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + (h.titulo ? 3 : 1) + '" topLeftCell="A' + (h.titulo ? 4 : 2) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<cols>' + anchos + '</cols><sheetData>' + filas.join('') + '</sheetData></worksheet>';
  });
  const nombresHojas = hojas.map(h => limpio(h.nombre));
  const archivos = [
    { nombre: '[Content_Types].xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      hojas.map((h, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
    { nombre: '_rels/.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      nombresHojas.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas.map((h, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nombre: 'xl/styles.xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;S/&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.##"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1F7A4D"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F2EA"/></patternFill></fill></fills>' +
      '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="2" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="1" fillId="2" borderId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
  ].concat(hojasXml.map((x, i) => ({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', datos: x })));
  return zipSinCompresion(archivos);
}

function aBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Guarda un archivo (el usuario elige dónde) o lo comparte (WhatsApp, Drive, correo…). */
function entregarArchivo(bytes, nombre, mime, compartir) {
  if (NATIVO && Android.guardarArchivo) {
    const b64 = aBase64(bytes);
    if (compartir) Android.compartirArchivo(b64, nombre, mime); else Android.guardarArchivo(b64, nombre, mime);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
  a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- PDF: documento HTML que Android imprime o guarda como PDF ---------- */
function htmlInforme(inf) {
  const ch = DB.get('chacras', DB.chacraId);
  const v = (x, tipo) => x === null || x === undefined || x === '' ? '' : tipo === 'soles' && typeof x === 'number' ? soles(x) : tipo === 'num' && typeof x === 'number' ? cant(x) : tipo === 'fecha' && /^\d{4}-/.test(x) ? fecha(x) : esc(x);
  const tabla = t => '<h2>' + esc(t.nombre) + '</h2><table><thead><tr>' + t.columnas.map(c => '<th class="' + (c.tipo === 'soles' || c.tipo === 'num' ? 'n' : '') + '">' + esc(c.t) + '</th>').join('') + '</tr></thead><tbody>' +
    (t.filas.length ? t.filas.map(f => '<tr>' + f.map((x, i) => '<td class="' + (['soles', 'num'].includes((t.columnas[i] || {}).tipo) ? 'n' : '') + '">' + v(x, (t.columnas[i] || {}).tipo) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + t.columnas.length + '">Sin datos</td></tr>') +
    '</tbody>' + (t.total ? '<tfoot><tr>' + t.total.map((x, i) => '<td class="' + (['soles', 'num'].includes((t.columnas[i] || {}).tipo) ? 'n' : '') + '">' + v(x, (t.columnas[i] || {}).tipo) + '</td>').join('') + '</tr></tfoot>' : '') + '</table>';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(inf.titulo) + '</title><style>' +
    '@page{size:A4;margin:14mm}body{font:11px/1.4 Arial,sans-serif;color:#16201A}h1{font-size:18px;margin:0;color:#1F7A4D}h2{font-size:13px;margin:16px 0 6px}' +
    '.sub{color:#5E6B63;margin:2px 0 10px}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}th{background:#E4F2EA;text-align:left;padding:5px;font-size:10px}' +
    'td{padding:4px 5px;border-bottom:1px solid #E3E8E4}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;background:#F0F3F1}.pie{margin-top:18px;color:#8A968F;font-size:9px}</style></head><body>' +
    '<h1>' + esc(inf.titulo) + '</h1><div class="sub">' + esc((ch ? ch.nombre + ' · ' + (ch.ubicacion || '') + ' · ' : '') + (inf.sub || '')) + '</div>' +
    inf.tablas.map(tabla).join('') + '<div class="pie">Generado con MI-CHACRA el ' + fechaHora(Date.now()) + '</div></body></html>';
}
function imprimirInforme(inf) {
  const html = htmlInforme(inf);
  const nombre = 'MI-CHACRA ' + inf.titulo;
  if (NATIVO && Android.imprimir) { Android.imprimir(html, nombre); return; }
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para imprimir', 'error');
  w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
}
