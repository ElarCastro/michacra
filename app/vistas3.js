'use strict';
/* ==========================================================================
   MI-CHACRA · Etapa 2: ventas, clientes, gastos, inversión, ganancia,
   detalle de parcela, reportes y modo trabajador
   ========================================================================== */

const sinFinanzas = t => ({ titulo: t, atras: true, html: vacio('candado', 'Solo el administrador ve ventas, gastos y ganancia') });
const nomCli = id => { const c = id && DB.get('clientes', id); return c ? c.nombre : 'Sin cliente'; };
const opsCampanias = () => DB.campaniasOrdenadas().slice().reverse().map(c => ({ v: c.id, t: c.nombre + (c.cerrada ? ' (cerrada)' : '') }));
/** Barras horizontales: items [{l, v, d?}] */
function barras(items, fmt) {
  const max = Math.max(1, ...items.map(i => Math.abs(i.v)));
  return items.map(i => '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span>' + esc(i.l) + '</span><b class="num">' + (fmt ? fmt(i.v) : cant(i.v)) + '</b></div>' +
    '<div class="barra"><i style="width:' + Math.round(Math.abs(i.v) / max * 100) + '%;' + (i.color ? 'background:' + i.color : '') + '"></i></div>' + (i.d ? '<div class="tiny faint">' + esc(i.d) + '</div>' : '') + '</div>').join('');
}
/** Columnas verticales: items [{l, v}] */
function columnas(items, fmt) {
  const max = Math.max(1, ...items.map(i => i.v));
  return '<div style="display:flex;align-items:flex-end;gap:6px;height:130px;margin-top:6px">' + items.map(i =>
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">' +
    '<div class="tiny num" style="color:var(--muted);margin-bottom:2px">' + (i.v ? (fmt ? fmt(i.v) : cant(i.v)) : '') + '</div>' +
    '<div style="width:100%;max-width:38px;height:' + Math.max(2, Math.round(i.v / max * 100)) + '%;background:' + (i.v ? 'var(--green)' : 'var(--line)') + ';border-radius:6px 6px 0 0"></div></div>').join('') + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:4px">' + items.map(i => '<div class="tiny faint center" style="flex:1">' + esc(i.l) + '</div>').join('') + '</div>';
}
function precioPromedio(regs) { const c = sumar(regs, r => r.cantidad); return c ? r2(sumar(regs, r => r.total) / c) : 0; }
function resumenVentas(vs) {
  const g = {};
  for (const v of vs) { const k = v.cultivoId + '|' + (v.estado || '') + '|' + v.unidad; (g[k] = g[k] || []).push(v); }
  return Object.keys(g).map(k => { const [c, e, u] = k.split('|'); const rs = g[k]; return { cultivo: nomC(c), estado: e, unidad: u, cantidad: sumar(rs, r => r.cantidad), total: sumar(rs, r => r.total), prom: precioPromedio(rs) }; })
    .sort((a, b) => b.total - a.total);
}

/* ==========================================================================
   VENTAS
   ========================================================================== */
let filtroVentas = 'campania';
VISTAS.ventas = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Ventas');
  const camp = DB.campaniaActiva();
  const todas = DB.deChacra('ventas');
  const deCamp = todas.filter(v => camp && v.campaniaId === camp.id);
  let lista = filtroVentas === 'cobrar' ? todas.filter(v => DB.saldoVenta(v) > 0.004) : filtroVentas === 'todas' ? todas : deCamp;
  lista = lista.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const porCobrar = sumar(todas, v => DB.saldoVenta(v));
  const otros = camp ? sumar(DB.deChacra('ingresos').filter(i => i.campaniaId === camp.id), i => i.monto) : 0;
  let h = '<div class="kpis"><div class="kpi hero"><div class="l">Vendido en la campaña</div><div class="v">' + soles(sumar(deCamp, v => v.total)) + '</div><div class="s">' + deCamp.length + ' ventas' + (camp ? ' · ' + esc(camp.nombre) : '') + '</div></div>' +
    '<div class="kpi ' + (porCobrar > 0 ? 'tono-warn' : '') + '"><div class="l">Por cobrar</div><div class="v">' + soles(porCobrar) + '</div><div class="s">' + todas.filter(v => DB.saldoVenta(v) > 0.004).length + ' ventas con saldo</div></div></div>';
  const rs = resumenVentas(deCamp);
  if (rs.length) h += '<div class="card"><h3>Lo vendido en la campaña</h3><table class="tabla">' + rs.map(x =>
    '<tr><td>' + esc(x.cultivo) + (x.estado ? ' · ' + esc(x.estado) : '') + '<div class="tiny faint">' + plural(x.cantidad, x.unidad) + ' · prom. ' + soles(x.prom) + ' por ' + esc(x.unidad) + '</div></td><td class="m">' + soles(x.total) + '</td></tr>').join('') + '</table></div>';
  h += '<div class="btns" style="margin-bottom:12px"><a class="btn chico" href="#/clientes">' + ico('personas', 's') + 'Clientes</a><a class="btn chico" href="#/ingresos">' + ico('dinero', 's') + 'Otros ingresos' + (otros ? ' · ' + soles(otros) : '') + '</a></div>';
  h += '<div class="chips-h">' + [['campania', 'Esta campaña'], ['cobrar', 'Por cobrar'], ['todas', 'Todas']].map(([k, t]) =>
    '<button class="' + (filtroVentas === k ? 'on' : '') + '" data-act="filtroVentas" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  h += lista.length ? '<div class="lista">' + lista.map(filaVenta).join('') + '</div>' : vacio('dinero', 'No hay ventas aquí', '<p class="small">Registra cada venta de tu cosecha: café seco por kilo, café húmedo por lata, plátano por arroba…</p>');
  return { titulo: 'Ventas', html: h, fab: { t: 'Nueva venta', icono: 'mas', act: 'ventaNueva' } };
};
ACC.filtroVentas = el => { filtroVentas = el.dataset.f; render(); };
function filaVenta(v) {
  const s = DB.saldoVenta(v);
  return '<a class="fila" href="#/venta/' + v.id + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + esc(nomCli(v.clienteId)) + '</div><div class="d">' +
    fechaCorta(v.fecha) + ' · ' + esc(nomC(v.cultivoId)) + (v.estado ? ' ' + esc(v.estado.toLowerCase()) : '') + ' · ' + plural(v.cantidad, v.unidad) + ' × ' + soles(v.precio) + '</div></div>' +
    '<div class="x"><div class="t">' + soles(v.total) + '</div>' + (s > 0.004 ? pill('Debe ' + soles(s), 'warn') : pill('Cobrado', 'ok')) + '</div></a>';
}

function formVenta(v) {
  if (!puedeOToast('finanzas')) return;
  const nuevo = !v;
  if (!nuevo) { const b = DB.bloqueo(v); if (b) return toast(b, 'error'); }
  const cultivos = DB.todos('cultivos').filter(c => c.activo || (v && c.id === v.cultivoId));
  if (!cultivos.length) return toast('Activa al menos un cultivo', 'error');
  const estadosDe = id => { const c = DB.get('cultivos', id); return c && c.estados && c.estados.length ? c.estados : [{ nombre: '', unidades: (c ? c.unidadesCosecha : ['kg']) }]; };
  const unidadesDe = x => { const e = estadosDe(x.cultivoId).find(e => e.nombre === x.estado) || estadosDe(x.cultivoId)[0]; return e.unidades.length ? e.unidades : ['kg']; };
  const clave = x => 'venta:' + x.cultivoId + ':' + (x.estado || '') + ':' + x.unidad;
  const clientes = DB.todos('clientes').sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cobrado = v ? DB.cobradoVenta(v) : 0;
  const val = nuevo ? { fecha: HOY(), cultivoId: cultivos[0].id, cobro: 'contado', forma: 'Efectivo', clienteId: clientes.length ? '' : '_nuevo' } : Object.assign({}, v);
  if (nuevo) { val.estado = estadosDe(val.cultivoId)[0].nombre; val.unidad = unidadesDe(val)[0]; val.precio = DB.precio(clave(val)); }
  formulario({
    titulo: nuevo ? 'Nueva venta' : 'Corregir venta', valores: val,
    campos: [
      { id: 'clienteId', et: 'Cliente', tipo: 'select', req: true, ph: 'Elige un cliente', ops: clientes.map(c => ({ v: c.id, t: c.nombre })).concat([{ v: '_nuevo', t: '+ Nuevo cliente' }]) },
      { id: 'cliNombre', et: 'Nombre del cliente nuevo', tipo: 'texto', req: true, ver: x => x.clienteId === '_nuevo', ph: 'Acopiador, cooperativa…' },
      { id: 'cliCelular', et: 'Celular del cliente', tipo: 'tel', ver: x => x.clienteId === '_nuevo' },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true, par: true, valida: x => x > HOY() ? 'No puede ser futura' : '' },
      { id: 'cultivoId', et: 'Cultivo', tipo: 'select', req: true, ops: cultivos.map(c => ({ v: c.id, t: c.nombre })) },
      { id: 'estado', et: 'Estado del producto', tipo: 'seg', ops: x => estadosDe(x.cultivoId).map(e => ({ v: e.nombre, t: e.nombre || 'Único' })), ver: x => estadosDe(x.cultivoId)[0].nombre !== '' },
      { id: 'unidad', et: 'Se vende por', tipo: 'seg', req: true, ops: x => unidadesDe(x) },
      { id: 'nota_u', tipo: 'html', html: x => x.unidad === 'lata' ? '<div class="aviso tono-info small">' + ico('info', 's') + '<div>Por lata no se considera el peso.</div></div>' : '' },
      { id: 'cantidad', et: 'Cantidad', tipo: 'num', req: true, min: 0.01, par: true },
      { id: 'precio', et: 'Precio por unidad (S/)', tipo: 'num', req: true, min: 0.01, ayuda: 'El precio del día. Se sugiere el último usado.' },
      { id: 'total', tipo: 'calc', calc: x => '<span>Total de la venta</span><b>' + soles(r2((Number(x.cantidad) || 0) * (Number(x.precio) || 0))) + '</b>' },
      { id: 'parcelaId', et: 'Parcela de origen', tipo: 'select', ops: opsParcelas() },
      { id: 'cobro', et: 'Cobro', tipo: 'seg', req: true, ops: [{ v: 'contado', t: 'Contado' }, { v: 'credito', t: 'Crédito' }, { v: 'parcial', t: 'Parcial' }] },
      { id: 'cobradoInicial', et: 'Monto cobrado ahora (S/)', tipo: 'num', req: true, min: 0.01, ver: x => x.cobro === 'parcial',
        valida: (m, x) => m >= r2((Number(x.cantidad) || 0) * (Number(x.precio) || 0)) ? 'Si cobras todo, elige "Contado"' : '' },
      { id: 'forma', et: 'Forma de cobro', tipo: 'seg', ops: FORMAS_PAGO, ver: x => x.cobro !== 'credito' },
      { id: 'vence', et: 'Fecha para cobrar el saldo', tipo: 'fecha', ver: x => x.cobro !== 'contado', ayuda: 'La app te avisará ese día' },
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Ej. N° de guía, calidad, humedad' },
    ],
    alCambiar: (x, origen, h) => {
      if (['cultivoId', 'estado', 'unidad'].includes(origen)) {
        const p = DB.precio(clave(x)); const el = h.querySelector('[data-c="precio"]');
        if (el && p !== '') { el.value = p; x.precio = p; }
      }
    },
    eliminar: nuevo || !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar venta', 'Se quitará la venta de ' + soles(v.total) + ' a ' + esc(nomCli(v.clienteId)) + ' y sus cobros.', { si: 'Eliminar', peligro: true })) {
        for (const c of DB.deChacra('cobros').filter(c => c.ventaId === v.id)) DB.eliminar('cobros', c.id, 'Cobro de venta eliminada');
        DB.eliminar('ventas', v.id, 'Venta a ' + nomCli(v.clienteId) + ': ' + soles(v.total)); cerrarTodas(); ir('ventas');
      }
    },
    alGuardar: x => {
      const total = r2(x.cantidad * x.precio);
      const cobrosPost = nuevo ? 0 : r2(cobrado - (Number(v.cobradoInicial) || 0));
      if (!nuevo && total < cobrosPost) return 'El total no puede ser menor que lo ya cobrado (' + soles(cobrosPost) + ')';
      let clienteId = x.clienteId;
      if (clienteId === '_nuevo') clienteId = DB.crear('clientes', { nombre: x.cliNombre.trim(), celular: x.cliCelular || '', tipo: 'Otro' }, 'Nuevo cliente: ' + x.cliNombre).id;
      const d = { clienteId, fecha: x.fecha, cultivoId: x.cultivoId, estado: x.estado || '', unidad: x.unidad, cantidad: x.cantidad, precio: x.precio, total,
        parcelaId: x.parcelaId || '', cobro: x.cobro, forma: x.cobro === 'credito' ? '' : (x.forma || ''), nota: x.nota || '', vence: x.cobro === 'contado' ? '' : (x.vence || ''),
        cobradoInicial: x.cobro === 'contado' ? r2(total - cobrosPost) : x.cobro === 'parcial' ? x.cobradoInicial : 0 };
      DB.recordarPrecio(clave(x), x.precio);
      const tx = 'Venta a ' + nomCli(clienteId) + ': ' + plural(d.cantidad, d.unidad) + ' de ' + nomC(d.cultivoId) + ' = ' + soles(total);
      if (nuevo) { const camp = DB.campaniaActiva(); d.campaniaId = camp ? camp.id : null; const r = DB.crear('ventas', d, tx); toast('Venta registrada'); ir('venta/' + r.id); }
      else { DB.editar('ventas', v.id, d, tx); toast('Venta corregida'); render(); }
    },
  });
}
ACC.ventaNueva = () => formVenta(null);
ACC.ventaEditar = el => formVenta(DB.get('ventas', el.dataset.id));

VISTAS.venta = id => {
  const v = DB.get('ventas', id);
  if (!v || v.eliminado) return { titulo: 'Venta', atras: true, html: vacio('dinero', 'Esta venta no existe') };
  if (!DB.puede('finanzas')) return sinFinanzas('Venta');
  const cli = DB.get('clientes', v.clienteId);
  const cobrado = DB.cobradoVenta(v), saldo = DB.saldoVenta(v);
  const cobros = DB.deChacra('cobros').filter(c => c.ventaId === v.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  let h = '<div class="card"><div class="small muted">' + fecha(v.fecha) + (v.parcelaId ? ' · ' + esc(nomP(v.parcelaId)) : '') + '</div><h2 style="margin:4px 0 10px">' + esc(nomCli(v.clienteId)) + '</h2><table class="tabla">' +
    '<tr><td>' + esc(nomC(v.cultivoId)) + (v.estado ? ' · ' + esc(v.estado) : '') + '</td><td class="m">' + plural(v.cantidad, v.unidad) + '</td></tr>' +
    '<tr><td>Precio</td><td class="m">' + soles(v.precio) + ' por ' + esc(v.unidad) + '</td></tr>' +
    (v.nota ? '<tr><td>Nota</td><td class="m" style="white-space:normal">' + esc(v.nota) + '</td></tr>' : '') + '</table>' +
    '<div class="total-l"><span>Total</span><span class="num">' + soles(v.total) + '</span></div></div>';
  h += '<div class="kpis"><div class="kpi tono-ok"><div class="l">Cobrado</div><div class="v">' + soles(cobrado) + '</div></div>' +
    '<div class="kpi ' + (saldo > 0.004 ? 'tono-warn' : '') + '"><div class="l">Por cobrar</div><div class="v">' + soles(saldo) + '</div></div></div>';
  h += '<div class="btns" style="margin-bottom:12px">' + (saldo > 0.004 ? '<button class="btn pri" data-act="cobroNuevo" data-id="' + v.id + '">' + ico('check') + 'Registrar cobro</button>' : '') +
    (cli && cli.celular ? '<button class="btn" data-act="whatsapp" data-cel="' + esc(cli.celular) + '" data-txt="' + esc(textoVenta(v)) + '">' + ico('whatsapp') + 'Enviar al cliente</button>' : '') + '</div>';
  h += '<div class="grupo">Cobros</div>';
  const filas = [];
  if (v.cobradoInicial) filas.push('<div class="fila">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + (v.cobro === 'contado' ? 'Cobrado al contado' : 'Cobrado al vender') + '</div><div class="d">' + fecha(v.fecha) + (v.forma ? ' · ' + esc(v.forma) : '') + '</div></div><div class="x"><div class="t">' + soles(v.cobradoInicial) + '</div></div></div>');
  for (const c of cobros) filas.push('<div class="fila" data-act="cobroEditar" data-id="' + c.id + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">Cobro</div><div class="d">' + fecha(c.fecha) + (c.forma ? ' · ' + esc(c.forma) : '') + (c.nota ? ' · ' + esc(c.nota) : '') + '</div></div><div class="x"><div class="t">' + soles(c.monto) + '</div></div></div>');
  h += filas.length ? '<div class="lista">' + filas.join('') + '</div>' : vacio('dinero', 'Aún no se ha cobrado nada');
  return { titulo: 'Venta', atras: true, html: h, acciones: '<button class="icon-btn" data-act="ventaEditar" data-id="' + v.id + '" aria-label="Editar">' + ico('editar') + '</button>' };
};
function textoVenta(v) {
  const ch = DB.get('chacras', v.chacraId);
  return ['*' + (ch ? ch.nombre : 'MI-CHACRA') + '*', 'Venta del ' + fecha(v.fecha), nomC(v.cultivoId) + (v.estado ? ' ' + v.estado.toLowerCase() : '') + ': ' + plural(v.cantidad, v.unidad) + ' × ' + soles(v.precio),
    '*Total: ' + soles(v.total) + '*', 'Cobrado: ' + soles(DB.cobradoVenta(v)), 'Saldo: ' + soles(DB.saldoVenta(v))].join('\n');
}
function formCobro(v, c) {
  if (!puedeOToast('finanzas')) return;
  const saldo = r2(DB.saldoVenta(v) + (c ? c.monto : 0));
  formulario({
    titulo: c ? 'Corregir cobro' : 'Registrar cobro', valores: c ? Object.assign({}, c) : { monto: saldo, fecha: HOY(), forma: 'Efectivo' },
    campos: [
      { id: 'monto', et: 'Monto cobrado (S/)', tipo: 'num', req: true, min: 0.01, max: saldo, ayuda: 'Saldo de la venta: ' + soles(saldo) },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true, par: true },
      { id: 'forma', et: 'Forma', tipo: 'seg', ops: FORMAS_PAGO },
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Opcional' },
    ],
    eliminar: c && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar cobro', 'Se quitará el cobro de ' + soles(c.monto) + '.', { si: 'Eliminar', peligro: true })) { DB.eliminar('cobros', c.id, 'Cobro de ' + nomCli(v.clienteId) + ': ' + soles(c.monto)); cerrarTodas(); render(); } } : null,
    alGuardar: x => {
      const d = { ventaId: v.id, monto: x.monto, fecha: x.fecha, forma: x.forma || '', nota: x.nota || '', campaniaId: v.campaniaId };
      const tx = 'Cobro de ' + nomCli(v.clienteId) + ': ' + soles(x.monto);
      if (c) DB.editar('cobros', c.id, d, tx); else DB.crear('cobros', d, tx);
      toast('Cobro registrado'); render();
    },
  });
}
ACC.cobroNuevo = el => formCobro(DB.get('ventas', el.dataset.id), null);
ACC.cobroEditar = el => { const c = DB.get('cobros', el.dataset.id); formCobro(DB.get('ventas', c.ventaId), c); };

/* ---------- Clientes ---------- */
VISTAS.clientes = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Clientes');
  const cs = DB.todos('clientes').sort((a, b) => a.nombre.localeCompare(b.nombre));
  const h = cs.length ? '<div class="lista">' + cs.map(c => {
    const vs = DB.deChacra('ventas').filter(v => v.clienteId === c.id);
    const s = sumar(vs, v => DB.saldoVenta(v));
    return '<a class="fila" href="#/cliente/' + c.id + '"><span class="avatar">' + esc(iniciales(c.nombre)) + '</span><div class="cuerpo-f"><div class="t">' + esc(c.nombre) + '</div><div class="d">' + esc(c.tipo || '') + (c.celular ? ' · ' + esc(c.celular) : '') + ' · ' + vs.length + ' ventas</div></div>' +
      (s > 0.004 ? '<div class="x">' + pill('Debe ' + soles(s), 'warn') + '</div>' : '') + '</a>';
  }).join('') + '</div>' : vacio('personas', 'Aún no hay clientes');
  return { titulo: 'Clientes', atras: true, html: h, fab: { t: 'Nuevo cliente', icono: 'mas', act: 'clienteEditar' } };
};
ACC.clienteEditar = el => {
  if (!puedeOToast('finanzas')) return;
  const c = el.dataset && el.dataset.id ? DB.get('clientes', el.dataset.id) : null;
  formulario({
    titulo: c ? 'Editar cliente' : 'Nuevo cliente', valores: c ? Object.assign({}, c) : { tipo: 'Acopiador' },
    campos: [
      { id: 'nombre', et: 'Nombre o razón social', tipo: 'texto', req: true, foco: !c, valida: v => DB.todos('clientes').some(x => x.nombre.toLowerCase() === v.toLowerCase() && (!c || x.id !== c.id)) ? 'Ya existe un cliente con ese nombre' : '' },
      { id: 'celular', et: 'Celular', tipo: 'tel', par: true },
      { id: 'doc', et: 'DNI o RUC', tipo: 'texto', valida: v => /^(\d{8}|\d{11})$/.test(v) ? '' : 'DNI de 8 o RUC de 11 dígitos' },
      { id: 'tipo', et: 'Tipo', tipo: 'seg', ops: ['Acopiador', 'Cooperativa', 'Mercado', 'Comerciante', 'Otro'] },
      { id: 'nota', et: 'Notas', tipo: 'area' },
    ],
    eliminar: c && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar cliente', 'Sus ventas se conservan.', { si: 'Eliminar', peligro: true })) { DB.eliminar('clientes', c.id, c.nombre); cerrarTodas(); ir('clientes'); } } : null,
    alGuardar: x => { if (c) DB.editar('clientes', c.id, x, c.nombre); else DB.crear('clientes', x, 'Nuevo cliente: ' + x.nombre); toast('Cliente guardado'); render(); },
  });
};
VISTAS.cliente = id => {
  const c = DB.get('clientes', id);
  if (!c || c.eliminado) return { titulo: 'Cliente', atras: true, html: vacio('usuario', 'No existe') };
  if (!DB.puede('finanzas')) return sinFinanzas('Cliente');
  const vs = DB.deChacra('ventas').filter(v => v.clienteId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const s = sumar(vs, v => DB.saldoVenta(v));
  let h = '<div class="card center"><span class="avatar xl">' + esc(iniciales(c.nombre)) + '</span><h2 style="margin-top:8px">' + esc(c.nombre) + '</h2><div class="small muted">' + esc(c.tipo || '') + (c.doc ? ' · ' + esc(c.doc) : '') + '</div>' +
    (c.celular ? '<div class="btns" style="margin-top:12px"><button class="btn" data-act="llamar" data-cel="' + esc(c.celular) + '">' + ico('telefono') + 'Llamar</button><button class="btn tono-ok" data-act="whatsapp" data-cel="' + esc(c.celular) + '">' + ico('whatsapp') + 'WhatsApp</button></div>' : '') + '</div>';
  h += '<div class="kpis"><div class="kpi"><div class="l">Total comprado</div><div class="v">' + soles(sumar(vs, v => v.total)) + '</div></div><div class="kpi ' + (s > 0.004 ? 'tono-warn' : 'tono-ok') + '"><div class="l">Por cobrar</div><div class="v">' + soles(s) + '</div></div></div>';
  h += '<div class="grupo">Ventas</div>' + (vs.length ? '<div class="lista">' + vs.map(filaVenta).join('') + '</div>' : vacio('dinero', 'Sin ventas en esta chacra'));
  return { titulo: 'Cliente', atras: true, html: h, acciones: '<button class="icon-btn" data-act="clienteEditar" data-id="' + c.id + '" aria-label="Editar">' + ico('editar') + '</button>' };
};

/* ---------- Otros ingresos ---------- */
VISTAS.ingresos = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Otros ingresos');
  const xs = DB.deChacra('ingresos').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const h = '<p class="small muted">Ingresos que no son venta de cosecha: alquiler de terreno, subsidios, servicios, etc.</p>' +
    (xs.length ? '<div class="lista">' + xs.map(x => '<div class="fila" data-act="ingresoEditar" data-id="' + x.id + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + esc(x.concepto) + '</div><div class="d">' + fecha(x.fecha) + ' · ' + esc((DB.get('campanias', x.campaniaId) || {}).nombre || '') + '</div></div><div class="x"><div class="t">' + soles(x.monto) + '</div></div></div>').join('') + '</div>' : vacio('dinero', 'Sin otros ingresos'));
  return { titulo: 'Otros ingresos', atras: true, html: h, fab: { t: 'Nuevo ingreso', icono: 'mas', act: 'ingresoEditar' } };
};
ACC.ingresoEditar = el => {
  if (!puedeOToast('finanzas')) return;
  const x0 = el.dataset && el.dataset.id ? DB.get('ingresos', el.dataset.id) : null;
  if (x0) { const b = DB.bloqueo(x0); if (b) return toast(b, 'error'); }
  const camp = DB.campaniaActiva();
  formulario({
    titulo: x0 ? 'Editar ingreso' : 'Nuevo ingreso', valores: x0 ? Object.assign({}, x0) : { fecha: HOY(), campaniaId: camp ? camp.id : '' },
    campos: [
      { id: 'concepto', et: 'Concepto', tipo: 'texto', req: true, foco: !x0, ph: 'Alquiler de terreno' },
      { id: 'monto', et: 'Monto (S/)', tipo: 'num', req: true, min: 0.01, par: true },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      { id: 'campaniaId', et: 'Campaña', tipo: 'select', req: true, ops: opsCampanias() },
      { id: 'parcelaId', et: 'Parcela', tipo: 'select', ops: opsParcelas() },
      { id: 'nota', et: 'Nota', tipo: 'texto' },
    ],
    eliminar: x0 && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar ingreso', esc(x0.concepto) + ': ' + soles(x0.monto), { si: 'Eliminar', peligro: true })) { DB.eliminar('ingresos', x0.id, x0.concepto); cerrarTodas(); render(); } } : null,
    alGuardar: x => { if (x0) DB.editar('ingresos', x0.id, x, x.concepto + ': ' + soles(x.monto)); else DB.crear('ingresos', x, 'Ingreso: ' + x.concepto + ' ' + soles(x.monto)); toast('Guardado'); render(); },
  });
};

/* ==========================================================================
   GASTOS E INVERSIÓN
   ========================================================================== */
let campGastos = null;
VISTAS.gastos = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Gastos');
  const camp = campGastos ? DB.get('campanias', campGastos) : DB.campaniaActiva();
  const gs = DB.deChacra('gastos').filter(g => camp && g.campaniaId === camp.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const R = camp ? DB.resultado(camp.id) : null;
  let h = '<div class="campo"><select class="inp" id="campGastos">' + opsCampanias().map(o => '<option value="' + o.v + '"' + (camp && o.v === camp.id ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></div>';
  h += '<div class="kpis"><div class="kpi hero"><div class="l">Gastos de la campaña</div><div class="v">' + soles(sumar(gs, g => g.monto)) + '</div><div class="s">' + gs.length + ' gastos</div></div>' +
    (R ? '<div class="kpi"><div class="l">Mano de obra</div><div class="v">' + soles(R.manoObra) + '</div><div class="s">se calcula sola</div></div>' : '') + '</div>';
  const porCat = {};
  for (const g of gs) porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto;
  const cats = Object.keys(porCat).map(k => ({ l: k, v: r2(porCat[k]) })).sort((a, b) => b.v - a.v);
  if (cats.length) h += '<div class="card"><h3>Por categoría</h3>' + barras(cats, soles) + '</div>';
  h += '<div class="btns" style="margin-bottom:12px"><a class="btn chico" href="#/inversiones">' + ico('semilla', 's') + 'Inversiones' + (R && R.inversion ? ' · ' + soles(R.inversion) + ' esta campaña' : '') + '</a></div>';
  h += gs.length ? '<div class="lista">' + gs.map(g => '<div class="fila" data-act="gastoEditar" data-id="' + g.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">' + esc(g.descripcion) + '</div><div class="d">' + fechaCorta(g.fecha) + ' · ' + esc(g.categoria) +
    (g.parcelaId ? ' · ' + esc(nomP(g.parcelaId)) : '') + (g.proveedor ? ' · ' + esc(g.proveedor) : '') + '</div></div><div class="x"><div class="t">' + soles(g.monto) + '</div>' + (g.pagado === false ? pill('Por pagar', 'warn') : '') + '</div></div>').join('') + '</div>'
    : vacio('boleta', 'No hay gastos en esta campaña', '<p class="small">Abonos, químicos, flete, combustible… La mano de obra no se anota aquí: se calcula sola con asistencia, cosecha y contratas.</p>');
  return {
    titulo: 'Gastos', html: h, atras: true, fab: { t: 'Nuevo gasto', icono: 'mas', act: 'gastoEditar' },
    despues: root => { $('#campGastos', root).onchange = e => { campGastos = e.target.value; render(); }; },
  };
};
ACC.gastoEditar = el => {
  if (!puedeOToast('finanzas')) return;
  const g = el.dataset && el.dataset.id ? DB.get('gastos', el.dataset.id) : null;
  if (g) { const b = DB.bloqueo(g); if (b) return toast(b, 'error'); }
  const camp = DB.campaniaActiva();
  formulario({
    titulo: g ? 'Corregir gasto' : 'Nuevo gasto',
    valores: g ? Object.assign({}, g, { pagadoSeg: g.pagado === false ? 'no' : 'si' }) : { fecha: HOY(), categoria: CATEGORIAS_GASTO[0], campaniaId: campGastos || (camp ? camp.id : ''), pagadoSeg: 'si' },
    campos: [
      { id: 'categoria', et: 'Categoría', tipo: 'select', req: true, ops: CATEGORIAS_GASTO },
      { id: 'descripcion', et: 'Descripción', tipo: 'texto', req: true, foco: !g, ph: '4 sacos de urea' },
      { id: 'monto', et: 'Monto (S/)', tipo: 'num', req: true, min: 0.01, par: true },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      { id: 'proveedor', et: 'Proveedor', tipo: 'texto', ph: 'Ej. CHINCARMAS', par: true },
      { id: 'parcelaId', et: 'Parcela', tipo: 'select', ops: opsParcelas() },
      { id: 'campaniaId', et: 'Campaña', tipo: 'select', req: true, ops: opsCampanias() },
      { id: 'pagadoSeg', et: '¿Ya se pagó?', tipo: 'seg', ops: [{ v: 'si', t: 'Pagado' }, { v: 'no', t: 'Por pagar' }] },
      { id: 'vence', et: 'Pagar hasta', tipo: 'fecha', ver: x => x.pagadoSeg === 'no', ayuda: 'La app te avisará ese día' },
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'N° de boleta o factura' },
    ],
    eliminar: g && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar gasto', esc(g.descripcion) + ': ' + soles(g.monto), { si: 'Eliminar', peligro: true })) { DB.eliminar('gastos', g.id, g.descripcion + ': ' + soles(g.monto)); cerrarTodas(); render(); } } : null,
    alGuardar: x => {
      const c = DB.get('campanias', x.campaniaId);
      if (c && c.cerrada) return 'La campaña "' + c.nombre + '" está cerrada';
      x.pagado = x.pagadoSeg !== 'no'; delete x.pagadoSeg;
      if (x.pagado) x.vence = '';
      if (x.pagado && g && g.pagado === false) x.fechaPago = HOY();
      const tx = 'Gasto: ' + x.descripcion + ' ' + soles(x.monto);
      if (g) DB.editar('gastos', g.id, x, tx); else DB.crear('gastos', x, tx);
      toast('Gasto guardado'); render();
    },
  });
};

VISTAS.inversiones = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Inversiones');
  const camp = DB.campaniaActiva();
  const xs = DB.deChacra('inversiones').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const h = '<p class="small muted">Compras grandes que duran varias campañas (plantones, riego, maquinaria). Su costo se reparte en partes iguales entre las campañas que elijas.</p>' +
    (xs.length ? '<div class="lista">' + xs.map(i => {
      const n = Math.max(1, Number(i.campanias) || 1);
      return '<div class="fila" data-act="inversionEditar" data-id="' + i.id + '">' + ico('semilla') + '<div class="cuerpo-f"><div class="t">' + esc(i.descripcion) + '</div><div class="d">' + fecha(i.fecha) + ' · ' + esc(i.categoria) +
        ' · ' + n + (n === 1 ? ' campaña' : ' campañas') + ' (' + soles(i.monto / n) + ' c/u)' + (camp ? ' · esta campaña: ' + soles(DB.parteInversion(i, camp.id)) : '') + '</div></div><div class="x"><div class="t">' + soles(i.monto) + '</div></div></div>';
    }).join('') + '</div>' : vacio('semilla', 'Sin inversiones registradas'));
  return { titulo: 'Inversiones', atras: true, html: h, fab: { t: 'Nueva inversión', icono: 'mas', act: 'inversionEditar' } };
};
ACC.inversionEditar = el => {
  if (!puedeOToast('finanzas')) return;
  const i0 = el.dataset && el.dataset.id ? DB.get('inversiones', el.dataset.id) : null;
  const camp = DB.campaniaActiva();
  formulario({
    titulo: i0 ? 'Editar inversión' : 'Nueva inversión', valores: i0 ? Object.assign({}, i0) : { fecha: HOY(), categoria: CATEGORIAS_INVERSION[0], campanias: 1, campaniaId: camp ? camp.id : '' },
    campos: [
      { id: 'categoria', et: 'Tipo', tipo: 'select', req: true, ops: CATEGORIAS_INVERSION },
      { id: 'descripcion', et: 'Descripción', tipo: 'texto', req: true, foco: !i0, ph: '2,000 plantones de café Geisha' },
      { id: 'monto', et: 'Monto total (S/)', tipo: 'num', req: true, min: 0.01, par: true },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      { id: 'campaniaId', et: 'Desde la campaña', tipo: 'select', req: true, ops: opsCampanias() },
      { id: 'campanias', et: 'Repartir en (N° de campañas)', tipo: 'num', req: true, min: 1, max: 50, valida: v => Number.isInteger(v) ? '' : 'Debe ser un número entero' },
      { id: 'parte', tipo: 'calc', calc: x => '<span>Le toca a cada campaña</span><b>' + soles((Number(x.monto) || 0) / Math.max(1, Number(x.campanias) || 1)) + '</b>' },
      { id: 'parcelaId', et: 'Parcela', tipo: 'select', ops: opsParcelas() },
      { id: 'nota', et: 'Nota', tipo: 'texto' },
    ],
    eliminar: i0 && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar inversión', esc(i0.descripcion), { si: 'Eliminar', peligro: true })) { DB.eliminar('inversiones', i0.id, i0.descripcion); cerrarTodas(); render(); } } : null,
    alGuardar: x => { const tx = 'Inversión: ' + x.descripcion + ' ' + soles(x.monto); if (i0) DB.editar('inversiones', i0.id, x, tx); else DB.crear('inversiones', x, tx); toast('Inversión guardada'); render(); },
  });
};

/* ==========================================================================
   GANANCIA DE LA CAMPAÑA
   ========================================================================== */
const EG = { campaniaId: null, parcelaId: '' };
VISTAS.ganancia = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Ganancia');
  const cs = DB.campaniasOrdenadas();
  if (!cs.length) return { titulo: 'Ganancia', html: vacio('bandera', 'Crea una campaña primero') };
  let camp = EG.campaniaId && DB.get('campanias', EG.campaniaId);
  if (!camp || camp.eliminado || camp.chacraId !== DB.chacraId) camp = DB.campaniaActiva() || cs[cs.length - 1];
  const pid = EG.parcelaId && DB.get('parcelas', EG.parcelaId) ? EG.parcelaId : '';
  const R = DB.resultado(camp.id, pid);
  const gana = R.ganancia >= 0;
  let h = '<div class="fila2" style="margin-bottom:12px"><select class="inp" id="egCamp">' + opsCampanias().map(o => '<option value="' + o.v + '"' + (o.v === camp.id ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select>' +
    '<select class="inp" id="egParc"><option value="">Toda la chacra</option>' + parcelasChacra().map(p => '<option value="' + p.id + '"' + (p.id === pid ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></div>';
  h += '<div class="kpi ' + (gana ? 'hero' : 'tono-err') + '" style="margin-bottom:12px"><div class="l">Ganancia ' + (camp.cerrada ? 'final' : 'hasta hoy') + '</div><div class="v" style="font-size:30px">' + soles(R.ganancia) + '</div><div class="s">' +
    (R.ingresos || R.costos ? (gana ? 'Va ganando' : 'Va perdiendo') + (R.rentabilidad !== null ? ' · rentabilidad ' + R.rentabilidad + '%' : '') : 'Aún sin movimientos') + '</div></div>';
  if (pid) h += '<div class="aviso tono-info small">' + ico('info', 's') + '<div>Solo cuenta lo que se registró con esta parcela.</div></div>';
  h += '<div class="card"><table class="tabla">' +
    '<tr><td>Ventas de cosecha</td><td class="m">' + soles(R.ventas) + '</td></tr>' + (R.otros ? '<tr><td>Otros ingresos</td><td class="m">' + soles(R.otros) + '</td></tr>' : '') +
    '<tr><td><b>Ingresos</b></td><td class="m"><b>' + soles(R.ingresos) + '</b></td></tr>' +
    '<tr><td>Mano de obra: jornales y tareas</td><td class="m">−' + soles(R.jornales) + '</td></tr>' +
    '<tr><td>Mano de obra: cosecha</td><td class="m">−' + soles(R.cosechaPago) + '</td></tr>' +
    (R.contratas ? '<tr><td>Contratas</td><td class="m">−' + soles(R.contratas) + '</td></tr>' : '') +
    '<tr><td>Gastos</td><td class="m">−' + soles(R.gastos) + '</td></tr>' +
    (R.inversion ? '<tr><td>Inversión que le toca a la campaña</td><td class="m">−' + soles(R.inversion) + '</td></tr>' : '') +
    '<tr><td><b>Costos</b></td><td class="m"><b>−' + soles(R.costos) + '</b></td></tr></table>' +
    '<div class="total-l"><span>Ganancia</span><span class="num" style="color:' + (gana ? 'var(--green-text)' : 'var(--red-text)') + '">' + soles(R.ganancia) + '</span></div></div>';
  h += '<div class="card"><h3>Ingresos frente a costos</h3>' + barras([{ l: 'Ingresos', v: R.ingresos }, { l: 'Costos', v: R.costos, color: 'var(--amber-text)' }], soles) +
    (R.porCobrar > 0.004 ? '<p class="small muted" style="margin:0">De las ventas, falta cobrar ' + soles(R.porCobrar) + '.</p>' : '') + '</div>';

  // Producción, ventas y costo por unidad
  const cos = resumenCantidades(R.listas.cosechas);
  const vend = resumenVentas(R.listas.ventas);
  if (cos.length || vend.length) {
    h += '<div class="card"><h3>Producción y precios</h3><table class="tabla">';
    for (const c of cos) h += '<tr><td>Cosechado: ' + esc(c.cultivo) + '</td><td class="m">' + plural(c.cantidad, c.unidad) + '</td></tr>';
    if (cos.length === 1 && cos[0].cantidad) h += '<tr><td>Costo por ' + esc(cos[0].unidad) + ' cosechada</td><td class="m"><b>' + soles(R.costos / cos[0].cantidad) + '</b></td></tr>';
    for (const v of vend) h += '<tr><td>Vendido: ' + esc(v.cultivo) + (v.estado ? ' ' + esc(v.estado.toLowerCase()) : '') + '<div class="tiny faint">precio promedio por ' + esc(v.unidad) + '</div></td><td class="m">' + plural(v.cantidad, v.unidad) + '<div class="tiny">' + soles(v.prom) + '</div></td></tr>';
    h += '</table></div>';
  }
  // Por cuadra
  const area = pid ? Number((DB.get('parcelas', pid) || {}).cuadras) || 0 : (sumar(parcelasChacra(), p => p.cuadras) || Number((DB.get('chacras', DB.chacraId) || {}).cuadras) || 0);
  if (area) h += '<div class="kpis"><div class="kpi"><div class="l">Ganancia por cuadra</div><div class="v">' + soles(R.ganancia / area) + '</div><div class="s">' + cant(area) + ' cuadras</div></div>' +
    '<div class="kpi"><div class="l">Costo por cuadra</div><div class="v">' + soles(R.costos / area) + '</div><div class="s">1 cuadra = 1 ha</div></div></div>';
  // Gastos por categoría
  const porCat = {};
  for (const g of R.listas.gastos) porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto;
  const cats = Object.keys(porCat).map(k => ({ l: k, v: r2(porCat[k]) })).sort((a, b) => b.v - a.v);
  if (R.manoObra) cats.unshift({ l: 'Mano de obra', v: R.manoObra });
  if (cats.length) h += '<div class="card"><h3>¿En qué se fue el dinero?</h3>' + barras(cats, soles) + '</div>';
  // Comparar campañas
  if (cs.length > 1) {
    h += '<div class="card"><h3>Comparar campañas</h3><table class="tabla"><tr><td class="muted small">Campaña</td><td class="m muted small">Ingresos</td><td class="m muted small">Costos</td><td class="m muted small">Ganancia</td></tr>' +
      cs.slice().reverse().map(c => { const x = DB.resultado(c.id, pid); return '<tr><td>' + esc(c.nombre) + '</td><td class="m">' + soles(x.ingresos) + '</td><td class="m">' + soles(x.costos) + '</td><td class="m" style="color:' + (x.ganancia >= 0 ? 'var(--green-text)' : 'var(--red-text)') + '"><b>' + soles(x.ganancia) + '</b></td></tr>'; }).join('') + '</table></div>';
  }
  h += '<div class="btns"><a class="btn chico" href="#/ventas">Ventas</a><a class="btn chico" href="#/gastos">Gastos</a><a class="btn chico" href="#/inversiones">Inversiones</a></div>';
  return {
    titulo: 'Ganancia', html: h,
    despues: root => {
      $('#egCamp', root).onchange = e => { EG.campaniaId = e.target.value; render(); };
      $('#egParc', root).onchange = e => { EG.parcelaId = e.target.value; render(); };
    },
  };
};

/* ==========================================================================
   DETALLE DE PARCELA Y ACTIVIDADES PROGRAMADAS
   ========================================================================== */
VISTAS.parcela = id => {
  const p = DB.get('parcelas', id);
  if (!p || p.eliminado) return { titulo: 'Parcela', atras: true, html: vacio('mapa', 'No existe') };
  const camp = DB.campaniaActiva();
  let h = '<div class="card"><h2>' + esc(p.nombre) + (p.activo === false ? ' ' + pill('Inactiva', 'warn') : '') + '</h2><table class="tabla" style="margin-top:8px">' +
    '<tr><td class="muted">Área</td><td class="m">' + (p.cuadras ? cant(p.cuadras) + ' cuadras (' + cant(p.cuadras * 10000) + ' m²)' : '—') + '</td></tr>' +
    '<tr><td class="muted">Cultivos</td><td class="m">' + esc((p.cultivos || []).map(nomC).filter(Boolean).join(', ') || '—') + '</td></tr>' +
    (p.variedad ? '<tr><td class="muted">Variedad</td><td class="m">' + esc(p.variedad) + '</td></tr>' : '') +
    (p.siembra ? '<tr><td class="muted">Siembra</td><td class="m">' + fecha(p.siembra) + '</td></tr>' : '') +
    (p.plantas ? '<tr><td class="muted">Plantas</td><td class="m">' + cant(p.plantas) + '</td></tr>' : '') +
    (p.nota ? '<tr><td class="muted">Notas</td><td class="m" style="white-space:normal">' + esc(p.nota) + '</td></tr>' : '') + '</table></div>';
  if (camp) {
    const cos = DB.deChacra('cosechas').filter(r => r.parcelaId === p.id && r.campaniaId === camp.id);
    const res = resumenCantidades(cos);
    h += '<div class="grupo">' + esc(camp.nombre) + '</div><div class="kpis"><div class="kpi"><div class="l">Cosechado</div><div class="v">' + (res[0] ? plural(res[0].cantidad, res[0].unidad) : '0') + '</div><div class="s">' + (res[0] ? esc(res[0].cultivo) + (p.cuadras ? ' · ' + cant(res[0].cantidad / p.cuadras) + ' por cuadra' : '') : '—') + '</div></div>';
    if (DB.puede('finanzas')) {
      const R = DB.resultado(camp.id, p.id);
      h += '<div class="kpi ' + (R.ganancia >= 0 ? 'tono-ok' : 'tono-err') + '"><div class="l">Ganancia</div><div class="v">' + soles(R.ganancia) + '</div><div class="s">ingresos ' + soles(R.ingresos) + ' · costos ' + soles(R.costos) + '</div></div>';
    }
    h += '</div>';
  }
  const car = DB.carencia(p.id);
  if (car) h += '<div class="aviso tono-err">' + ico('alerta', 's') + '<div><b>En periodo de carencia hasta el ' + fecha(car.hasta) + '.</b> Se aplicó ' + esc(car.aplicacion.producto) + ' el ' + fecha(car.aplicacion.fecha) + '. No cosechar todavía.</div></div>';
  const apl = DB.deChacra('aplicaciones').filter(a => a.parcelaId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  h += '<div class="grupo">Abonos y químicos aplicados</div>' + (apl.length ? '<div class="lista">' + apl.slice(0, 8).map(filaAplicacion).join('') + '</div>' +
    (apl.length > 8 ? '<a class="small" href="#/abonos">Ver las ' + apl.length + ' aplicaciones</a>' : '') : vacio('hoja', 'Aún no se registran abonos en esta parcela'));
  if (DB.puede('campo')) h += '<button class="btn bloque" data-act="aplicacionNueva" style="margin-bottom:12px">' + ico('hoja') + 'Registrar aplicación</button>';
  const acts = DB.deChacra('actividades').filter(a => a.parcelaId === p.id).sort((a, b) => (a.hecha - b.hecha) || a.fecha.localeCompare(b.fecha));
  h += '<div class="grupo">Cronograma de actividades</div>';
  h += acts.length ? '<div class="lista">' + acts.map(a => {
    const atrasada = !a.hecha && a.fecha < HOY();
    return '<div class="fila"><button class="icon-btn" data-act="actividadHecha" data-id="' + a.id + '" aria-label="Marcar hecha" style="color:' + (a.hecha ? 'var(--green)' : 'var(--faint)') + '">' + ico(a.hecha ? 'check' : 'calendario') + '</button>' +
      '<div class="cuerpo-f" data-act="actividadEditar" data-id="' + a.id + '"><div class="t" style="' + (a.hecha ? 'text-decoration:line-through;color:var(--faint)' : '') + '">' + esc(a.labor) + '</div><div class="d">' + fechaCorta(a.fecha) + (a.nota ? ' · ' + esc(a.nota) : '') + '</div></div>' +
      (atrasada ? pill('Atrasada', 'err') : a.hecha ? pill('Hecha', 'ok') : '') + '</div>';
  }).join('') + '</div>' : vacio('calendario', 'Sin actividades programadas', '<p class="small">Programa podas, abonamientos, deshierbos… y márcalas cuando se hagan.</p>');
  h += '<button class="btn bloque" data-act="actividadEditar" data-parcela="' + p.id + '">' + ico('mas') + 'Programar actividad</button>';
  return { titulo: 'Parcela', atras: true, html: h, acciones: DB.puede('config') ? '<button class="icon-btn" data-act="parcelaEditar" data-id="' + p.id + '" aria-label="Editar">' + ico('editar') + '</button>' : '' };
};
ACC.actividadEditar = el => {
  if (!DB.puede('tareo') || DB.rol() === 'operario') return toast('No tienes permiso', 'error');
  const a = el.dataset.id ? DB.get('actividades', el.dataset.id) : null;
  const pid = a ? a.parcelaId : el.dataset.parcela;
  formulario({
    titulo: a ? 'Editar actividad' : 'Programar actividad', valores: a ? Object.assign({}, a) : { fecha: sumarDias(HOY(), 7), labor: 'Abonamiento', hecha: false },
    campos: [
      { id: 'labor', et: 'Actividad', tipo: 'select', req: true, ops: laboresLista() },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true, par: true },
      { id: 'hecha', et: 'Ya se hizo', tipo: 'chk' },
      { id: 'nota', et: 'Detalle', tipo: 'texto', ph: 'Ej. 200 g de urea por planta' },
    ],
    eliminar: a ? async () => { if (await confirmar('Eliminar actividad', esc(a.labor) + ' · ' + fecha(a.fecha), { si: 'Eliminar', peligro: true })) { DB.eliminar('actividades', a.id, a.labor + ' en ' + nomP(a.parcelaId)); cerrarTodas(); render(); } } : null,
    alGuardar: x => { x.parcelaId = pid; const tx = x.labor + ' en ' + nomP(pid) + ' · ' + fecha(x.fecha); if (a) DB.editar('actividades', a.id, x, tx); else DB.crear('actividades', x, 'Programado: ' + tx); toast('Guardado'); render(); },
  });
};
ACC.actividadHecha = el => {
  const a = DB.get('actividades', el.dataset.id);
  DB.editar('actividades', a.id, { hecha: !a.hecha }, a.labor + ' en ' + nomP(a.parcelaId) + (a.hecha ? ': pendiente' : ': hecha'));
  render();
};

/* ==========================================================================
   REPORTES DE TRABAJADORES (lado del administrador)
   ========================================================================== */
let tabReportes = 'pendiente';
VISTAS.reportes = () => {
  if (!DB.puede('reportes')) return { titulo: 'Reportes', atras: true, html: vacio('candado', 'Sin acceso') };
  const rs = DB.deChacra('reportes').filter(r => tabReportes === 'pendiente' ? r.estado === 'pendiente' : r.estado !== 'pendiente').sort((a, b) => b.creado - a.creado);
  let h = '<div class="chips-h">' + [['pendiente', 'Pendientes'], ['atendido', 'Atendidos']].map(([k, t]) => '<button class="' + (tabReportes === k ? 'on' : '') + '" data-act="tabReportes" data-t="' + k + '">' + t + '</button>').join('') + '</div>';
  h += rs.length ? '<div class="lista">' + rs.map(r => '<div class="fila" data-act="reporteVer" data-id="' + r.id + '">' + ico('alerta') + '<div class="cuerpo-f"><div class="t">' + esc(nomT(r.trabajadorId)) + '</div><div class="d">' + fechaCorta(r.fecha) + ' · ' + esc(r.texto) + '</div></div>' +
    (r.estado === 'pendiente' ? pill('Pendiente', 'warn') : r.estado === 'resuelto' ? pill('Corregido', 'ok') : pill('Sin cambio', 'info')) + '</div>').join('') + '</div>'
    : vacio('check', tabReportes === 'pendiente' ? 'No hay reportes pendientes' : 'Aún no hay reportes atendidos');
  h += '<p class="small muted">Los trabajadores con acceso pueden avisar si algo se anotó mal. Revisa, corrige si corresponde y respóndeles.</p>';
  return { titulo: 'Reportes de trabajadores', atras: true, html: h };
};
ACC.tabReportes = el => { tabReportes = el.dataset.t; render(); };
ACC.reporteVer = el => {
  const r = DB.get('reportes', el.dataset.id);
  const reg = r.regCol && r.regId ? DB.get(r.regCol, r.regId) : null;
  const h = abrirHoja(cabHoja('Reporte de ' + nomT(r.trabajadorId)) +
    '<div class="card"><div class="small muted">Sobre el ' + fecha(r.fecha) + ' · enviado ' + fechaHora(r.creado) + '</div><p style="margin:8px 0 0">' + esc(r.texto) + '</p></div>' +
    (reg && !reg.eliminado ? '<div class="grupo">Registro señalado (toca para corregir)</div><div class="lista">' + filaRegistro(r.regCol, reg) + '</div>' : '') +
    (r.estado !== 'pendiente' ? '<div class="aviso tono-ok">' + ico('check', 's') + '<div><b>Respuesta:</b> ' + esc(r.respuesta || '') + '</div></div>' :
      '<div class="campo"><label class="et">Respuesta para el trabajador</label><textarea class="inp" id="repResp" placeholder="Ej. Revisado, eran 25 latas. Ya se corrigió."></textarea></div>' +
      '<div class="pie"><button class="btn" data-x="no">Sin cambio</button><button class="btn pri" data-x="si">Corregido</button></div>'));
  const responder = estado => {
    const txt = h.querySelector('#repResp').value.trim();
    if (!txt) { toast('Escribe una respuesta', 'error'); return; }
    DB.editar('reportes', r.id, { estado, respuesta: txt, respondidoPor: DB.usuario.nombre, respondido: Date.now() }, 'Respuesta a ' + nomT(r.trabajadorId));
    cerrarHoja(); toast('Respuesta guardada'); render();
  };
  if (r.estado === 'pendiente') { h.querySelector('[data-x=si]').onclick = () => responder('resuelto'); h.querySelector('[data-x=no]').onclick = () => responder('rechazado'); }
};

/* ==========================================================================
   MODO TRABAJADOR (portal)
   ========================================================================== */
VISTAS.portal = () => {
  const t = DB.get('trabajadores', DB.usuario.trabajadorId);
  if (!t) return { titulo: 'Mi cuenta', html: vacio('usuario', 'Tu acceso ya no está activo') };
  const cid = DB.chacraId;
  const saldo = DB.saldo(t.id, cid);
  const hoy = HOY(), sem = DB.semana(hoy);
  const gH = DB.ganancias(t.id, cid, hoy, hoy), gS = DB.ganancias(t.id, cid, sem.desde, sem.hasta);
  const cH = resumenCantidades(gH.cosechas), cS = resumenCantidades(gS.cosechas);
  let h = '<div class="kpi ' + (saldo > 0 ? 'hero' : 'tono-ok') + ' center" style="margin-bottom:12px"><div class="l">' + (saldo >= 0 ? 'Saldo por cobrar' : 'Saldo a favor de la chacra') + '</div><div class="v" style="font-size:34px">' + soles(saldo) + '</div>' +
    '<div class="s">Esta semana ganaste ' + soles(sumar(gS.trabajos, r => r.total) + sumar(gS.cosechas, r => r.total)) + '</div></div>';
  h += '<div class="kpis"><div class="kpi center"><div class="l">Hoy</div><div class="v">' + (cH[0] ? plural(cH[0].cantidad, cH[0].unidad) : (gH.trabajos.length ? gH.trabajos[0].labor : '—')) + '</div></div>' +
    '<div class="kpi center"><div class="l">Esta semana</div><div class="v">' + (cS[0] ? plural(cS[0].cantidad, cS[0].unidad) : DB.diasTrabajados(t.id, cid, sem.desde, sem.hasta) + ' días') + '</div></div></div>';
  h += '<button class="btn bloque" data-act="reporteNuevo" style="margin-bottom:12px">' + ico('alerta') + 'Reportar un error</button>';
  // Últimos 30 días
  const desde = sumarDias(hoy, -30);
  const g = DB.ganancias(t.id, cid, desde, hoy), m = DB.movs(t.id, cid, desde, hoy);
  const regs = [...g.cosechas.map(r => ({ r, col: 'cosechas' })), ...g.trabajos.map(r => ({ r, col: 'trabajos' })), ...m.map(r => ({ r, col: 'movimientos' }))]
    .sort((a, b) => b.r.fecha.localeCompare(a.r.fecha) || b.r.creado - a.r.creado);
  h += '<div class="grupo">Mis últimos 30 días</div>' + (regs.length ? '<div class="lista">' + regs.map(x => filaPortal(x.col, x.r)).join('') + '</div>' : vacio('calendario', 'Sin registros recientes'));
  const liqs = DB.deChacra('liquidaciones').filter(l => l.trabajadorId === t.id).sort((a, b) => b.hasta.localeCompare(a.hasta));
  if (liqs.length) h += '<div class="grupo">Mis pagos</div><div class="lista">' + liqs.map(l => '<div class="fila" data-act="portalBoleta" data-id="' + l.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">Semana ' + fecha(l.desde).slice(0, 5) + ' – ' + fecha(l.hasta).slice(0, 5) + '</div><div class="d">Pagado el ' + fecha(l.fechaPago) + (l.forma ? ' · ' + esc(l.forma) : '') + '</div></div><div class="x"><div class="t">' + soles(l.pagado) + '</div></div></div>').join('') + '</div>';
  const reps = DB.deChacra('reportes').filter(r => r.trabajadorId === t.id).sort((a, b) => b.creado - a.creado);
  if (reps.length) h += '<div class="grupo">Mis reportes</div><div class="lista">' + reps.map(r => '<div class="fila">' + ico('alerta') + '<div class="cuerpo-f"><div class="t" style="white-space:normal">' + esc(r.texto) + '</div><div class="d" style="white-space:normal">' + fecha(r.fecha) +
    (r.respuesta ? ' · Respuesta: ' + esc(r.respuesta) : '') + '</div></div>' + (r.estado === 'pendiente' ? pill('En revisión', 'warn') : r.estado === 'resuelto' ? pill('Corregido', 'ok') : pill('Revisado', 'info')) + '</div>').join('') + '</div>';
  return { titulo: 'Hola, ' + t.nombre.split(' ')[0], html: h };
};
function filaPortal(col, r) {
  let ic, t, x;
  if (col === 'cosechas') { ic = 'canasta'; t = plural(r.cantidad, r.unidad) + ' de ' + nomC(r.cultivoId) + (r.merma ? ' (merma ' + cant(r.merma) + ')' : ''); x = soles(r.total); }
  else if (col === 'trabajos') { ic = 'asistencia'; t = r.labor + ' · ' + (r.modalidad === 'jornal' ? (Number(r.cantidad) === 0.5 ? 'medio día' : '1 día') : plural(r.cantidad, MODALIDADES[r.modalidad].u, MODALIDADES[r.modalidad].us)) + (r.horasExtra ? ' + ' + cant(r.horasExtra) + ' h' : ''); x = soles(r.total); }
  else { ic = 'dinero'; t = TIPOS_MOV[r.tipo].t; x = (TIPOS_MOV[r.tipo].signo > 0 ? '+' : '−') + soles(r.monto); }
  return '<div class="fila">' + ico(ic) + '<div class="cuerpo-f"><div class="t">' + esc(t) + '</div><div class="d">' + fechaCorta(r.fecha) + '</div></div><div class="x"><div class="t">' + x + '</div></div></div>';
}
ACC.portalBoleta = el => {
  const l = DB.get('liquidaciones', el.dataset.id);
  const t = DB.get('trabajadores', l.trabajadorId);
  abrirHoja(cabHoja('Boleta') + '<div class="card" style="white-space:pre-wrap;font-size:15px">' + esc(textoBoleta(t, { desde: l.desde, hasta: l.hasta }, true).replace(/\*/g, '')) + '</div>');
};
ACC.reporteNuevo = () => {
  const t = DB.get('trabajadores', DB.usuario.trabajadorId);
  const desde = sumarDias(HOY(), -30);
  const g = DB.ganancias(t.id, DB.chacraId, desde, HOY());
  const opsReg = f => [{ v: '', t: 'Otro / no está anotado' }].concat(
    g.cosechas.filter(r => r.fecha === f).map(r => ({ v: 'cosechas|' + r.id, t: plural(r.cantidad, r.unidad) + ' de ' + nomC(r.cultivoId) })),
    g.trabajos.filter(r => r.fecha === f).map(r => ({ v: 'trabajos|' + r.id, t: r.labor + ' · ' + soles(r.total) })));
  formulario({
    titulo: 'Reportar un error', valores: { fecha: HOY() },
    campos: [
      { id: 'fecha', et: '¿Qué día?', tipo: 'fecha', req: true, valida: v => v > HOY() ? 'No puede ser una fecha futura' : '' },
      { id: 'reg', et: '¿Qué registro?', tipo: 'select', ops: x => opsReg(x.fecha) },
      { id: 'texto', et: '¿Qué está mal?', tipo: 'area', req: true, ph: 'Ej. Ese día saqué 25 latas, no 21.' },
    ],
    guardar: 'Enviar reporte',
    alGuardar: x => {
      const [regCol, regId] = (x.reg || '|').split('|');
      DB.crear('reportes', { trabajadorId: t.id, fecha: x.fecha, regCol: regCol || '', regId: regId || '', texto: x.texto, estado: 'pendiente' }, 'Reporte de ' + t.nombre);
      DB.guardarYa();
      toast('Reporte enviado. El encargado lo revisará.'); render();
    },
  });
};
