'use strict';
/* ==========================================================================
   MI-CHACRA · Etapa 3: almacén, abonos y químicos, calendario,
   cuentas por cobrar y pagar, flujo de caja y avisos en el celular
   ========================================================================== */

const sinCampo = t => ({ titulo: t, atras: true, html: vacio('candado', 'Solo administradores y supervisores') });
const productosChacra = () => DB.deChacra('productos').sort((a, b) => a.nombre.localeCompare(b.nombre));
const productosAplicables = () => productosChacra().filter(p => (TIPOS_PRODUCTO[p.tipo] || {}).aplica);
const tipoP = k => (TIPOS_PRODUCTO[k] || TIPOS_PRODUCTO.otro).t;
const fmtStock = (n, u) => plural(n, u);
const ICONO_ALERTA = { abono: 'hoja', actividad: 'calendario', carencia: 'alerta', stock: 'canasta', vence: 'alerta', cobro: 'dinero', pago: 'boleta', aplicado: 'check', contrata: 'contrata', liquidar: 'billetera' };
const TONO_ALERTA = { abono: 'ok', actividad: 'info', carencia: 'err', stock: 'warn', vence: 'warn', cobro: 'info', pago: 'warn', aplicado: 'ok', contrata: 'info', liquidar: 'warn' };

/* ==========================================================================
   ALMACÉN (INVENTARIO)
   ========================================================================== */
let filtroInv = 'todos', buscaInv = '';
VISTAS.inventario = () => {
  if (!DB.puede('campo')) return sinCampo('Almacén');
  const m = DB.puede('montos');
  let ps = productosChacra();
  const datos = ps.map(p => ({ p, s: DB.stock(p.id) }));
  let lista = datos;
  if (filtroInv === 'aplica') lista = lista.filter(x => (TIPOS_PRODUCTO[x.p.tipo] || {}).aplica);
  if (filtroInv === 'otros') lista = lista.filter(x => !(TIPOS_PRODUCTO[x.p.tipo] || {}).aplica);
  if (filtroInv === 'bajo') lista = lista.filter(x => Number(x.p.minimo) > 0 && x.s <= Number(x.p.minimo));
  if (buscaInv) lista = lista.filter(x => x.p.nombre.toLowerCase().includes(buscaInv.toLowerCase()));
  const bajos = datos.filter(x => Number(x.p.minimo) > 0 && x.s <= Number(x.p.minimo)).length;
  let h = '<div class="kpis"><div class="kpi"><div class="l">Productos</div><div class="v">' + ps.length + '</div></div>' +
    '<div class="kpi ' + (bajos ? 'tono-warn' : '') + '"><div class="l">Stock bajo</div><div class="v">' + bajos + '</div></div>' +
    (m ? '<div class="kpi"><div class="l">Valor en almacén</div><div class="v">' + soles(sumar(datos, x => Math.max(0, x.s) * DB.costoPromedio(x.p.id))) + '</div><div class="s">a costo promedio</div></div>' : '') + '</div>';
  if (bajos) h += htmlOfertas(2, o => !!(o.segmento || {}).stockBajo);
  h += '<div class="buscar">' + ico('buscar') + '<input class="inp" id="buscaInv" placeholder="Buscar producto" value="' + esc(buscaInv) + '"></div>';
  h += '<div class="chips-h">' + [['todos', 'Todos'], ['aplica', 'Abonos y químicos'], ['otros', 'Otros'], ['bajo', 'Stock bajo']].map(([k, t]) =>
    '<button class="' + (filtroInv === k ? 'on' : '') + '" data-act="filtroInv" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  h += lista.length ? '<div class="lista">' + lista.map(({ p, s }) => {
    const bajo = Number(p.minimo) > 0 && s <= Number(p.minimo);
    const vencido = p.vence && p.vence < HOY();
    return '<a class="fila" href="#/producto/' + p.id + '">' + ico((TIPOS_PRODUCTO[p.tipo] || {}).aplica ? 'hoja' : 'herramienta') + '<div class="cuerpo-f"><div class="t">' + esc(p.nombre) + '</div><div class="d">' + esc(tipoP(p.tipo)) +
      (p.vence ? ' · vence ' + fecha(p.vence) : '') + '</div></div><div class="x">' + pill(fmtStock(s, p.unidad), vencido ? 'err' : bajo ? 'warn' : 'ok') + '</div></a>';
  }).join('') + '</div>' : vacio('canasta', ps.length ? 'No hay productos con ese filtro' : 'El almacén está vacío', '<p class="small">Registra tus abonos, químicos, combustible y herramientas. Al aplicar un abono, el stock baja solo.</p>');
  return {
    titulo: 'Almacén', atras: true, html: h, fab: { t: 'Nuevo producto', icono: 'mas', act: 'productoEditar' },
    despues: root => { const b = $('#buscaInv', root); b.oninput = () => { buscaInv = b.value; const pos = b.selectionStart; render(); const nb = $('#buscaInv'); nb.focus(); nb.setSelectionRange(pos, pos); }; },
  };
};
ACC.filtroInv = el => { filtroInv = el.dataset.f; render(); };

ACC.productoEditar = el => {
  if (!puedeOToast('campo')) return;
  const p = el.dataset && el.dataset.id ? DB.get('productos', el.dataset.id) : null;
  const m = DB.puede('montos');
  formulario({
    titulo: p ? 'Editar producto' : 'Nuevo producto', valores: p ? Object.assign({}, p) : { tipo: 'abono', unidad: 'saco', proveedor: '' },
    campos: [
      { id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: !p, ph: 'Urea 46%', valida: v => productosChacra().some(x => x.nombre.toLowerCase() === v.toLowerCase() && (!p || x.id !== p.id)) ? 'Ya existe en el almacén' : '' },
      { id: 'tipo', et: 'Tipo', tipo: 'select', req: true, ops: Object.keys(TIPOS_PRODUCTO).map(k => ({ v: k, t: TIPOS_PRODUCTO[k].t })), par: true },
      { id: 'unidad', et: 'Se cuenta en', tipo: 'select', req: true, ops: UNIDADES_PRODUCTO },
      { id: 'minimo', et: 'Avisar cuando queden', tipo: 'num', min: 0, par: true, ayuda: 'Stock mínimo' },
      { id: 'vence', et: 'Fecha de vencimiento', tipo: 'fecha' },
      { id: 'carencia', et: 'Periodo de carencia (días)', tipo: 'num', min: 0, max: 365, ver: v => ['insecticida', 'fungicida', 'herbicida'].includes(v.tipo),
        ayuda: 'Días que hay que esperar para cosechar después de aplicarlo (ver etiqueta)' },
      { id: 'dosis', et: 'Dosis recomendada', tipo: 'texto', ph: '200 g por planta / 250 ml por cilindro', ver: v => (TIPOS_PRODUCTO[v.tipo] || {}).aplica },
      p ? null : { id: 'stockInicial', et: 'Cantidad que ya tienes', tipo: 'num', min: 0, par: !!m },
      p || !m ? null : { id: 'costoUnit', et: 'Costo por unidad (S/)', tipo: 'num', min: 0, ver: v => Number(v.stockInicial) > 0, ayuda: 'Para valorizar el stock (no se registra como gasto)' },
      { id: 'nota', et: 'Notas', tipo: 'area' },
    ].filter(Boolean),
    eliminar: p && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar producto', 'Su historial de entradas y salidas se conserva.', { si: 'Eliminar', peligro: true })) { DB.eliminar('productos', p.id, p.nombre); cerrarTodas(); ir('inventario'); } } : null,
    alGuardar: x => {
      const ini = Number(x.stockInicial) || 0, cu = Number(x.costoUnit) || 0;
      delete x.stockInicial; delete x.costoUnit;
      if (p) { DB.editar('productos', p.id, x, x.nombre); toast('Guardado'); render(); return; }
      const r = DB.crear('productos', x, 'Producto: ' + x.nombre);
      if (ini > 0) DB.crear('inventario', { productoId: r.id, tipo: 'entrada', cantidad: ini, costoUnit: cu, fecha: HOY(), nota: 'Stock inicial' }, 'Stock inicial de ' + x.nombre + ': ' + ini + ' ' + x.unidad);
      toast('Producto registrado'); ir('producto/' + r.id);
    },
  });
};

VISTAS.producto = id => {
  const p = DB.get('productos', id);
  if (!p || p.eliminado) return { titulo: 'Producto', atras: true, html: vacio('canasta', 'No existe') };
  if (!DB.puede('campo')) return sinCampo('Producto');
  const m = DB.puede('montos');
  const s = DB.stock(p.id), cp = DB.costoPromedio(p.id);
  const bajo = Number(p.minimo) > 0 && s <= Number(p.minimo);
  let h = '<div class="card"><div class="small muted">' + esc(tipoP(p.tipo)) + '</div><h2 style="margin:2px 0 8px">' + esc(p.nombre) + '</h2><table class="tabla">' +
    (p.dosis ? '<tr><td class="muted">Dosis</td><td class="m">' + esc(p.dosis) + '</td></tr>' : '') +
    (Number(p.carencia) > 0 ? '<tr><td class="muted">Carencia</td><td class="m">' + cant(p.carencia) + ' días</td></tr>' : '') +
    (p.vence ? '<tr><td class="muted">Vence</td><td class="m">' + fecha(p.vence) + (p.vence < HOY() ? ' ' + pill('Vencido', 'err') : '') + '</td></tr>' : '') +
    (Number(p.minimo) > 0 ? '<tr><td class="muted">Stock mínimo</td><td class="m">' + fmtStock(p.minimo, p.unidad) + '</td></tr>' : '') +
    (p.nota ? '<tr><td class="muted">Notas</td><td class="m" style="white-space:normal">' + esc(p.nota) + '</td></tr>' : '') + '</table></div>';
  h += '<div class="kpis"><div class="kpi ' + (bajo ? 'tono-warn' : 'hero') + '"><div class="l">En almacén</div><div class="v">' + fmtStock(s, p.unidad) + '</div><div class="s">' + (bajo ? 'Stock bajo' : 'Disponible') + '</div></div>' +
    (m ? '<div class="kpi"><div class="l">Costo promedio</div><div class="v">' + soles(cp) + '</div><div class="s">por ' + esc(p.unidad) + '</div></div>' : '') + '</div>';
  h += '<div class="btns" style="margin-bottom:12px"><button class="btn pri" data-act="entradaInv" data-p="' + p.id + '">' + ico('mas') + 'Compra / entrada</button>' +
    ((TIPOS_PRODUCTO[p.tipo] || {}).aplica ? '<button class="btn" data-act="aplicacionNueva" data-p="' + p.id + '">' + ico('hoja') + 'Aplicar</button>' : '<button class="btn" data-act="salidaInv" data-p="' + p.id + '">' + ico('menos') + 'Uso / salida</button>') + '</div>' +
    '<div class="btns" style="margin-bottom:12px"><button class="btn chico" data-act="ajusteInv" data-p="' + p.id + '">' + ico('ajustes', 's') + 'Corregir con un conteo</button>' +
    '<button class="btn chico" data-act="buscarEnTienda" data-q="' + esc(p.nombre.split(' ')[0]) + '" style="color:var(--blue-text)">' + ico('tienda', 's') + 'Comprar en la tienda</button></div>';
  const movs = DB.movsProducto(p.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  h += '<div class="grupo">Entradas y salidas</div>' + (movs.length ? '<div class="lista">' + movs.map(x => {
    const signo = x.tipo === 'salida' ? -1 : 1, q = signo * x.cantidad;
    const t = x.tipo === 'entrada' ? 'Entrada' + (x.proveedor ? ' · ' + x.proveedor : '') : x.tipo === 'ajuste' ? 'Ajuste por conteo' : x.aplicacionId ? 'Aplicado' : 'Salida';
    return '<div class="fila" data-act="movInvEditar" data-id="' + x.id + '">' + ico(x.tipo === 'entrada' ? 'descargar' : x.tipo === 'ajuste' ? 'ajustes' : 'subir') + '<div class="cuerpo-f"><div class="t">' + esc(t) + '</div><div class="d">' + fechaCorta(x.fecha) + (x.nota ? ' · ' + esc(x.nota) : '') +
      (m && x.tipo === 'entrada' && x.costoUnit ? ' · ' + soles(x.costoUnit) + ' c/u' : '') + '</div></div><div class="x"><div class="t" style="color:' + (q < 0 ? 'var(--red-text)' : 'var(--green-text)') + '">' + (q > 0 ? '+' : '') + cant(q) + '</div></div></div>';
  }).join('') + '</div>' : vacio('canasta', 'Sin movimientos'));
  return { titulo: 'Producto', atras: true, html: h, acciones: '<button class="icon-btn" data-act="productoEditar" data-id="' + p.id + '" aria-label="Editar">' + ico('editar') + '</button>' };
};

function formEntrada(p, mv) {
  if (!puedeOToast('campo')) return;
  if (mv) { const b = DB.bloqueo(mv); if (b) return toast(b, 'error'); }
  const m = DB.puede('montos');
  const g = mv && mv.gastoId ? DB.get('gastos', mv.gastoId) : null;
  const camp = DB.campaniaActiva();
  formulario({
    titulo: (mv ? 'Corregir entrada · ' : 'Compra · ') + p.nombre,
    valores: mv ? Object.assign({}, mv, { comoGasto: !!g, pagadoSeg: g && g.pagado === false ? 'no' : 'si', campaniaId: g ? g.campaniaId : (camp ? camp.id : '') })
      : { fecha: HOY(), costoUnit: DB.costoPromedio(p.id) || '', comoGasto: m, pagadoSeg: 'si', campaniaId: camp ? camp.id : '', proveedor: 'CHINCARMAS' },
    campos: [
      { id: 'cantidad', et: 'Cantidad (' + p.unidad + ')', tipo: 'num', req: true, min: 0.01, par: true, foco: !mv },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      m ? { id: 'costoUnit', et: 'Precio por ' + p.unidad + ' (S/)', tipo: 'num', min: 0, par: true } : null,
      { id: 'proveedor', et: 'Proveedor', tipo: 'texto' },
      m ? { id: 'total', tipo: 'calc', calc: x => '<span>Total</span><b>' + soles((Number(x.cantidad) || 0) * (Number(x.costoUnit) || 0)) + '</b>' } : null,
      m && !mv ? { id: 'comoGasto', et: 'Registrar también como gasto de la campaña', tipo: 'chk' } : null,
      m ? { id: 'campaniaId', et: 'Campaña', tipo: 'select', ops: opsCampanias(), ver: x => x.comoGasto } : null,
      m ? { id: 'pagadoSeg', et: '¿Ya se pagó?', tipo: 'seg', ops: [{ v: 'si', t: 'Pagado' }, { v: 'no', t: 'Por pagar' }], ver: x => x.comoGasto } : null,
      m ? { id: 'vence', et: 'Pagar hasta', tipo: 'fecha', ver: x => x.comoGasto && x.pagadoSeg === 'no' } : null,
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'N° de boleta, lote…' },
    ].filter(Boolean),
    eliminar: mv && DB.puede('eliminar') ? async () => {
      if (await confirmar('Eliminar entrada', 'Se quitarán ' + fmtStock(mv.cantidad, p.unidad) + ' del almacén' + (g ? ' y su gasto de ' + soles(g.monto) : '') + '.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('inventario', mv.id, 'Entrada de ' + p.nombre); if (g) DB.eliminar('gastos', g.id, g.descripcion); cerrarTodas(); render();
      }
    } : null,
    alGuardar: x => {
      const d = { productoId: p.id, tipo: 'entrada', cantidad: x.cantidad, costoUnit: Number(x.costoUnit) || 0, fecha: x.fecha, proveedor: x.proveedor || '', nota: x.nota || '' };
      const total = r2(d.cantidad * d.costoUnit);
      const datosGasto = () => ({ categoria: (TIPOS_PRODUCTO[p.tipo] || TIPOS_PRODUCTO.otro).cat, descripcion: plural(d.cantidad, p.unidad) + ' de ' + p.nombre, monto: total, fecha: d.fecha,
        proveedor: d.proveedor, campaniaId: x.campaniaId, pagado: x.pagadoSeg !== 'no', vence: x.pagadoSeg === 'no' ? (x.vence || '') : '', nota: 'Compra registrada en el almacén' });
      const tx = 'Entrada de ' + p.nombre + ': ' + cant(d.cantidad) + ' ' + p.unidad;
      if (mv) {
        DB.editar('inventario', mv.id, d, tx);
        if (g) DB.editar('gastos', g.id, datosGasto(), 'Gasto: ' + datosGasto().descripcion);
      } else {
        if (x.comoGasto && total > 0) {
          const c = DB.get('campanias', x.campaniaId);
          if (c && c.cerrada) return 'La campaña "' + c.nombre + '" está cerrada';
          d.gastoId = DB.crear('gastos', datosGasto(), 'Gasto: ' + datosGasto().descripcion + ' ' + soles(total)).id;
        }
        DB.crear('inventario', d, tx);
      }
      toast('Entrada registrada'); render();
    },
  });
}
ACC.entradaInv = el => formEntrada(DB.get('productos', el.dataset.p), null);
function formSalida(p, mv) {
  if (!puedeOToast('campo')) return;
  formulario({
    titulo: (mv ? 'Corregir salida · ' : 'Uso / salida · ') + p.nombre, valores: mv ? Object.assign({}, mv) : { fecha: HOY() },
    campos: [
      { id: 'cantidad', et: 'Cantidad (' + p.unidad + ')', tipo: 'num', req: true, min: 0.01, par: true, foco: !mv, ayuda: 'En almacén: ' + fmtStock(DB.stock(p.id) + (mv ? mv.cantidad : 0), p.unidad) },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      { id: 'nota', et: 'Motivo', tipo: 'texto', ph: 'Ej. combustible para la motoguadaña' },
    ],
    eliminar: mv && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar salida', 'Se devolverán ' + fmtStock(mv.cantidad, p.unidad) + ' al almacén.', { si: 'Eliminar', peligro: true })) { DB.eliminar('inventario', mv.id, 'Salida de ' + p.nombre); cerrarTodas(); render(); } } : null,
    alGuardar: x => {
      const d = { productoId: p.id, tipo: 'salida', cantidad: x.cantidad, fecha: x.fecha, nota: x.nota || '' };
      if (mv) DB.editar('inventario', mv.id, d, 'Salida de ' + p.nombre); else DB.crear('inventario', d, 'Salida de ' + p.nombre + ': ' + cant(x.cantidad) + ' ' + p.unidad);
      toast('Guardado'); render();
    },
  });
}
ACC.salidaInv = el => formSalida(DB.get('productos', el.dataset.p), null);
ACC.buscarEnTienda = el => { EST.q = el.dataset.q || ''; EST.cat = 'todos'; ir('tienda'); };
ACC.ajusteInv = el => {
  if (!puedeOToast('campo')) return;
  const p = DB.get('productos', el.dataset.p), s = DB.stock(p.id);
  formulario({
    titulo: 'Conteo de ' + p.nombre, valores: { contado: s },
    campos: [
      { id: 'contado', et: '¿Cuánto hay realmente? (' + p.unidad + ')', tipo: 'num', req: true, min: 0, foco: true, ayuda: 'La app dice que hay ' + fmtStock(s, p.unidad) },
      { id: 'nota', et: 'Motivo', tipo: 'texto', ph: 'Ej. se rompió un saco' },
    ],
    alGuardar: x => {
      const dif = r2(x.contado - s);
      if (!dif) { toast('El conteo coincide, no hay nada que corregir'); return; }
      DB.crear('inventario', { productoId: p.id, tipo: 'ajuste', cantidad: dif, fecha: HOY(), nota: x.nota || 'Conteo físico' }, 'Ajuste de ' + p.nombre + ': ' + (dif > 0 ? '+' : '') + dif + ' ' + p.unidad);
      toast('Stock corregido'); render();
    },
  });
};
ACC.movInvEditar = el => {
  const mv = DB.get('inventario', el.dataset.id), p = DB.get('productos', mv.productoId);
  if (mv.aplicacionId) return formAplicacion(DB.get('aplicaciones', mv.aplicacionId));
  if (mv.tipo === 'entrada') return formEntrada(p, mv);
  if (mv.tipo === 'salida') return formSalida(p, mv);
  if (DB.puede('eliminar')) confirmar('Eliminar ajuste', 'Se deshará el ajuste de ' + cant(mv.cantidad) + ' ' + p.unidad + '.', { si: 'Eliminar', peligro: true }).then(ok => { if (ok) { DB.eliminar('inventario', mv.id, 'Ajuste de ' + p.nombre); render(); } });
};

/* ==========================================================================
   ABONOS Y QUÍMICOS
   ========================================================================== */
let tabAbonos = 'proximas';
VISTAS.abonos = () => {
  if (!DB.puede('campo')) return sinCampo('Abonos y químicos');
  const m = DB.puede('montos');
  let h = '<div class="chips-h">' + [['proximas', 'Próximas'], ['hechas', 'Aplicaciones'], ['planes', 'Plan de abonamiento']].map(([k, t]) =>
    '<button class="' + (tabAbonos === k ? 'on' : '') + '" data-act="tabAbonos" data-t="' + k + '">' + t + '</button>').join('') + '</div>';
  let fab = { t: 'Registrar aplicación', icono: 'mas', act: 'aplicacionNueva' };
  if (tabAbonos === 'proximas') {
    const al = DB.alertas(DB.chacraId, 30);
    const car = al.filter(a => a.tipo === 'carencia');
    const ab = al.filter(a => a.tipo === 'abono');
    if (car.length) h += car.map(c => '<a class="aviso tono-err" href="#/' + c.ruta + '" style="text-decoration:none">' + ico('alerta', 's') + '<div><b>' + esc(c.titulo) + '</b><div class="small">' + esc(c.texto) + '</div></div></a>').join('');
    h += htmlOfertas(2, o => !!((o.segmento || {}).abonoDias || (o.segmento || {}).stockBajo));
    h += ab.length ? '<div class="lista">' + ab.map(a => '<div class="fila" data-act="aplicarPlan" data-plan="' + a.planId + '" data-parcela="' + a.parcelaId + '">' + ico('hoja') +
      '<div class="cuerpo-f"><div class="t">' + esc(a.titulo) + '</div><div class="d">' + (a.texto ? esc(a.texto) + ' · ' : '') + 'toca ' + esc(fechaCorta(a.fecha).toLowerCase()) + '</div></div>' +
      (a.atrasada ? pill('Atrasada', 'err') : a.fecha === HOY() ? pill('Hoy', 'warn') : a.fecha === sumarDias(HOY(), 1) ? pill('Mañana', 'warn') : pill(fecha(a.fecha).slice(0, 5), 'info')) + '</div>').join('') + '</div>' +
      '<p class="small muted">Toca una para registrar que ya se aplicó.</p>'
      : vacio('hoja', 'No hay aplicaciones programadas para los próximos 30 días', '<p class="small">Crea un <b>plan de abonamiento</b> (ej. "Urea cada 30 días") y la app te avisará cuándo toca.</p>');
  } else if (tabAbonos === 'hechas') {
    const xs = DB.deChacra('aplicaciones').sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
    const camp = DB.campaniaActiva();
    if (m && camp) { const dc = xs.filter(a => a.campaniaId === camp.id); h += '<div class="kpis"><div class="kpi"><div class="l">Aplicaciones en la campaña</div><div class="v">' + dc.length + '</div></div><div class="kpi"><div class="l">Valor aplicado</div><div class="v">' + soles(sumar(dc, a => a.costo)) + '</div><div class="s">a costo promedio</div></div></div>'; }
    h += xs.length ? '<div class="lista">' + xs.map(filaAplicacion).join('') + '</div>' : vacio('hoja', 'Aún no se registran aplicaciones');
  } else {
    fab = { t: 'Nuevo plan', icono: 'mas', act: 'planEditar' };
    const pls = DB.deChacra('planes').sort((a, b) => (a.activo === false) - (b.activo === false) || a.producto.localeCompare(b.producto));
    h += pls.length ? '<div class="lista">' + pls.map(pl => {
      const prox = (pl.parcelas || []).map(pid => DB.proximaPlan(pl, pid)).filter(Boolean).sort()[0];
      return '<div class="fila" data-act="planEditar" data-id="' + pl.id + '">' + ico('calendario') + '<div class="cuerpo-f"><div class="t">' + esc(pl.producto) + (pl.activo === false ? ' ' + pill('Pausado', 'warn') : '') + '</div>' +
        '<div class="d">Cada ' + pl.cadaDias + ' días · ' + esc((pl.parcelas || []).map(nomP).join(', ')) + (pl.dosis ? ' · ' + esc(pl.dosis) : '') + '</div></div>' +
        (prox && pl.activo !== false ? '<div class="x"><div class="d">próxima</div><div class="t">' + esc(fechaCorta(prox)) + '</div></div>' : '') + '</div>';
    }).join('') + '</div>' : vacio('calendario', 'Sin planes de abonamiento', '<p class="small">Ejemplo: "Urea 46%, 200 g por planta, cada 30 días, en Lote 1 y Lote 2".</p>');
  }
  h += '<div class="btns" style="margin-top:4px"><a class="btn chico" href="#/inventario">' + ico('canasta', 's') + 'Almacén</a><a class="btn chico" href="#/calendario">' + ico('calendario', 's') + 'Calendario</a></div>';
  return { titulo: 'Abonos y químicos', html: h, atras: true, fab };
};
ACC.tabAbonos = el => { tabAbonos = el.dataset.t; render(); };
function filaAplicacion(a) {
  const c = Number(a.carencia) > 0 ? sumarDias(a.fecha, Number(a.carencia)) : null;
  return '<div class="fila" data-act="aplicacionEditar" data-id="' + a.id + '">' + ico('hoja') + '<div class="cuerpo-f"><div class="t">' + esc(a.producto) + ' · ' + esc(nomP(a.parcelaId)) + '</div>' +
    '<div class="d">' + fechaCorta(a.fecha) + (a.cantidad ? ' · ' + cant(a.cantidad) + ' ' + esc(a.unidad || '') : '') + (a.dosis ? ' · ' + esc(a.dosis) : '') + (a.forma ? ' · ' + esc(a.forma) : '') + '</div></div>' +
    (c && c > HOY() ? pill('Carencia hasta ' + fecha(c).slice(0, 5), 'err') : DB.puede('montos') && a.costo ? '<div class="x"><div class="t">' + soles(a.costo) + '</div></div>' : '') + '</div>';
}

function formAplicacion(a, preset) {
  if (!puedeOToast('campo')) return;
  if (a) { const b = DB.bloqueo(a); if (b) return toast(b, 'error'); }
  preset = preset || {};
  const ps = productosAplicables();
  const m = DB.puede('montos');
  const salida = a ? DB.deChacra('inventario').find(x => x.aplicacionId === a.id) : null;
  if (!parcelasChacra().length) return toast('Primero registra tus parcelas (Más → Parcelas)', 'error');
  const plan = preset.planId ? DB.get('planes', preset.planId) : (a && a.planId ? DB.get('planes', a.planId) : null);
  const val = a ? Object.assign({}, a, { productoId: a.productoId || '_otro', nombreOtro: a.productoId ? '' : a.producto })
    : { fecha: HOY(), parcelaId: preset.parcelaId || (parcelasChacra()[0] || {}).id, productoId: preset.productoId || (plan && plan.productoId) || (ps[0] ? ps[0].id : '_otro'),
        nombreOtro: plan && !plan.productoId ? plan.producto : '', tipoOtro: plan && !plan.productoId ? plan.tipo : 'abono', dosis: plan ? plan.dosis : '', forma: 'Al suelo', planId: plan ? plan.id : '' };
  const prod = x => x.productoId && x.productoId !== '_otro' ? DB.get('productos', x.productoId) : null;
  if (!a) { const p0 = prod(val); if (p0) { if (!val.dosis) val.dosis = p0.dosis || ''; val.carencia = p0.carencia || ''; } else val.carencia = ''; }
  formulario({
    titulo: a ? 'Corregir aplicación' : 'Registrar aplicación', valores: val,
    aviso: plan ? 'Plan: ' + esc(plan.producto) + ' cada ' + plan.cadaDias + ' días' : '',
    campos: [
      { id: 'productoId', et: 'Producto', tipo: 'select', req: true, ops: ps.map(p => ({ v: p.id, t: p.nombre + ' (' + fmtStock(DB.stock(p.id) + (salida && salida.productoId === p.id ? salida.cantidad : 0), p.unidad) + ')' })).concat([{ v: '_otro', t: 'Otro (no está en el almacén)' }]) },
      { id: 'nombreOtro', et: 'Nombre del producto', tipo: 'texto', req: true, ver: x => x.productoId === '_otro' },
      { id: 'tipoOtro', et: 'Tipo', tipo: 'select', ops: Object.keys(TIPOS_PRODUCTO).filter(k => TIPOS_PRODUCTO[k].aplica).map(k => ({ v: k, t: TIPOS_PRODUCTO[k].t })), ver: x => x.productoId === '_otro' },
      { id: 'parcelaId', et: 'Parcela', tipo: 'select', req: true, ops: parcelasChacra().map(p => ({ v: p.id, t: p.nombre })), par: true },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true, valida: v => v > HOY() ? 'Para programar a futuro usa el plan de abonamiento' : '' },
      { id: 'dosis', et: 'Dosis', tipo: 'texto', ph: '200 g/planta · 250 ml/cilindro' },
      { id: 'cantidad', et: 'Cantidad usada', tipo: 'num', min: 0, par: true, ayuda: 'En la unidad del producto. Se descuenta del almacén.' },
      { id: 'forma', et: 'Forma', tipo: 'select', ops: FORMAS_APLICACION },
      { id: 'stockAviso', tipo: 'html', html: x => {
        const p = prod(x); if (!p || !(Number(x.cantidad) > 0)) return '';
        const disp = DB.stock(p.id) + (salida && salida.productoId === p.id ? salida.cantidad : 0);
        return Number(x.cantidad) > disp ? '<div class="aviso tono-warn small">' + ico('alerta', 's') + '<div>Solo hay ' + fmtStock(disp, p.unidad) + ' en el almacén. Si guardas, el stock quedará en negativo: registra la compra que falta.</div></div>' : '';
      } },
      { id: 'carencia', et: 'Periodo de carencia (días)', tipo: 'num', min: 0, max: 365, ayuda: 'Días sin cosechar esa parcela. Déjalo vacío si no aplica.' },
      { id: 'aplicadoPor', et: 'Aplicado por', tipo: 'select', ops: [{ v: '', t: 'No indicado' }].concat(trabajadoresChacra(true).map(t => ({ v: t.id, t: t.nombre }))) },
      m ? { id: 'costo', tipo: 'calc', calc: x => { const p = prod(x); return '<span>Valor de lo aplicado</span><b>' + soles(p ? (Number(x.cantidad) || 0) * DB.costoPromedio(p.id) : 0) + '</b>'; } } : null,
      { id: 'nota', et: 'Observaciones', tipo: 'texto', ph: 'Clima, plaga observada…' },
    ].filter(Boolean),
    alCambiar: (x, origen, h) => {
      if (origen === 'productoId' && !a) {
        const p = prod(x);
        const set = (c, v) => { const el = h.querySelector('[data-c="' + c + '"]'); if (el) { el.value = v; x[c] = v; } };
        if (p) { if (p.dosis) set('dosis', p.dosis); set('carencia', p.carencia || ''); }
      }
    },
    eliminar: a && DB.puede('eliminar') ? async () => {
      if (await confirmar('Eliminar aplicación', esc(a.producto) + ' en ' + esc(nomP(a.parcelaId)) + '. ' + (salida ? 'Se devolverán ' + fmtStock(salida.cantidad, a.unidad) + ' al almacén.' : ''), { si: 'Eliminar', peligro: true })) {
        DB.eliminar('aplicaciones', a.id, a.producto + ' en ' + nomP(a.parcelaId)); if (salida) DB.eliminar('inventario', salida.id, 'Salida por aplicación eliminada'); cerrarTodas(); render();
      }
    } : null,
    alGuardar: x => {
      const p = prod(x);
      const d = { fecha: x.fecha, parcelaId: x.parcelaId, productoId: p ? p.id : '', producto: p ? p.nombre : x.nombreOtro.trim(), tipo: p ? p.tipo : x.tipoOtro,
        unidad: p ? p.unidad : '', dosis: x.dosis || '', cantidad: Number(x.cantidad) || 0, forma: x.forma || '', carencia: Number(x.carencia) || 0,
        aplicadoPor: x.aplicadoPor || '', nota: x.nota || '', planId: x.planId || (a ? a.planId : '') || '' };
      d.costo = p ? r2(d.cantidad * DB.costoPromedio(p.id)) : 0;
      const tx = d.producto + ' en ' + nomP(d.parcelaId) + ' · ' + fecha(d.fecha);
      let reg;
      if (a) reg = DB.editar('aplicaciones', a.id, d, tx);
      else { const camp = DB.campaniaActiva(); d.campaniaId = camp ? camp.id : null; reg = DB.crear('aplicaciones', d, 'Aplicación: ' + tx); }
      // Descontar del almacén
      if (p && d.cantidad > 0) {
        const s = { productoId: p.id, tipo: 'salida', cantidad: d.cantidad, fecha: d.fecha, aplicacionId: reg.id, nota: 'Aplicado en ' + nomP(d.parcelaId) };
        if (salida) DB.editar('inventario', salida.id, s, '', true); else DB.crear('inventario', s, 'Salida de ' + p.nombre + ' por aplicación');
      } else if (salida) DB.eliminar('inventario', salida.id, 'Salida quitada de la aplicación');
      toast(d.carencia ? 'Registrado. ' + nomP(d.parcelaId) + ' no se cosecha hasta el ' + fecha(sumarDias(d.fecha, d.carencia)) : 'Aplicación registrada');
      render();
    },
  });
}
ACC.aplicacionNueva = el => formAplicacion(null, { productoId: el.dataset && el.dataset.p });
ACC.aplicacionEditar = el => formAplicacion(DB.get('aplicaciones', el.dataset.id));
ACC.aplicarPlan = el => formAplicacion(null, { planId: el.dataset.plan, parcelaId: el.dataset.parcela });

ACC.planEditar = el => {
  if (!puedeOToast('campo')) return;
  const pl = el.dataset && el.dataset.id ? DB.get('planes', el.dataset.id) : null;
  const ps = productosAplicables();
  formulario({
    titulo: pl ? 'Editar plan' : 'Nuevo plan de abonamiento',
    valores: pl ? Object.assign({}, pl, { productoId: pl.productoId || '_otro', nombreOtro: pl.productoId ? '' : pl.producto })
      : { productoId: ps[0] ? ps[0].id : '_otro', tipo: 'abono', cadaDias: 30, inicio: HOY(), activo: true, parcelas: parcelasChacra().map(p => p.id) },
    campos: [
      { id: 'productoId', et: 'Producto', tipo: 'select', req: true, ops: ps.map(p => ({ v: p.id, t: p.nombre })).concat([{ v: '_otro', t: 'Otro (no está en el almacén)' }]) },
      { id: 'nombreOtro', et: 'Nombre del producto', tipo: 'texto', req: true, ver: x => x.productoId === '_otro' },
      { id: 'parcelas', et: 'En qué parcelas', tipo: 'multi', req: true, ops: parcelasChacra().map(p => ({ v: p.id, t: p.nombre })) },
      { id: 'dosis', et: 'Dosis', tipo: 'texto', ph: '200 g por planta' },
      { id: 'cadaDias', et: 'Cada cuántos días', tipo: 'num', req: true, min: 1, max: 365, par: true },
      { id: 'inicio', et: 'Primera aplicación', tipo: 'fecha', req: true },
      { id: 'fin', et: 'Hasta (opcional)', tipo: 'fecha', par: true, valida: (v, x) => v < x.inicio ? 'Debe ser después del inicio' : '' },
      { id: 'activo', et: 'Plan activo', tipo: 'chk' },
      { id: 'nota', et: 'Notas', tipo: 'texto', ph: 'Ej. aplicar después de la lluvia' },
    ],
    eliminar: pl && DB.puede('eliminar') ? async () => { if (await confirmar('Eliminar plan', 'Las aplicaciones ya hechas se conservan.', { si: 'Eliminar', peligro: true })) { DB.eliminar('planes', pl.id, 'Plan ' + pl.producto); cerrarTodas(); render(); } } : null,
    alGuardar: x => {
      const p = x.productoId !== '_otro' ? DB.get('productos', x.productoId) : null;
      const d = { productoId: p ? p.id : '', producto: p ? p.nombre : x.nombreOtro.trim(), tipo: p ? p.tipo : 'abono', parcelas: x.parcelas, dosis: x.dosis || '',
        cadaDias: Math.round(x.cadaDias), inicio: x.inicio, fin: x.fin || '', activo: !!x.activo, nota: x.nota || '' };
      const tx = 'Plan: ' + d.producto + ' cada ' + d.cadaDias + ' días';
      if (pl) DB.editar('planes', pl.id, d, tx); else DB.crear('planes', d, tx);
      toast('Plan guardado'); tabAbonos = 'planes'; render();
    },
  });
};

/* ==========================================================================
   CALENDARIO
   ========================================================================== */
const ECAL = { mes: HOY().slice(0, 7), dia: HOY() };
/** Eventos entre dos fechas en la chacra actual (pasados y programados). */
function eventosCalendario(desde, hasta) {
  const hoy = HOY(), ev = [], en = f => f && f >= desde && f <= hasta;
  for (const a of DB.deChacra('aplicaciones')) if (en(a.fecha)) ev.push({ fecha: a.fecha, tipo: 'aplicado', titulo: 'Aplicado: ' + a.producto + ' en ' + nomP(a.parcelaId), act: 'aplicacionEditar', id: a.id });
  for (const pl of DB.deChacra('planes').filter(p => p.activo !== false)) {
    for (const pid of pl.parcelas || []) {
      let f = DB.proximaPlan(pl, pid), n = 0;
      while (f && f <= hasta && n < 60) {
        if (f >= desde) ev.push({ fecha: f, tipo: 'abono', titulo: pl.producto + ' en ' + nomP(pid) + (pl.dosis ? ' · ' + pl.dosis : ''), atrasada: f < hoy, act: 'aplicarPlan', plan: pl.id, parcela: pid });
        f = sumarDias(f, Math.max(1, Number(pl.cadaDias) || 30)); n++;
        if (pl.fin && f > pl.fin) break;
      }
    }
  }
  for (const a of DB.deChacra('actividades')) if (en(a.fecha)) ev.push({ fecha: a.fecha, tipo: 'actividad', titulo: (a.hecha ? '✓ ' : '') + a.labor + ' en ' + nomP(a.parcelaId), ruta: 'parcela/' + a.parcelaId, atrasada: !a.hecha && a.fecha < hoy });
  if (DB.puede('finanzas')) {
    for (const v of DB.deChacra('ventas')) if (en(v.vence) && DB.saldoVenta(v) > 0.004) ev.push({ fecha: v.vence, tipo: 'cobro', titulo: 'Cobrar ' + soles(DB.saldoVenta(v)) + ' a ' + nomCli(v.clienteId), ruta: 'venta/' + v.id, atrasada: v.vence < hoy });
    for (const g of DB.deChacra('gastos')) if (g.pagado === false && en(g.vence)) ev.push({ fecha: g.vence, tipo: 'pago', titulo: 'Pagar ' + soles(g.monto) + ': ' + g.descripcion, ruta: 'cuentas', atrasada: g.vence < hoy });
  }
  for (const c of DB.deChacra('contratas')) if (c.estado !== 'terminada' && en(c.fin)) ev.push({ fecha: c.fin, tipo: 'contrata', titulo: 'Termina contrata: ' + c.contratista + ' (' + c.labor + ')', ruta: 'contrata/' + c.id });
  for (const p of DB.deChacra('productos')) if (en(p.vence) && DB.stock(p.id) > 0) ev.push({ fecha: p.vence, tipo: 'vence', titulo: 'Vence: ' + p.nombre, ruta: 'producto/' + p.id });
  if (DB.puede('montos')) {
    for (let f = DB.semana(desde).hasta; f <= hasta; f = sumarDias(f, 7)) {
      if (f < hoy || f > sumarDias(hoy, 6)) continue;
      const n = trabajadoresChacra(true).filter(t => DB.saldo(t.id, DB.chacraId) > 0).length;
      if (n) ev.push({ fecha: f, tipo: 'liquidar', titulo: 'Cierre de semana: ' + n + ' trabajador(es) por pagar', ruta: 'pagos' });
    }
  }
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function filaEvento(e, conFecha) {
  const attrs = e.act ? 'data-act="' + e.act + '"' + (e.id ? ' data-id="' + e.id + '"' : '') + (e.plan ? ' data-plan="' + e.plan + '" data-parcela="' + e.parcela + '"' : '') : 'data-act="ir" data-ruta="' + (e.ruta || 'calendario') + '"';
  return '<div class="fila" ' + attrs + '>' + ico(ICONO_ALERTA[e.tipo] || 'info') + '<div class="cuerpo-f"><div class="t" style="white-space:normal">' + esc(e.titulo) + '</div>' +
    (conFecha ? '<div class="d">' + esc(fechaCorta(e.fecha)) + '</div>' : '') + '</div>' + (e.atrasada ? pill('Atrasado', 'err') : '') + '</div>';
}
VISTAS.calendario = () => {
  const [a, m] = ECAL.mes.split('-').map(Number);
  const ini = ECAL.mes + '-01', fin = fechaISO(new Date(a, m, 0));
  const ev = eventosCalendario(ini, fin);
  const porDia = {};
  for (const e of ev) (porDia[e.fecha] = porDia[e.fecha] || []).push(e);
  const primero = (new Date(a, m - 1, 1).getDay() + 6) % 7; // lunes = 0
  const nombreMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'][m - 1];
  let h = '<div class="fecha-nav"><button class="icon-btn" data-act="mesCal" data-d="-1" aria-label="Mes anterior">' + ico('izq') + '</button><div style="flex:1;text-align:center;font-weight:600;font-size:18px">' + nombreMes + ' ' + a + '</div>' +
    '<button class="icon-btn" data-act="mesCal" data-d="1" aria-label="Mes siguiente">' + ico('der') + '</button></div>';
  h += '<div class="card" style="padding:10px"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center">' +
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => '<div class="tiny faint" style="padding:4px 0">' + d + '</div>').join('');
  for (let i = 0; i < primero; i++) h += '<div></div>';
  const nd = Number(fin.slice(8));
  for (let d = 1; d <= nd; d++) {
    const f = ECAL.mes + '-' + z2(d), es = porDia[f] || [];
    const sel = f === ECAL.dia, hoy = f === HOY();
    const puntos = es.slice(0, 4).map(e => '<i style="width:6px;height:6px;border-radius:50%;display:inline-block;background:var(--' + ({ ok: 'green', warn: 'amber-text', err: 'red', info: 'blue-text' }[e.atrasada ? 'err' : TONO_ALERTA[e.tipo]] || 'green') + ')"></i>').join('');
    h += '<button data-act="diaCal" data-f="' + f + '" style="border:0;border-radius:10px;min-height:48px;padding:4px 0;cursor:pointer;background:' + (sel ? 'var(--green)' : hoy ? 'var(--green-soft)' : 'transparent') +
      ';color:' + (sel ? 'var(--on-green)' : 'inherit') + ';font-weight:' + (hoy || sel ? 700 : 400) + '"><div>' + d + '</div><div style="display:flex;gap:2px;justify-content:center;min-height:6px">' + puntos + '</div></button>';
  }
  h += '</div></div>';
  const delDia = porDia[ECAL.dia] || [];
  h += '<div class="grupo">' + esc(fechaCorta(ECAL.dia)) + ' · ' + fecha(ECAL.dia) + '</div>' + (delDia.length ? '<div class="lista">' + delDia.map(e => filaEvento(e)).join('') + '</div>' : vacio('calendario', 'Nada programado este día'));
  const sem = eventosCalendario(HOY(), sumarDias(HOY(), 7)).filter(e => e.tipo !== 'aplicado');
  const atras = DB.alertas(DB.chacraId, 0).filter(e => e.atrasada);
  if (atras.length) h += '<div class="grupo">Atrasado</div><div class="lista">' + atras.map(e => filaEvento(Object.assign({}, e, { act: e.tipo === 'abono' ? 'aplicarPlan' : null, plan: e.planId, parcela: e.parcelaId }), true)).join('') + '</div>';
  h += '<div class="grupo">Próximos 7 días</div>' + (sem.length ? '<div class="lista">' + sem.map(e => filaEvento(e, true)).join('') + '</div>' : vacio('check', 'Semana tranquila'));
  return { titulo: 'Calendario', html: h, atras: true };
};
ACC.mesCal = el => { const [a, m] = ECAL.mes.split('-').map(Number); const d = new Date(a, m - 1 + Number(el.dataset.d), 1); ECAL.mes = fechaISO(d).slice(0, 7); ECAL.dia = ECAL.mes === HOY().slice(0, 7) ? HOY() : ECAL.mes + '-01'; render(); };
ACC.diaCal = el => { ECAL.dia = el.dataset.f; render(); };

/* ==========================================================================
   CUENTAS POR COBRAR Y POR PAGAR
   ========================================================================== */
let tabCuentas = 'cobrar';
VISTAS.cuentas = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Cuentas');
  const hoy = HOY();
  const venc = f => f ? (f < hoy ? pill('Vencido ' + fecha(f).slice(0, 5), 'err') : pill('Hasta ' + fecha(f).slice(0, 5), 'info')) : '';
  const cobrar = DB.deChacra('ventas').filter(v => DB.saldoVenta(v) > 0.004).sort((a, b) => (a.vence || '9').localeCompare(b.vence || '9'));
  const prov = DB.deChacra('gastos').filter(g => g.pagado === false).sort((a, b) => (a.vence || '9').localeCompare(b.vence || '9'));
  const trabs = trabajadoresChacra(true).map(t => ({ t, s: DB.saldo(t.id, DB.chacraId) })).filter(x => x.s > 0);
  const contr = DB.deChacra('contratas').map(c => ({ c, s: r2(c.monto - DB.pagadoContrata(c)) })).filter(x => x.s > 0);
  const totC = sumar(cobrar, v => DB.saldoVenta(v)), totP = sumar(prov, g => g.monto) + sumar(trabs, x => x.s) + sumar(contr, x => x.s);
  let h = '<div class="kpis"><div class="kpi tono-info"><div class="l">Te deben</div><div class="v">' + soles(totC) + '</div></div><div class="kpi tono-warn"><div class="l">Debes</div><div class="v">' + soles(totP) + '</div></div></div>';
  h += '<div class="chips-h">' + [['cobrar', 'Por cobrar'], ['pagar', 'Por pagar']].map(([k, t]) => '<button class="' + (tabCuentas === k ? 'on' : '') + '" data-act="tabCuentas" data-t="' + k + '">' + t + '</button>').join('') + '</div>';
  if (tabCuentas === 'cobrar') {
    h += cobrar.length ? '<div class="lista">' + cobrar.map(v => '<a class="fila" href="#/venta/' + v.id + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + esc(nomCli(v.clienteId)) + '</div><div class="d">Venta del ' + fecha(v.fecha) + ' · ' + plural(v.cantidad, v.unidad) + ' de ' + esc(nomC(v.cultivoId)) + '</div></div>' +
      '<div class="x"><div class="t">' + soles(DB.saldoVenta(v)) + '</div>' + venc(v.vence) + '</div></a>').join('') + '</div>' : vacio('check', 'Nadie te debe');
  } else {
    h += '<div class="grupo">Proveedores</div>' + (prov.length ? '<div class="lista">' + prov.map(g => '<div class="fila" data-act="pagarGasto" data-id="' + g.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">' + esc(g.proveedor || g.descripcion) + '</div><div class="d">' + esc(g.descripcion) + ' · ' + fecha(g.fecha) + '</div></div>' +
      '<div class="x"><div class="t">' + soles(g.monto) + '</div>' + venc(g.vence) + '</div></div>').join('') + '</div><p class="small muted">Toca una deuda para marcarla como pagada.</p>' : vacio('check', 'No debes a proveedores'));
    h += '<div class="grupo">Trabajadores</div>' + (trabs.length ? '<div class="lista">' + trabs.map(x => '<a class="fila" href="#/liquidacion/' + x.t.id + '"><span class="avatar">' + esc(iniciales(x.t.nombre)) + '</span><div class="cuerpo-f"><div class="t">' + esc(x.t.nombre) + '</div></div><div class="x"><div class="t">' + soles(x.s) + '</div></div></a>').join('') + '</div>' : vacio('check', 'Trabajadores al día'));
    if (contr.length) h += '<div class="grupo">Contratas</div><div class="lista">' + contr.map(x => '<a class="fila" href="#/contrata/' + x.c.id + '">' + ico('contrata') + '<div class="cuerpo-f"><div class="t">' + esc(x.c.contratista) + '</div><div class="d">' + esc(x.c.labor) + '</div></div><div class="x"><div class="t">' + soles(x.s) + '</div></div></a>').join('') + '</div>';
  }
  return { titulo: 'Cuentas', atras: true, html: h };
};
ACC.tabCuentas = el => { tabCuentas = el.dataset.t; render(); };
ACC.pagarGasto = el => {
  const g = DB.get('gastos', el.dataset.id);
  formulario({
    titulo: 'Pagar a ' + (g.proveedor || 'proveedor'), valores: { fechaPago: HOY(), forma: 'Efectivo' },
    campos: [
      { id: 'info', tipo: 'html', html: '<div class="calc"><span>' + esc(g.descripcion) + '</span><b>' + soles(g.monto) + '</b></div>' },
      { id: 'fechaPago', et: 'Fecha de pago', tipo: 'fecha', req: true },
      { id: 'forma', et: 'Forma', tipo: 'seg', ops: FORMAS_PAGO },
    ],
    guardar: 'Marcar pagado',
    alGuardar: x => { DB.editar('gastos', g.id, { pagado: true, fechaPago: x.fechaPago, formaPago: x.forma }, 'Pagado: ' + g.descripcion + ' ' + soles(g.monto)); toast('Pago registrado'); render(); },
  });
};

/* ==========================================================================
   FLUJO DE CAJA
   ========================================================================== */
let periodoCaja = 'mes';
VISTAS.caja = () => {
  if (!DB.puede('finanzas')) return sinFinanzas('Flujo de caja');
  const hoy = HOY(), d = new Date(hoy + 'T12:00:00');
  const mesIni = (y, mo) => fechaISO(new Date(y, mo, 1)), mesFin = (y, mo) => fechaISO(new Date(y, mo + 1, 0));
  let desde, hasta, nombre;
  if (periodoCaja === 'mes') { desde = mesIni(d.getFullYear(), d.getMonth()); hasta = hoy; nombre = 'este mes'; }
  else if (periodoCaja === 'pasado') { desde = mesIni(d.getFullYear(), d.getMonth() - 1); hasta = mesFin(d.getFullYear(), d.getMonth() - 1); nombre = 'el mes pasado'; }
  else { const c = DB.campaniaActiva(); desde = c ? c.inicio : mesIni(d.getFullYear(), 0); hasta = hoy; nombre = c ? c.nombre : 'el año'; }
  const movs = DB.caja(DB.chacraId, desde, hasta);
  const ent = sumar(movs.filter(x => x.monto > 0), x => x.monto), sal = -sumar(movs.filter(x => x.monto < 0), x => x.monto);
  let h = '<div class="chips-h">' + [['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['campania', 'Campaña']].map(([k, t]) => '<button class="' + (periodoCaja === k ? 'on' : '') + '" data-act="periodoCaja" data-p="' + k + '">' + t + '</button>').join('') + '</div>';
  h += '<div class="kpis"><div class="kpi tono-ok"><div class="l">Entró</div><div class="v">' + soles(ent) + '</div></div><div class="kpi tono-warn"><div class="l">Salió</div><div class="v">' + soles(sal) + '</div></div></div>';
  h += '<div class="kpi ' + (ent - sal >= 0 ? 'hero' : 'tono-err') + '" style="margin-bottom:12px"><div class="l">Diferencia en ' + esc(nombre) + '</div><div class="v">' + soles(ent - sal) + '</div><div class="s">' + fecha(desde) + ' – ' + fecha(hasta) + '</div></div>';
  // Últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const y = d.getFullYear(), mo = d.getMonth() - i;
    const xs = DB.caja(DB.chacraId, mesIni(y, mo), mesFin(y, mo));
    const nm = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'][new Date(y, mo, 1).getMonth()];
    meses.push({ l: nm, e: sumar(xs.filter(x => x.monto > 0), x => x.monto), s: -sumar(xs.filter(x => x.monto < 0), x => x.monto) });
  }
  let acum = 0;
  h += '<div class="card"><h3>Últimos 6 meses</h3><table class="tabla"><tr><td class="small muted">Mes</td><td class="m small muted">Entró</td><td class="m small muted">Salió</td><td class="m small muted">Saldo</td></tr>' +
    meses.map(x => { acum = r2(acum + x.e - x.s); return '<tr><td>' + x.l + '</td><td class="m">' + soles(x.e) + '</td><td class="m">' + soles(x.s) + '</td><td class="m" style="color:' + (x.e - x.s >= 0 ? 'var(--green-text)' : 'var(--red-text)') + '"><b>' + soles(x.e - x.s) + '</b></td></tr>'; }).join('') +
    '</table><p class="tiny faint" style="margin:8px 0 0">Acumulado de los 6 meses: ' + soles(acum) + '</p></div>';
  const grupos = {};
  for (const x of movs.filter(x => x.monto < 0)) grupos[x.grupo] = (grupos[x.grupo] || 0) - x.monto;
  const gs = Object.keys(grupos).map(k => ({ l: k, v: r2(grupos[k]) })).sort((a, b) => b.v - a.v);
  if (gs.length) h += '<div class="card"><h3>¿En qué salió el dinero?</h3>' + barras(gs, soles) + '</div>';
  h += '<div class="grupo">Movimientos de ' + esc(nombre) + '</div>' + (movs.length ? '<div class="lista">' + movs.slice().reverse().map(x =>
    '<div class="fila" data-act="ir" data-ruta="' + esc(x.ruta || 'caja') + '">' + ico(x.monto > 0 ? 'descargar' : 'subir') + '<div class="cuerpo-f"><div class="t">' + esc(x.concepto) + '</div><div class="d">' + fechaCorta(x.fecha) + ' · ' + esc(x.grupo) + '</div></div>' +
    '<div class="x"><div class="t" style="color:' + (x.monto > 0 ? 'var(--green-text)' : 'var(--red-text)') + '">' + (x.monto > 0 ? '+' : '−') + soles(Math.abs(x.monto)) + '</div></div></div>').join('') + '</div>' : vacio('dinero', 'Sin movimientos de dinero en este período'));
  h += '<p class="small muted">El flujo de caja muestra el dinero que de verdad entró y salió: cobros, pagos a trabajadores y contratas, gastos pagados e inversiones. Lo que está por cobrar o por pagar está en <a href="#/cuentas">Cuentas</a>.</p>';
  return { titulo: 'Flujo de caja', atras: true, html: h };
};
ACC.periodoCaja = el => { periodoCaja = el.dataset.p; render(); };

/* ==========================================================================
   AVISOS EN EL CELULAR (notificaciones de las 6:00 a. m.)
   ========================================================================== */
let _ultimosAvisos = null;
function calcularAvisos() {
  const items = [];
  const antes = DB.chacraId;
  const chacras = DB.todos('chacras');
  const ahora = Date.now();
  for (let i = 0; i < 7; i++) {
    const dia = sumarDias(HOY(), i);
    const lineas = [];
    for (const ch of chacras) {
      DB.chacraId = ch.id;
      const al = DB.alertas(ch.id, i).filter(a => a.fecha === dia && ['abono', 'actividad', 'cobro', 'pago', 'vence'].includes(a.tipo));
      if (i === 0) { const atr = DB.alertas(ch.id, 0).filter(a => a.atrasada && ['abono', 'actividad', 'cobro', 'pago'].includes(a.tipo)); if (atr.length) lineas.push(atr.length + ' pendiente(s) atrasado(s) en ' + ch.nombre); }
      for (const a of al) lineas.push((chacras.length > 1 ? ch.nombre + ': ' : '') + a.titulo + (a.dinero && a.texto ? ' (' + a.texto + ')' : ''));
    }
    // Ofertas: como máximo dos días por semana (lunes y jueves), solo si el agricultor aceptó.
    const dow = new Date(dia + 'T12:00:00').getDay();
    if ((dow === 1 || dow === 4) && DB.d.config.ofertas === true && window.ofertasParaMi) {
      const vistas = new Set();
      for (const ch of chacras) { DB.chacraId = ch.id; for (const o of ofertasParaMi()) if (!vistas.has(o.id) && (!o.fin || o.fin >= dia) && vistas.size < 2) { vistas.add(o.id); lineas.push('Oferta: ' + o.titulo + (o.precio ? ' a ' + soles(o.precio) : '')); } }
    }
    if (!lineas.length) continue;
    const d = new Date(dia + 'T06:00:00');
    if (d.getTime() < ahora) continue;
    items.push({ ts: d.getTime(), titulo: (i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : fechaCorta(dia)) + ' en tu chacra', texto: lineas.slice(0, 6).join('\n') + (lineas.length > 6 ? '\n…y ' + (lineas.length - 6) + ' más' : '') });
  }
  DB.chacraId = antes;
  return items;
}
function programarAvisos() {
  if (!NATIVO || !Android.programarAvisos) return;
  try {
    const txt = JSON.stringify(calcularAvisos());
    if (txt === _ultimosAvisos) return;
    _ultimosAvisos = txt;
    Android.programarAvisos(txt);
  } catch (e) { console.error(e); }
}
window.alGuardarDatos = programarAvisos;
