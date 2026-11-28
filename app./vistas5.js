'use strict';
/* ==========================================================================
   MI-CHACRA · Etapa 4: informes (pantalla, Excel y PDF)
   ========================================================================== */

const T = (t, tipo, ancho) => ({ t, tipo: tipo || 'texto', ancho });
const cantTxt = regs => resumenCantidades(regs).map(c => plural(c.cantidad, c.unidad) + ' ' + c.cultivo.toLowerCase()).join(', ');

const INFORMES = [
  { id: 'pagos', t: 'Planilla de pagos', d: 'Lo ganado, adelantos, pagos y saldo de cada trabajador', permiso: 'montos', filtro: 'periodo', icono: 'billetera',
    gen: f => {
      const filas = trabajadoresChacra(true).map(t => {
        const L = DB.liquidacion(t.id, DB.chacraId, f.desde, f.hasta);
        const dias = DB.diasTrabajados(t.id, DB.chacraId, f.desde, f.hasta);
        return { t, L, dias };
      }).filter(x => x.dias || x.L.saldo || x.L.anterior || x.L.pagos || x.L.adelantos);
      const cols = [T('N°'), T('Trabajador'), T('Celular'), T('Días', 'num'), T('Cosechó'), T('Jornales y tareas', 'soles'), T('Cosecha', 'soles'), T('Saldo anterior', 'soles'),
        T('Bonos', 'soles'), T('Adelantos', 'soles'), T('Descuentos', 'soles'), T('Pagado', 'soles'), T('Saldo', 'soles')];
      const rows = filas.map(({ t, L, dias }) => [t.codigo || '', t.nombre, t.celular || '', dias, cantTxt(L.cosechas), sumar(L.trabajos, r => r.total), sumar(L.cosechas, r => r.total), L.anterior, L.bonos, L.adelantos, L.descuentos, L.pagos, L.saldo]);
      const tot = ['', 'TOTAL', '', ''].concat([4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => i === 4 ? '' : sumar(rows, r => r[i])));
      return { titulo: 'Planilla de pagos', sub: 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), tablas: [{ nombre: 'Planilla', columnas: cols, filas: rows, total: tot }] };
    } },
  { id: 'productividad', t: 'Productividad por trabajador', d: 'Días, cantidad cosechada y promedio por día', permiso: 'montos', filtro: 'periodo', icono: 'personas',
    gen: f => {
      const princ = resumenCantidades(DB.deChacra('cosechas').filter(r => r.fecha >= f.desde && r.fecha <= f.hasta))[0];
      const rows = trabajadoresChacra(true).map(t => {
        const g = DB.ganancias(t.id, DB.chacraId, f.desde, f.hasta);
        const dias = DB.diasTrabajados(t.id, DB.chacraId, f.desde, f.hasta);
        const q = princ ? sumar(g.cosechas.filter(r => nomC(r.cultivoId) === princ.cultivo && r.unidad === princ.unidad), r => r.cantidad) : 0;
        const merma = sumar(g.cosechas, r => r.merma);
        const diasCos = new Set(g.cosechas.map(r => r.fecha)).size;
        return [t.nombre, dias, diasCos, q, merma, diasCos ? r2(q / diasCos) : 0, sumar(g.trabajos, r => r.total) + sumar(g.cosechas, r => r.total)];
      }).filter(r => r[1]).sort((a, b) => b[3] - a[3]);
      const u = princ ? pluralU(princ.unidad) : 'unidades';
      return { titulo: 'Productividad por trabajador', sub: 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta) + (princ ? ' · ' + princ.cultivo + ' en ' + u : ''),
        tablas: [{ nombre: 'Productividad', columnas: [T('Trabajador'), T('Días trabajados', 'num'), T('Días de cosecha', 'num'), T('Cosechado (' + u + ')', 'num'), T('Merma', 'num'), T(u + ' por día', 'num'), T('Ganado', 'soles')],
          filas: rows, total: ['TOTAL', '', '', sumar(rows, r => r[3]), sumar(rows, r => r[4]), '', sumar(rows, r => r[6])] }] };
    } },
  { id: 'cosecha', t: 'Cosecha por día', d: 'Cantidad por día, parcela y cultivo', permiso: 'cosecha', filtro: 'periodo', icono: 'canasta',
    gen: f => {
      const g = {};
      for (const r of DB.deChacra('cosechas').filter(r => r.fecha >= f.desde && r.fecha <= f.hasta)) {
        const k = r.fecha + '|' + (r.parcelaId || '') + '|' + r.cultivoId + '|' + r.unidad;
        (g[k] = g[k] || []).push(r);
      }
      const m = DB.puede('montos');
      const rows = Object.keys(g).sort().map(k => { const rs = g[k], [fe, p, c, u] = k.split('|'); const fila = [fe, nomP(p) || '—', nomC(c), u, sumar(rs, r => r.cantidad), sumar(rs, r => r.merma), new Set(rs.map(r => r.trabajadorId)).size]; if (m) fila.push(sumar(rs, r => r.total)); return fila; });
      const cols = [T('Fecha', 'fecha'), T('Parcela'), T('Cultivo'), T('Unidad'), T('Cantidad', 'num'), T('Merma', 'num'), T('Cosechadores', 'num')].concat(m ? [T('Pago', 'soles')] : []);
      return { titulo: 'Cosecha por día', sub: 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), tablas: [{ nombre: 'Cosecha', columnas: cols, filas: rows, total: ['TOTAL', '', '', '', sumar(rows, r => r[4]), sumar(rows, r => r[5]), ''].concat(m ? [sumar(rows, r => r[7])] : []) }] };
    } },
  { id: 'campania', t: 'Resultado de la campaña', d: 'Ingresos, costos, ganancia, por parcela y comparación', permiso: 'finanzas', filtro: 'campania', icono: 'bandera',
    gen: f => {
      const camp = DB.get('campanias', f.campaniaId), R = DB.resultado(camp.id);
      const resumen = [['Ventas de cosecha', R.ventas], ['Otros ingresos', R.otros], ['INGRESOS', R.ingresos], ['Mano de obra: jornales y tareas', -R.jornales], ['Mano de obra: cosecha', -R.cosechaPago],
        ['Contratas', -R.contratas], ['Gastos', -R.gastos], ['Inversión asignada', -R.inversion], ['COSTOS', -R.costos], ['GANANCIA', R.ganancia], ['Por cobrar de las ventas', R.porCobrar]];
      const prod = resumenCantidades(R.listas.cosechas).map(c => ['Cosechado: ' + c.cultivo, c.cantidad, c.unidad]);
      if (prod.length === 1 && prod[0][1]) prod.push(['Costo por ' + prod[0][2] + ' cosechada', r2(R.costos / prod[0][1]), 'S/']);
      for (const v of resumenVentas(R.listas.ventas)) prod.push(['Vendido: ' + v.cultivo + (v.estado ? ' ' + v.estado.toLowerCase() : '') + ' (precio prom. S/ ' + v.prom.toFixed(2) + ')', v.cantidad, v.unidad]);
      const parc = parcelasChacra().map(p => { const x = DB.resultado(camp.id, p.id); const q = resumenCantidades(x.listas.cosechas)[0]; return [p.nombre, p.cuadras || '', q ? q.cantidad : 0, q ? q.unidad : '', x.ingresos, x.costos, x.ganancia, p.cuadras ? r2(x.ganancia / p.cuadras) : '']; });
      const comp = DB.campaniasOrdenadas().map(c => { const x = DB.resultado(c.id); return [c.nombre, x.ingresos, x.costos, x.ganancia, x.rentabilidad === null ? '' : x.rentabilidad]; });
      return { titulo: 'Resultado de ' + camp.nombre, sub: 'Desde el ' + fecha(camp.inicio) + (camp.cerrada ? ' (cerrada)' : ' · hasta hoy') + (R.rentabilidad !== null ? ' · rentabilidad ' + R.rentabilidad + '%' : ''), tablas: [
        { nombre: 'Resumen', columnas: [T('Concepto'), T('Monto', 'soles')], filas: resumen },
        { nombre: 'Producción', columnas: [T('Concepto'), T('Cantidad', 'num'), T('Unidad')], filas: prod },
        { nombre: 'Por parcela', columnas: [T('Parcela'), T('Cuadras', 'num'), T('Cosechado', 'num'), T('Unidad'), T('Ingresos', 'soles'), T('Costos', 'soles'), T('Ganancia', 'soles'), T('Ganancia por cuadra', 'soles')], filas: parc },
        { nombre: 'Campañas', columnas: [T('Campaña'), T('Ingresos', 'soles'), T('Costos', 'soles'), T('Ganancia', 'soles'), T('Rentabilidad %', 'num')], filas: comp },
      ] };
    } },
  { id: 'ventas', t: 'Ventas', d: 'Cada venta con cliente, precio, cobrado y saldo', permiso: 'finanzas', filtro: 'campania', icono: 'dinero',
    gen: f => {
      const vs = DB.deChacra('ventas').filter(v => v.campaniaId === f.campaniaId).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const rows = vs.map(v => [v.fecha, nomCli(v.clienteId), nomC(v.cultivoId), v.estado || '', v.cantidad, v.unidad, v.precio, v.total, DB.cobradoVenta(v), DB.saldoVenta(v), v.vence || '']);
      return { titulo: 'Ventas', sub: (DB.get('campanias', f.campaniaId) || {}).nombre, tablas: [{ nombre: 'Ventas',
        columnas: [T('Fecha', 'fecha'), T('Cliente'), T('Cultivo'), T('Estado'), T('Cantidad', 'num'), T('Unidad'), T('Precio', 'soles'), T('Total', 'soles'), T('Cobrado', 'soles'), T('Saldo', 'soles'), T('Cobrar hasta', 'fecha')],
        filas: rows, total: ['TOTAL', '', '', '', '', '', '', sumar(rows, r => r[7]), sumar(rows, r => r[8]), sumar(rows, r => r[9]), ''] }] };
    } },
  { id: 'gastos', t: 'Gastos', d: 'Gastos por categoría, proveedor y parcela', permiso: 'finanzas', filtro: 'campania', icono: 'boleta',
    gen: f => {
      const gs = DB.deChacra('gastos').filter(g => g.campaniaId === f.campaniaId).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const rows = gs.map(g => [g.fecha, g.categoria, g.descripcion, g.proveedor || '', nomP(g.parcelaId), g.monto, g.pagado === false ? 'Por pagar' : 'Pagado']);
      const cat = {}; for (const g of gs) cat[g.categoria] = (cat[g.categoria] || 0) + g.monto;
      return { titulo: 'Gastos', sub: (DB.get('campanias', f.campaniaId) || {}).nombre, tablas: [
        { nombre: 'Por categoría', columnas: [T('Categoría'), T('Monto', 'soles')], filas: Object.keys(cat).sort((a, b) => cat[b] - cat[a]).map(k => [k, r2(cat[k])]), total: ['TOTAL', sumar(gs, g => g.monto)] },
        { nombre: 'Detalle de gastos', columnas: [T('Fecha', 'fecha'), T('Categoría'), T('Descripción'), T('Proveedor'), T('Parcela'), T('Monto', 'soles'), T('Estado')], filas: rows, total: ['TOTAL', '', '', '', '', sumar(rows, r => r[5]), ''] },
      ] };
    } },
  { id: 'quimicos', t: 'Registro de aplicaciones', d: 'Abonos y químicos usados (para compradores y certificadoras)', permiso: 'campo', filtro: 'periodo', icono: 'hoja',
    gen: f => {
      const xs = DB.deChacra('aplicaciones').filter(a => a.fecha >= f.desde && a.fecha <= f.hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const rows = xs.map(a => [a.fecha, nomP(a.parcelaId), a.producto, tipoP(a.tipo), a.dosis || '', a.cantidad || '', a.unidad || '', a.forma || '', a.aplicadoPor ? nomT(a.aplicadoPor) : '', a.carencia || '', a.carencia ? sumarDias(a.fecha, a.carencia) : '']);
      return { titulo: 'Registro de aplicaciones de abonos y químicos', sub: 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), tablas: [{ nombre: 'Aplicaciones',
        columnas: [T('Fecha', 'fecha'), T('Parcela'), T('Producto'), T('Tipo'), T('Dosis'), T('Cantidad', 'num'), T('Unidad'), T('Forma'), T('Aplicado por'), T('Carencia (días)', 'num'), T('Cosechar desde', 'fecha')], filas: rows }] };
    } },
  { id: 'caja', t: 'Flujo de caja', d: 'Dinero que entró y salió, movimiento por movimiento', permiso: 'finanzas', filtro: 'periodo', icono: 'dinero',
    gen: f => {
      const xs = DB.caja(DB.chacraId, f.desde, f.hasta);
      let saldo = 0;
      const rows = xs.map(x => { saldo = r2(saldo + x.monto); return [x.fecha, x.concepto, x.grupo, x.monto > 0 ? x.monto : '', x.monto < 0 ? -x.monto : '', saldo]; });
      return { titulo: 'Flujo de caja', sub: 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), tablas: [{ nombre: 'Caja', columnas: [T('Fecha', 'fecha'), T('Concepto'), T('Tipo'), T('Entró', 'soles'), T('Salió', 'soles'), T('Acumulado', 'soles')],
        filas: rows, total: ['TOTAL', '', '', sumar(xs.filter(x => x.monto > 0), x => x.monto), -sumar(xs.filter(x => x.monto < 0), x => x.monto), saldo] }] };
    } },
];

/* ---------- Pantalla ---------- */
const EI = { id: null, periodo: 'mes', desde: '', hasta: '', campaniaId: '' };
function filtroInforme() {
  const hoy = HOY(), d = new Date(hoy + 'T12:00:00');
  let desde, hasta = hoy;
  if (EI.periodo === 'semana') ({ desde, hasta } = DB.semana(hoy));
  else if (EI.periodo === 'pasada') ({ desde, hasta } = DB.semana(sumarDias(DB.semana(hoy).desde, -1)));
  else if (EI.periodo === 'mes') { desde = fechaISO(new Date(d.getFullYear(), d.getMonth(), 1)); hasta = fechaISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  else if (EI.periodo === 'campania') { const c = DB.campaniaActiva(); desde = c ? c.inicio : fechaISO(new Date(d.getFullYear(), 0, 1)); }
  else { desde = EI.desde || DB.semana(hoy).desde; hasta = EI.hasta || hoy; }
  let campaniaId = EI.campaniaId && DB.get('campanias', EI.campaniaId) && DB.get('campanias', EI.campaniaId).chacraId === DB.chacraId ? EI.campaniaId : '';
  if (!campaniaId) { const c = DB.campaniaActiva() || DB.campaniasOrdenadas().slice(-1)[0]; campaniaId = c ? c.id : ''; }
  return { desde, hasta, campaniaId };
}
const informesVisibles = () => INFORMES.filter(i => DB.puede(i.permiso));
VISTAS.informes = id => {
  EI.id = id || null;
  const vis = informesVisibles();
  if (!vis.length) return { titulo: 'Informes', html: vacio('candado', 'No tienes informes disponibles') };
  const inf = vis.find(i => i.id === EI.id);
  if (!inf) {
    let h = '<div class="lista">' + vis.map(i => '<div class="fila" data-act="abrirInforme" data-id="' + i.id + '">' + ico(i.icono) + '<div class="cuerpo-f"><div class="t">' + esc(i.t) + '</div><div class="d" style="white-space:normal">' + esc(i.d) + '</div></div>' + ico('der', 's') + '</div>').join('') + '</div>';
    if (DB.puede('finanzas')) h += '<div class="card"><h3>Excel completo de la campaña</h3><p class="small muted" style="margin:0 0 10px">Un solo archivo con todas las hojas: planilla, productividad, cosecha, resultado, ventas, gastos, aplicaciones y caja.</p>' +
      '<div class="btns"><button class="btn pri" data-act="excelCompleto">' + ico('descargar') + 'Guardar Excel</button><button class="btn" data-act="excelCompleto" data-compartir="1">' + ico('compartir') + 'Compartir</button></div></div>';
    return { titulo: 'Informes', html: h, atras: true };
  }
  const f = filtroInforme();
  let res;
  try { res = inf.gen(f); } catch (e) { console.error(e); return { titulo: inf.t, atras: true, html: vacio('alerta', 'No se pudo generar el informe', '<p class="small faint">' + esc(e.message) + '</p>') }; }
  let h = '';
  if (inf.filtro === 'periodo') {
    h += '<div class="chips-h">' + [['semana', 'Esta semana'], ['pasada', 'Semana pasada'], ['mes', 'Este mes'], ['campania', 'Campaña'], ['otro', 'Elegir fechas']].map(([k, t]) =>
      '<button class="' + (EI.periodo === k ? 'on' : '') + '" data-act="periodoInf" data-p="' + k + '">' + t + '</button>').join('') + '</div>';
    if (EI.periodo === 'otro') h += '<div class="fila2" style="margin-bottom:12px"><input class="inp" type="date" data-inf="desde" value="' + f.desde + '"><input class="inp" type="date" data-inf="hasta" value="' + f.hasta + '"></div>';
  } else {
    h += '<div class="campo"><select class="inp" data-inf="campaniaId">' + opsCampanias().map(o => '<option value="' + o.v + '"' + (o.v === f.campaniaId ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></div>';
  }
  h += '<div class="btns" style="margin-bottom:12px"><button class="btn pri" data-act="infExcel">' + ico('descargar') + 'Excel</button><button class="btn" data-act="infPdf">' + ico('boleta') + 'PDF</button>' +
    '<button class="btn" data-act="infExcel" data-compartir="1">' + ico('compartir') + 'Compartir</button></div>';
  h += '<p class="small muted" style="margin:0 0 8px">' + esc(res.sub || '') + '</p>';
  for (const t of res.tablas) {
    h += '<div class="grupo">' + esc(t.nombre) + '</div><div class="card" style="padding:0;overflow-x:auto"><table class="tabla rep"><thead><tr>' + t.columnas.map(c => '<th class="' + (['soles', 'num'].includes(c.tipo) ? 'm' : '') + '">' + esc(c.t) + '</th>').join('') + '</tr></thead><tbody>' +
      (t.filas.length ? t.filas.slice(0, 300).map(r => '<tr>' + r.map((x, i) => '<td class="' + (['soles', 'num'].includes((t.columnas[i] || {}).tipo) ? 'm' : '') + '">' + celdaInf(x, (t.columnas[i] || {}).tipo) + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + t.columnas.length + '" class="muted">Sin datos en este período</td></tr>') + '</tbody>' +
      (t.total ? '<tfoot><tr>' + t.total.map((x, i) => '<td class="' + (['soles', 'num'].includes((t.columnas[i] || {}).tipo) ? 'm' : '') + '"><b>' + celdaInf(x, (t.columnas[i] || {}).tipo) + '</b></td>').join('') + '</tr></tfoot>' : '') + '</table></div>';
    if (t.filas.length > 300) h += '<p class="small muted">Se muestran 300 de ' + t.filas.length + ' filas. El Excel y el PDF tienen todas.</p>';
  }
  return {
    titulo: inf.t, atras: true, html: h,
    despues: root => $$('[data-inf]', root).forEach(el => el.addEventListener('change', () => { EI[el.dataset.inf] = el.value; render(); })),
  };
};
function celdaInf(x, tipo) {
  if (x === null || x === undefined || x === '') return '';
  if (tipo === 'soles' && typeof x === 'number') return soles(x);
  if (tipo === 'num' && typeof x === 'number') return cant(x);
  if (tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(x)) return fecha(x);
  return esc(x);
}
ACC.abrirInforme = el => { EI.id = el.dataset.id; ir('informes/' + EI.id); };
ACC.periodoInf = el => { EI.periodo = el.dataset.p; render(); };
const nombreArchivo = t => 'MI-CHACRA ' + t.replace(/[^\wáéíóúñÁÉÍÓÚÑ ]+/g, '').trim() + ' ' + HOY() + '.xlsx';
ACC.infExcel = el => {
  const inf = INFORMES.find(i => i.id === EI.id), res = inf.gen(filtroInforme());
  const hojas = res.tablas.map(t => ({ nombre: t.nombre, titulo: res.titulo + (res.sub ? ' · ' + res.sub : ''), columnas: t.columnas, filas: t.filas, total: t.total }));
  entregarArchivo(crearXlsx(hojas), nombreArchivo(res.titulo), MIME_XLSX, !!el.dataset.compartir);
};
ACC.infPdf = () => { const inf = INFORMES.find(i => i.id === EI.id); imprimirInforme(inf.gen(filtroInforme())); };
ACC.excelCompleto = el => {
  const c = DB.campaniaActiva() || DB.campaniasOrdenadas().slice(-1)[0];
  if (!c) return toast('No hay campañas', 'error');
  const f = { desde: c.inicio, hasta: HOY(), campaniaId: c.id };
  const hojas = [];
  for (const inf of informesVisibles()) {
    const res = inf.gen(f);
    for (const t of res.tablas) hojas.push({ nombre: res.tablas.length > 1 ? inf.t.split(' ')[0] + ' - ' + t.nombre : inf.t, titulo: res.titulo + (res.sub ? ' · ' + res.sub : ''), columnas: t.columnas, filas: t.filas, total: t.total });
  }
  entregarArchivo(crearXlsx(hojas), nombreArchivo(c.nombre + ' completo'), MIME_XLSX, !!el.dataset.compartir);
};
