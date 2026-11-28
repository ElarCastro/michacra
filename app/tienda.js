'use strict';
/* ==========================================================================
   MI-CHACRA · Etapa 5: tienda CHINCARMAS (canal de ventas) y publicidad
   - El agricultor ve el catálogo, arma su carrito y pide; sigue sus pedidos.
   - La tienda (dueño y vendedor) gestiona productos, pedidos y ofertas.
   - Las ofertas se eligen DENTRO del celular del agricultor según su cultivo,
     zona, próximos abonos y stock: la tienda nunca recibe datos de la chacra.
   ========================================================================== */

const TIENDA_ID = 'chincarmas';
const ESTADOS_PEDIDO = {
  recibido: { t: 'Recibido', tono: 'warn', sig: 'confirmado', accion: 'Confirmar pedido' },
  confirmado: { t: 'Confirmado', tono: 'info', sig: 'preparando', accion: 'Empezar a preparar' },
  preparando: { t: 'Preparando', tono: 'info', sig: 'enviado', accion: 'Marcar enviado / listo para recoger' },
  enviado: { t: 'En camino / listo', tono: 'info', sig: 'entregado', accion: 'Marcar entregado' },
  entregado: { t: 'Entregado', tono: 'ok' },
  cancelado: { t: 'Cancelado', tono: 'err' },
};
const ORDEN_ESTADOS = ['recibido', 'confirmado', 'preparando', 'enviado', 'entregado'];
const tiendaRpc = (fn, args) => NUBE.rpc(fn, args, { url: NUBE_URL, key: NUBE_KEY });
const cacheT = () => (DB.d.tiendaCache = DB.d.tiendaCache || { perfil: {}, activa: false, desde: 0, items: { producto: {}, oferta: {} } });
const productosTienda = (todos) => Object.values(cacheT().items.producto).filter(p => !p.eliminado && (todos || p.activo !== false)).sort((a, b) => a.nombre.localeCompare(b.nombre));
const ofertasTienda = () => Object.values(cacheT().items.oferta).filter(o => !o.eliminado);
const perfilT = () => cacheT().perfil || {};
const nombreTienda = () => perfilT().nombre || 'CHINCARMAS S.A.C.';
const precioTxt = p => p.consultar || !(Number(p.precio) > 0) ? 'Consultar' : soles(p.precio);

/** Descarga lo nuevo del catálogo (solo cambios). Funciona sin internet con lo guardado. */
let _tiendaCargando = null;
async function actualizarTienda(forzar) {
  if (_tiendaCargando) return _tiendaCargando;
  const c = cacheT();
  if (!forzar && c.actualizado && Date.now() - c.actualizado < 60000) return false;
  _tiendaCargando = (async () => {
    try {
      const r = await tiendaRpc('mc_tienda_ver', { p_tienda: TIENDA_ID, p_desde: c.desde || 0 });
      if (!r) return false;
      c.activa = !!r.activa; c.perfil = r.perfil || {}; c.actualizado = Date.now();
      for (const it of r.items || []) { c.items[it.tipo][it.id] = Object.assign({}, it.data, { id: it.id }); c.desde = Math.max(c.desde || 0, it.mod); }
      DB.guardar();
      return true;
    } catch (e) { c.error = e.message; return false; }
    finally { _tiendaCargando = null; }
  })();
  return _tiendaCargando;
}

/* ---------- Identidad del agricultor ante la tienda (sin datos de su chacra) ---------- */
function clienteTienda() {
  if (!DB.d.cliente || !DB.d.cliente.id) { DB.d.cliente = { id: 'cl' + aleatorio(12), clave: aleatorio(24), _mod: Date.now() }; DB.marcar('cliente', 'cliente'); DB.guardar(); }
  return DB.d.cliente;
}

/* ==========================================================================
   OFERTAS PERSONALIZADAS (se calculan aquí, en el celular)
   ========================================================================== */
function ofertasParaMi() {
  if (DB.d.config.ofertas !== true || !DB.chacraId) return [];
  const hoy = HOY();
  const misCultivos = cultivosActivos().map(c => c.nombre.toLowerCase());
  const ch = DB.get('chacras', DB.chacraId) || {};
  const zona = (ch.ubicacion || '').toLowerCase();
  let alertas = null;
  const al = () => (alertas = alertas || DB.alertas(DB.chacraId, 30));
  return ofertasTienda().filter(o => {
    if (o.activa === false || (o.inicio && o.inicio > hoy) || (o.fin && o.fin < hoy)) return false;
    const s = o.segmento || {};
    if (s.cultivos && s.cultivos.length && !s.cultivos.some(c => misCultivos.includes(String(c).toLowerCase()))) return false;
    if (s.zona && s.zona.trim() && !zona.includes(s.zona.trim().toLowerCase())) return false;
    if (Number(s.abonoDias) > 0 && !al().some(a => a.tipo === 'abono' && a.fecha <= sumarDias(hoy, Number(s.abonoDias)))) return false;
    if (s.stockBajo && !al().some(a => a.tipo === 'stock')) return false;
    return true;
  });
}
function eventoOferta(id, tipo) {
  const reg = (DB.d.ofertasEventos = DB.d.ofertasEventos || {});
  const k = id + '|' + tipo;
  if (reg[k]) return;
  reg[k] = Date.now(); DB.guardar();
  tiendaRpc('mc_evento', { p_tienda: TIENDA_ID, p_oferta: id, p_cliente: clienteTienda().id, p_tipo: tipo }).catch(() => { delete reg[k]; });
}
/** Tarjetas de ofertas (para Inicio, Abonos, Almacén). */
function htmlOfertas(max, filtro) {
  let os = ofertasParaMi();
  if (filtro) os = os.filter(filtro);
  os = os.slice(0, max || 2);
  for (const o of os) eventoOferta(o.id, 'vista');
  return os.map(o => {
    const p = o.productoId ? cacheT().items.producto[o.productoId] : null;
    return '<div class="card tono-info" data-act="abrirOferta" data-id="' + o.id + '" style="display:flex;gap:12px;align-items:center;cursor:pointer;margin-bottom:10px">' +
      (p && p.foto ? '<img src="' + p.foto + '" alt="" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex:none">' : '<span class="avatar" style="background:var(--card)">' + ico('dinero') + '</span>') +
      '<div style="flex:1;min-width:0"><div class="tiny" style="font-weight:600">OFERTA · ' + esc(nombreTienda()) + '</div><div style="font-weight:700">' + esc(o.titulo) + '</div>' +
      (o.texto ? '<div class="small">' + esc(o.texto) + '</div>' : '') + '</div><b>' + (o.precio ? soles(o.precio) : 'Ver') + '</b></div>';
  }).join('');
}
ACC.abrirOferta = el => {
  const o = cacheT().items.oferta[el.dataset.id];
  if (!o) return;
  eventoOferta(o.id, 'abierta');
  EST.ofertaOrigen = o.id;
  if (o.productoId && cacheT().items.producto[o.productoId]) verProducto(o.productoId, o);
  else ir('tienda');
};
async function pedirConsentimiento() {
  if (DB.d.config.ofertas !== undefined || !ofertasTienda().length) return;
  DB.d.config.ofertas = false; DB.guardar(); // se pregunta una sola vez
  const si = await confirmar('Ofertas para tu chacra', 'Puedes recibir ofertas de <b>' + esc(nombreTienda()) + '</b> pensadas para tu cultivo y tus próximos abonos.<br><br>' +
    '🔒 Se eligen <b>dentro de tu celular</b>: la tienda no recibe datos de tu chacra. Puedes cambiarlo cuando quieras en Ajustes.', { si: 'Sí, quiero ofertas' });
  DB.d.config.ofertas = si; DB.guardar(); render();
}

/* ==========================================================================
   TIENDA (VISTA DEL AGRICULTOR)
   ========================================================================== */
const EST = { cat: 'todos', q: '', ofertaOrigen: null };
const carrito = () => (DB.d.carrito = DB.d.carrito || []);
const totalCarrito = () => { let t = 0, consultar = false; for (const it of carrito()) { const p = cacheT().items.producto[it.id]; if (!p || p.consultar || !(p.precio > 0)) consultar = true; else t += p.precio * it.cantidad; } return { total: r2(t), consultar }; };
function fotoProd(p, tam) {
  return p.foto ? '<img src="' + p.foto + '" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block">'
    : '<div style="width:100%;aspect-ratio:1;border-radius:10px;background:var(--green-soft);color:var(--green-text);display:flex;align-items:center;justify-content:center">' + ico((TIPOS_PRODUCTO[p.categoria] || {}).aplica ? 'hoja' : 'canasta', 'l') + '</div>';
}
VISTAS.tienda = () => {
  actualizarTienda().then(c => { if (c && location.hash.startsWith('#/tienda')) render(); });
  const c = cacheT(), pf = perfilT();
  let h = '<div class="card" style="display:flex;gap:12px;align-items:center"><span class="avatar" style="background:var(--blue-soft);color:var(--blue-text)">' + ico('canasta') + '</span><div style="flex:1;min-width:0"><b>' + esc(nombreTienda()) + '</b>' +
    '<div class="small muted">' + esc([pf.direccion || 'Villa Rica', pf.horario || 'Lunes a domingo 8:00 a. m. – 5:00 p. m.'].join(' · ')) + '</div></div>' +
    (pf.whatsapp ? '<button class="icon-btn" data-act="whatsapp" data-cel="' + esc(pf.whatsapp) + '" aria-label="WhatsApp de la tienda" style="color:var(--green)">' + ico('whatsapp') + '</button>' : '') + '</div>';
  if (!c.activa && !productosTienda().length) {
    h += vacio('canasta', c.actualizado ? 'La tienda todavía no tiene productos publicados.' : 'Conéctate a internet para ver la tienda la primera vez.');
    return { titulo: 'Tienda', atras: true, html: h };
  }
  h += htmlOfertas(3);
  const misCult = cultivosActivos().map(x => x.nombre.toLowerCase());
  let ps = productosTienda();
  if (EST.cat === 'micultivo') ps = ps.filter(p => !(p.cultivos || []).length || (p.cultivos || []).some(x => misCult.includes(String(x).toLowerCase())));
  else if (EST.cat !== 'todos') ps = ps.filter(p => p.categoria === EST.cat);
  if (EST.q) ps = ps.filter(p => (p.nombre + ' ' + (p.descripcion || '') + ' ' + (p.cultivos || []).join(' ')).toLowerCase().includes(EST.q.toLowerCase()));
  const cats = [...new Set(productosTienda().map(p => p.categoria).filter(Boolean))];
  h += '<div class="buscar">' + ico('buscar') + '<input class="inp" id="buscaTienda" placeholder="Buscar urea, fungicida, latas…" value="' + esc(EST.q) + '"></div>';
  h += '<div class="chips-h">' + [['todos', 'Todos'], ['micultivo', 'Para mi cultivo']].concat(cats.map(k => [k, tipoP(k)])).map(([k, t]) =>
    '<button class="' + (EST.cat === k ? 'on' : '') + '" data-act="catTienda" data-c="' + esc(k) + '">' + esc(t) + '</button>').join('') + '</div>';
  h += ps.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:12px">' + ps.map(p => {
    const sinStock = p.stock !== undefined && p.stock !== '' && Number(p.stock) <= 0;
    return '<div class="card" style="padding:8px;margin:0;cursor:pointer" data-act="verProducto" data-id="' + p.id + '">' + fotoProd(p) +
      '<div style="font-weight:600;margin-top:6px;line-height:1.25">' + esc(p.nombre) + '</div><div class="tiny muted">' + esc(p.presentacion || '') + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><b>' + precioTxt(p) + '</b>' + (sinStock ? pill('Agotado', 'err') : '') + '</div></div>';
  }).join('') + '</div>' : vacio('buscar', 'No hay productos con ese filtro');
  h += '<a class="btn chico" href="#/mispedidos">' + ico('boleta', 's') + 'Mis pedidos</a>';
  const tc = totalCarrito(), n = carrito().reduce((s, x) => s + x.cantidad, 0);
  return {
    titulo: 'Tienda', atras: true, html: h,
    fab: n ? { t: 'Carrito (' + cant(n) + ')' + (tc.total ? ' · ' + soles(tc.total) : ''), icono: 'canasta', act: 'irCarrito' } : null,
    despues: root => { const b = $('#buscaTienda', root); if (b) b.oninput = () => { EST.q = b.value; const pos = b.selectionStart; render(); const nb = $('#buscaTienda'); nb.focus(); nb.setSelectionRange(pos, pos); }; },
  };
};
ACC.catTienda = el => { EST.cat = el.dataset.c; render(); };
ACC.irCarrito = () => ir('carrito');
ACC.verProducto = el => verProducto(el.dataset.id);
function verProducto(id, oferta) {
  const p = cacheT().items.producto[id];
  if (!p) return;
  let n = 1;
  const precio = oferta && oferta.precio ? oferta.precio : p.precio;
  const h = abrirHoja(cabHoja(p.nombre) + '<div style="max-width:320px;margin:0 auto 12px">' + fotoProd(p) + '</div>' +
    (oferta ? '<div class="aviso tono-info small">' + ico('dinero', 's') + '<div><b>' + esc(oferta.titulo) + '</b>' + (oferta.texto ? '<br>' + esc(oferta.texto) : '') + '</div></div>' : '') +
    '<div class="card"><table class="tabla">' + (p.presentacion ? '<tr><td class="muted">Presentación</td><td class="m">' + esc(p.presentacion) + '</td></tr>' : '') +
    '<tr><td class="muted">Precio</td><td class="m"><b>' + (oferta && oferta.precio ? soles(oferta.precio) + ' <s class="faint">' + precioTxt(p) + '</s>' : precioTxt(p)) + '</b></td></tr>' +
    ((p.cultivos || []).length ? '<tr><td class="muted">Para</td><td class="m">' + esc(p.cultivos.join(', ')) + '</td></tr>' : '') +
    (p.dosis ? '<tr><td class="muted">Dosis</td><td class="m" style="white-space:normal">' + esc(p.dosis) + '</td></tr>' : '') + '</table>' +
    (p.descripcion ? '<p class="small" style="margin:10px 0 0">' + esc(p.descripcion) + '</p>' : '') + '</div>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin:8px 0 4px"><button class="bmenos" data-x="m">−</button><b class="cnt" data-n>1</b><button class="bmenos" data-x="p">+</button></div>' +
    '<div class="pie"><button class="btn pri" data-x="add">' + ico('mas') + 'Agregar al carrito</button></div>');
  const pint = () => { h.querySelector('[data-n]').textContent = n; };
  h.querySelector('[data-x=m]').onclick = () => { n = Math.max(1, n - 1); pint(); };
  h.querySelector('[data-x=p]').onclick = () => { n++; pint(); };
  h.querySelector('[data-x=add]').onclick = () => {
    const it = carrito().find(x => x.id === id);
    if (it) it.cantidad += n; else carrito().push({ id, cantidad: n, precioOferta: oferta && oferta.precio ? oferta.precio : null, ofertaId: oferta ? oferta.id : null });
    DB.guardar(); cerrarHoja(); toast('Agregado al carrito'); render();
  };
  void precio;
}

VISTAS.carrito = () => {
  const its = carrito().filter(it => cacheT().items.producto[it.id]);
  if (!its.length) return { titulo: 'Carrito', atras: true, html: vacio('canasta', 'Tu carrito está vacío', '<a class="btn pri" href="#/tienda">Ir a la tienda</a>') };
  let total = 0, consultar = false;
  let h = '<div class="lista">' + its.map(it => {
    const p = cacheT().items.producto[it.id], pu = it.precioOferta || (p.consultar ? null : p.precio);
    if (pu > 0) total += pu * it.cantidad; else consultar = true;
    return '<div class="fila"><div style="width:52px;flex:none">' + fotoProd(p) + '</div><div class="cuerpo-f"><div class="t">' + esc(p.nombre) + '</div><div class="d">' + (pu > 0 ? soles(pu) + ' c/u' : 'Precio a consultar') + '</div></div>' +
      '<button class="bmenos" data-act="cantCarrito" data-id="' + it.id + '" data-d="-1">−</button><b class="cnt" style="min-width:30px">' + it.cantidad + '</b><button class="bmenos" data-act="cantCarrito" data-id="' + it.id + '" data-d="1">+</button></div>';
  }).join('') + '</div>';
  h += '<div class="card"><div class="total-l" style="padding:0"><span>Total</span><span class="num">' + soles(total) + '</span></div>' +
    (consultar ? '<p class="small muted" style="margin:6px 0 0">Algunos productos tienen precio a consultar: la tienda te confirmará el total.</p>' : '') +
    '<p class="small muted" style="margin:6px 0 0">El costo de envío se coordina con la tienda.</p></div>';
  h += '<button class="btn pri bloque" data-act="hacerPedido">' + ico('check') + 'Hacer pedido</button>';
  return { titulo: 'Carrito', atras: true, html: h };
};
ACC.cantCarrito = el => {
  const it = carrito().find(x => x.id === el.dataset.id);
  it.cantidad += Number(el.dataset.d);
  if (it.cantidad <= 0) DB.d.carrito = carrito().filter(x => x !== it);
  DB.guardar(); render();
};
ACC.hacerPedido = () => {
  const ch = DB.get('chacras', DB.chacraId) || {};
  const u = DB.usuario || {};
  formulario({
    titulo: 'Confirmar pedido', valores: { nombre: u.nombre || '', entrega: 'recojo', pago: 'Yape', direccion: [ch.nombre, ch.ubicacion].filter(Boolean).join(', '), celular: DB.d.config.miCelular || '' },
    campos: [
      { id: 'nombre', et: 'Tu nombre', tipo: 'texto', req: true },
      { id: 'celular', et: 'Tu celular', tipo: 'tel', req: true, ayuda: 'La tienda te escribirá a este número' },
      { id: 'entrega', et: 'Entrega', tipo: 'seg', req: true, ops: [{ v: 'recojo', t: 'Recojo en tienda' }, { v: 'envio', t: 'Envío a mi chacra' }] },
      { id: 'direccion', et: 'Dirección o referencia', tipo: 'area', req: true, ver: x => x.entrega === 'envio', ayuda: 'El costo de envío se coordina con la tienda' },
      { id: 'pago', et: 'Forma de pago', tipo: 'seg', req: true, ops: ['Yape', 'Plin', 'Transferencia', 'Contra entrega'] },
      { id: 'nota', et: 'Nota para la tienda', tipo: 'texto', ph: 'Opcional' },
    ],
    guardar: 'Enviar pedido',
    alGuardar: async x => {
      DB.d.config.miCelular = x.celular;
      const items = carrito().map(it => { const p = cacheT().items.producto[it.id]; if (!p) return null; const pu = it.precioOferta || (p.consultar ? null : p.precio || null);
        return { id: p.id, nombre: p.nombre, presentacion: p.presentacion || '', unidad: p.unidad || 'unidad', categoria: p.categoria || 'otro', cantidad: it.cantidad, precio: pu, subtotal: pu ? r2(pu * it.cantidad) : null, ofertaId: it.ofertaId || null }; }).filter(Boolean);
      if (!items.length) return 'El carrito está vacío';
      const id = uid(), numero = id.slice(-5).toUpperCase();
      const data = { numero, cliente: { nombre: x.nombre, celular: x.celular }, items, total: sumar(items, i => i.subtotal), conPrecioConsultar: items.some(i => !i.precio),
        entrega: x.entrega, direccion: x.entrega === 'envio' ? x.direccion : '', pago: x.pago, nota: x.nota || '', envio: null, creado: Date.now(), historial: [{ estado: 'recibido', ts: Date.now(), por: 'cliente' }] };
      const cl = clienteTienda();
      try { await tiendaRpc('mc_pedido_crear', { p_tienda: TIENDA_ID, p_cliente: cl.id, p_clave: cl.clave, p_id: id, p_data: data }); }
      catch (e) { return e.red ? 'Sin internet. Tu carrito se guardó: envía el pedido cuando tengas señal.' : e.message; }
      (DB.d.misPedidos = DB.d.misPedidos || []).unshift({ id, data, estado: 'recibido', mod: Date.now() });
      for (const it of items) if (it.ofertaId) eventoOferta(it.ofertaId, 'pedido');
      DB.d.carrito = []; DB.guardarYa();
      cerrarTodas(); toast('¡Pedido enviado!'); ir('mipedido/' + id);
      const wa = perfilT().whatsapp;
      if (wa) setTimeout(async () => { if (await confirmar('Avisar por WhatsApp', '¿Quieres enviar tu pedido N° ' + numero + ' por WhatsApp a ' + esc(nombreTienda()) + '?', { si: 'Enviar' })) abrirExterno(enlaceWhatsApp(wa, textoPedido(data))); }, 400);
      return false;
    },
  });
};
function textoPedido(d) {
  return ['*Pedido N° ' + d.numero + '* · MI-CHACRA', d.cliente.nombre + ' · ' + d.cliente.celular, '']
    .concat(d.items.map(i => '• ' + cant(i.cantidad) + ' × ' + i.nombre + (i.presentacion ? ' (' + i.presentacion + ')' : '') + (i.precio ? ' — ' + soles(i.subtotal) : ' — precio a consultar')))
    .concat(['', 'Total: ' + soles(d.total) + (d.conPrecioConsultar ? ' + productos a consultar' : '') + (d.envio ? ' + envío ' + soles(d.envio) : ''),
      'Entrega: ' + (d.entrega === 'envio' ? 'envío a ' + d.direccion : 'recojo en tienda'), 'Pago: ' + d.pago]).concat(d.nota ? ['Nota: ' + d.nota] : []).join('\n');
}

/* ---------- Mis pedidos ---------- */
async function actualizarMisPedidos() {
  if (!DB.d.cliente) return false;
  try {
    const rs = await tiendaRpc('mc_pedidos_cliente', { p_tienda: TIENDA_ID, p_cliente: DB.d.cliente.id, p_clave: DB.d.cliente.clave });
    const antes = {}; for (const p of DB.d.misPedidos || []) antes[p.id] = p.estado;
    DB.d.misPedidos = rs.filter(pedidoValido);
    for (const p of rs) if (antes[p.id] && antes[p.id] !== p.estado) {
      const txt = 'Tu pedido N° ' + p.data.numero + ': ' + ESTADOS_PEDIDO[p.estado].t;
      toast(txt); if (NATIVO && Android.notificar) Android.notificar(nombreTienda(), txt);
    }
    DB.guardar(); return true;
  } catch (e) { return false; }
}
VISTAS.mispedidos = () => {
  actualizarMisPedidos().then(c => { if (c && location.hash === '#/mispedidos') render(); });
  const ps = DB.d.misPedidos || [];
  const h = ps.length ? '<div class="lista">' + ps.map(p => '<a class="fila" href="#/mipedido/' + p.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">Pedido N° ' + esc(p.data.numero) + '</div><div class="d">' +
    fechaHora(p.data.creado) + ' · ' + p.data.items.length + ' producto(s)</div></div><div class="x"><div class="t">' + soles(r2((p.data.total || 0) + (p.data.envio || 0))) + '</div>' + pill(ESTADOS_PEDIDO[p.estado].t, ESTADOS_PEDIDO[p.estado].tono) + '</div></a>').join('') + '</div>'
    : vacio('boleta', 'Aún no has hecho pedidos', '<a class="btn pri" href="#/tienda">Ir a la tienda</a>');
  return { titulo: 'Mis pedidos', atras: true, html: h };
};
function lineaTiempo(p) {
  const hist = {}; for (const x of p.data.historial || []) hist[x.estado] = x.ts;
  if (p.estado === 'cancelado') return '<div class="aviso tono-err">' + ico('cerrar', 's') + '<div>Pedido cancelado' + (hist.cancelado ? ' el ' + fechaHora(hist.cancelado) : '') + '</div></div>';
  const i = ORDEN_ESTADOS.indexOf(p.estado);
  return '<div class="card">' + ORDEN_ESTADOS.map((e, k) => '<div style="display:flex;gap:10px;align-items:center;padding:5px 0;color:' + (k <= i ? 'var(--text)' : 'var(--faint)') + '">' +
    '<span style="width:22px;height:22px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;background:' + (k <= i ? 'var(--green)' : 'var(--line)') + ';color:#fff">' + (k <= i ? ico('check', 's') : '') + '</span>' +
    '<span style="flex:1;font-weight:' + (k === i ? 700 : 400) + '">' + ESTADOS_PEDIDO[e].t + '</span><span class="tiny faint">' + (hist[e] ? fechaHora(hist[e]) : '') + '</span></div>').join('') + '</div>';
}
function htmlItemsPedido(d) {
  return '<div class="card"><table class="tabla">' + d.items.map(i => '<tr><td>' + cant(i.cantidad) + ' × ' + esc(i.nombre) + (i.presentacion ? '<div class="tiny faint">' + esc(i.presentacion) + '</div>' : '') + '</td><td class="m">' + (i.precio ? soles(i.subtotal) : 'A consultar') + '</td></tr>').join('') +
    '<tr><td class="muted">Envío</td><td class="m">' + (d.entrega === 'envio' ? (d.envio ? soles(d.envio) : 'A coordinar') : 'Recojo en tienda') + '</td></tr></table>' +
    '<div class="total-l"><span>Total</span><span class="num">' + soles(r2((d.total || 0) + (d.envio || 0))) + '</span></div>' +
    (d.conPrecioConsultar && !d.preciosConfirmados ? '<p class="small muted" style="margin:4px 0 0">Hay precios por confirmar.</p>' : '') +
    (d.notaTienda ? '<div class="aviso tono-info small" style="margin-top:8px">' + ico('info', 's') + '<div><b>Nota de la tienda:</b> ' + esc(d.notaTienda) + '</div></div>' : '') + '</div>';
}
VISTAS.mipedido = id => {
  const antes = JSON.stringify(((DB.d.misPedidos || []).find(x => x.id === id) || {}).mod);
  actualizarMisPedidos().then(c => { const ahora = JSON.stringify(((DB.d.misPedidos || []).find(x => x.id === id) || {}).mod); if (c && ahora !== antes && location.hash === '#/mipedido/' + id && !PILA.length) render(); });
  const p = (DB.d.misPedidos || []).find(x => x.id === id);
  if (!p) return { titulo: 'Pedido', atras: true, html: vacio('boleta', 'Pedido no encontrado') };
  const d = p.data;
  let h = lineaTiempo(p) + htmlItemsPedido(d);
  h += '<div class="card small"><b>Entrega:</b> ' + (d.entrega === 'envio' ? 'Envío a ' + esc(d.direccion) : 'Recojo en tienda') + '<br><b>Pago:</b> ' + esc(d.pago) + (d.nota ? '<br><b>Nota:</b> ' + esc(d.nota) : '') + '</div>';
  const wa = perfilT().whatsapp;
  h += '<div class="btns" style="margin-bottom:10px">' + (wa ? '<button class="btn" data-act="whatsapp" data-cel="' + esc(wa) + '" data-txt="' + esc('Hola, consulto por mi pedido N° ' + d.numero) + '">' + ico('whatsapp') + 'Escribir a la tienda</button>' : '') +
    '<button class="btn" data-act="repetirPedido" data-id="' + p.id + '">' + ico('restaurar') + 'Volver a pedir</button></div>';
  if (['recibido', 'confirmado'].includes(p.estado)) h += '<button class="btn peligro bloque" data-act="cancelarPedido" data-id="' + p.id + '" style="margin-bottom:10px">Cancelar pedido</button>';
  if (['enviado', 'entregado'].includes(p.estado) && DB.chacraId && DB.puede('campo')) {
    const reg = (DB.d.pedidosRegistrados || {})[p.id];
    h += reg ? '<div class="aviso tono-ok">' + ico('check', 's') + '<div>Ya pasaste este pedido a tu almacén y gastos.</div></div>'
      : '<button class="btn pri bloque" data-act="registrarPedido" data-id="' + p.id + '">' + ico('canasta') + 'Ya lo recibí: pasar a mi almacén y gastos</button>';
  }
  return { titulo: 'Pedido N° ' + d.numero, atras: true, html: h };
};
ACC.cancelarPedido = async el => {
  if (!(await confirmar('Cancelar pedido', '¿Seguro que quieres cancelar este pedido?', { si: 'Cancelar pedido', peligro: true }))) return;
  const cl = clienteTienda();
  try { await tiendaRpc('mc_pedido_cancelar', { p_tienda: TIENDA_ID, p_cliente: cl.id, p_clave: cl.clave, p_id: el.dataset.id }); await actualizarMisPedidos(); toast('Pedido cancelado'); render(); }
  catch (e) { toast(e.message, 'error'); }
};
ACC.repetirPedido = el => {
  const p = (DB.d.misPedidos || []).find(x => x.id === el.dataset.id);
  let n = 0;
  for (const i of p.data.items) { if (!cacheT().items.producto[i.id]) continue; const it = carrito().find(x => x.id === i.id); if (it) it.cantidad += i.cantidad; else carrito().push({ id: i.id, cantidad: i.cantidad }); n++; }
  DB.guardar(); toast(n ? 'Productos agregados al carrito' : 'Esos productos ya no están en la tienda', n ? null : 'error'); if (n) ir('carrito');
};
/** Pasa lo recibido al almacén (entradas) y a los gastos de la campaña (agrupados por categoría). */
ACC.registrarPedido = async el => {
  const p = (DB.d.misPedidos || []).find(x => x.id === el.dataset.id), d = p.data;
  const camp = DB.campaniaActiva();
  if (!(await confirmar('Pasar a mi almacén', 'Se registrarán ' + d.items.length + ' producto(s) en tu almacén y el gasto de ' + soles(r2((d.total || 0) + (d.envio || 0))) + ' en ' + esc(camp ? camp.nombre : 'la campaña') + '.', { si: 'Registrar' }))) return;
  const porCat = {};
  for (const i of d.items) {
    let prod = DB.deChacra('productos').find(x => x.nombre.toLowerCase() === i.nombre.toLowerCase());
    if (!prod) prod = DB.crear('productos', { nombre: i.nombre, tipo: TIPOS_PRODUCTO[i.categoria] ? i.categoria : 'otro', unidad: UNIDADES_PRODUCTO.includes(i.unidad) ? i.unidad : 'unidad', nota: i.presentacion || '' }, 'Producto: ' + i.nombre);
    DB.crear('inventario', { productoId: prod.id, tipo: 'entrada', cantidad: i.cantidad, costoUnit: i.precio || 0, fecha: HOY(), proveedor: nombreTienda(), nota: 'Pedido N° ' + d.numero }, 'Entrada de ' + i.nombre + ' (pedido ' + d.numero + ')');
    const cat = (TIPOS_PRODUCTO[i.categoria] || TIPOS_PRODUCTO.otro).cat;
    porCat[cat] = r2((porCat[cat] || 0) + (i.subtotal || 0));
  }
  if (d.envio) porCat['Transporte / flete'] = r2((porCat['Transporte / flete'] || 0) + d.envio);
  for (const cat of Object.keys(porCat)) if (porCat[cat] > 0)
    DB.crear('gastos', { categoria: cat, descripcion: 'Pedido N° ' + d.numero + ' · ' + nombreTienda(), monto: porCat[cat], fecha: HOY(), proveedor: nombreTienda(), campaniaId: camp ? camp.id : null, pagado: true }, 'Gasto: pedido ' + d.numero);
  (DB.d.pedidosRegistrados = DB.d.pedidosRegistrados || {})[p.id] = Date.now();
  DB.guardar(); toast('Registrado en tu almacén y gastos'); render();
};

/* ==========================================================================
   MODO TIENDA (DUEÑO Y VENDEDOR)
   ========================================================================== */
/** ¿Esta cuenta ya reclamó la tienda? (se guarda en el usuario dueño, que viaja por la nube) */
const tiendaActivaAqui = () => DB.todos('usuarios').some(x => x.dueno && x.tiendaDuena);
function rolTienda() {
  const u = DB.usuario;
  if (!u || u.esTrabajador) return null;
  if (u.dueno) return tiendaActivaAqui() ? 'admin' : (NUBE.activa() ? 'reclamar' : null);
  return tiendaActivaAqui() && u.tienda ? u.tienda : null;
}
/** Credenciales con las que la tienda se identifica en el servidor.
 *  Nube antigua: las de la cuenta con código. Cuenta personal (v2): se guardan en el usuario dueño (tiendaCred). */
function credTiendaV1() {
  const n = NUBE.cfg();
  if (n && n.v !== 2 && n.cuenta && n.clave) return { cuenta: n.cuenta, clave: n.clave };
  const u = DB.todos('usuarios').find(x => x.dueno && x.tiendaCred && x.tiendaCred.cuenta);
  return u ? u.tiendaCred : null;
}
const credTienda = () => { const c = credTiendaV1() || {}; return { p_tienda: TIENDA_ID, p_cuenta: c.cuenta, p_clave: c.clave }; };
/** Antes de pasar a la cuenta personal, guarda las credenciales de la tienda en el usuario dueño. */
window.guardarCredTienda = () => {
  const n = NUBE.cfg();
  if (!n || n.v === 2 || !n.cuenta) return;
  for (const u of DB.todos('usuarios').filter(x => x.dueno && x.tiendaDuena && !x.tiendaCred))
    DB.editar('usuarios', u.id, { tiendaCred: { cuenta: n.cuenta, clave: n.clave } }, '', true);
};
/** Un pedido mal formado (de otra versión o enviado a mano) no debe romper la pantalla. */
const pedidoValido = p => !!(p && p.data && p.data.cliente && typeof p.data.cliente.nombre === 'string' && Array.isArray(p.data.items) && p.data.numero && ESTADOS_PEDIDO[p.estado]);
const tPedidos = () => (DB.d.tiendaPedidos = DB.d.tiendaPedidos || { version: 0, lista: {} });
async function actualizarPedidosTienda() {
  if (!NUBE.activa() || !credTiendaV1() || !rolTienda() || rolTienda() === 'reclamar') return false;
  try {
    const tp = tPedidos(), nuevos = [];
    for (let i = 0; i < 20; i++) {
      const rs = await tiendaRpc('mc_pedidos_tienda', Object.assign(credTienda(), { p_desde: tp.version }));
      for (const r of rs) { tp.version = Math.max(tp.version, r.version); if (!pedidoValido(r)) continue; if (!tp.lista[r.id] && r.estado === 'recibido') nuevos.push(r); tp.lista[r.id] = r; }
      if (rs.length < 500) break;
    }
    if (nuevos.length && tp.inicializado) {
      const txt = nuevos.length === 1 ? 'Nuevo pedido N° ' + nuevos[0].data.numero + ' de ' + nuevos[0].data.cliente.nombre : nuevos.length + ' pedidos nuevos';
      toast(txt); if (NATIVO && Android.notificar) Android.notificar(nombreTienda(), txt);
    }
    tp.inicializado = true; DB.guardar(); return true;
  } catch (e) { return false; }
}
setInterval(() => { if (DB.modo === 'tienda' && !document.hidden) actualizarPedidosTienda().then(c => { if (c && !PILA.length && location.hash.includes('t_')) render(); }); }, 60000);

ACC.modoTienda = () => { DB.modo = 'tienda'; document.documentElement.dataset.modo = 'tienda'; ir('t_panel'); };
ACC.modoChacra = () => {
  if (!DB.chacraId) return toast('No tienes acceso a ninguna chacra', 'error');
  DB.modo = 'chacra'; delete document.documentElement.dataset.modo; ir('inicio');
};

VISTAS.t_panel = () => {
  const rol = rolTienda();
  if (rol === 'reclamar') {
    return { titulo: 'Activar tu tienda', html: '<div class="card"><h3>Activa CHINCARMAS en la app</h3><p class="small muted" style="margin:0 0 10px">Escribe el <b>código de la tienda</b> (está en la carpeta MI-CHACRA, archivo <b>firma/codigo-tienda.txt</b>). Se hace una sola vez.</p>' +
      '<button class="btn pri bloque" data-act="reclamarTienda">' + ico('candado') + 'Escribir código de la tienda</button></div>' };
  }
  if (!rol) return { titulo: 'Tienda', html: vacio('candado', NUBE.activa() ? 'No tienes acceso a la tienda' : 'Para manejar la tienda, primero entra con tu cuenta en Más → Mi cuenta y nube') };
  actualizarPedidosTienda().then(c => { if (c && location.hash === '#/t_panel') render(); });
  actualizarTienda().then(c => { if (c && location.hash === '#/t_panel') render(); });
  const ps = Object.values(tPedidos().lista);
  const mes = HOY().slice(0, 7);
  const nuevos = ps.filter(p => p.estado === 'recibido'), proceso = ps.filter(p => ['confirmado', 'preparando', 'enviado'].includes(p.estado));
  const entMes = ps.filter(p => p.estado === 'entregado' && fechaISO(new Date(p.mod)).slice(0, 7) === mes);
  const prods = productosTienda(true), bajos = prods.filter(p => Number(p.minimo) > 0 && Number(p.stock) <= Number(p.minimo));
  let h = '<div class="kpis"><div class="kpi ' + (nuevos.length ? 'tono-warn' : '') + '"><div class="l">Pedidos nuevos</div><div class="v">' + nuevos.length + '</div></div>' +
    '<div class="kpi"><div class="l">En proceso</div><div class="v">' + proceso.length + '</div></div>' +
    '<div class="kpi hero"><div class="l">Vendido este mes</div><div class="v">' + soles(sumar(entMes, p => (p.data.total || 0) + (p.data.envio || 0))) + '</div><div class="s">' + entMes.length + ' pedidos entregados</div></div>' +
    '<div class="kpi ' + (bajos.length ? 'tono-err' : '') + '"><div class="l">Stock bajo</div><div class="v">' + bajos.length + '</div><div class="s">de ' + prods.length + ' productos</div></div></div>';
  const recientes = ps.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').sort((a, b) => b.mod - a.mod).slice(0, 8);
  h += '<div class="grupo">Pedidos por atender</div>' + (recientes.length ? '<div class="lista">' + recientes.map(filaPedidoTienda).join('') + '</div>' : vacio('check', 'No hay pedidos pendientes'));
  // Más vendidos
  const vend = {};
  for (const p of ps.filter(p => p.estado === 'entregado')) for (const i of p.data.items) vend[i.nombre] = (vend[i.nombre] || 0) + i.cantidad;
  const top = Object.keys(vend).map(k => ({ l: k, v: vend[k] })).sort((a, b) => b.v - a.v).slice(0, 5);
  if (top.length) h += '<div class="card"><h3>Más vendidos</h3>' + barras(top) + '</div>';
  if (bajos.length) h += '<div class="grupo">Stock bajo en la tienda</div><div class="lista">' + bajos.map(p => '<div class="fila" data-act="tProductoEditar" data-id="' + p.id + '">' + ico('alerta') + '<div class="cuerpo-f"><div class="t">' + esc(p.nombre) + '</div></div>' + pill(cant(p.stock) + ' en stock', 'err') + '</div>').join('') + '</div>';
  return { titulo: nombreTienda(), html: h };
};
ACC.reclamarTienda = () => formulario({
  titulo: 'Código de la tienda', valores: {},
  campos: [{ id: 'codigo', et: 'Código', tipo: 'texto', req: true, foco: true }],
  alGuardar: async x => {
    let cred = credTiendaV1();
    try {
      if (!cred) { // Cuenta personal sin nube antigua: se crea una credencial solo para la tienda.
        cred = { cuenta: 'mt' + aleatorio(10), clave: aleatorio(24) };
        await tiendaRpc('mc_crear', { p_cuenta: cred.cuenta, p_clave: cred.clave, p_nombre: 'Tienda ' + TIENDA_ID });
      }
      await tiendaRpc('mc_tienda_reclamar', { p_tienda: TIENDA_ID, p_codigo: x.codigo.trim(), p_cuenta: cred.cuenta, p_clave: cred.clave });
    } catch (e) { return e.message; }
    DB.editar('usuarios', DB.usuario.id, { tiendaDuena: true, tiendaCred: cred }, 'Tienda ' + nombreTienda() + ' activada'); DB.guardarYa();
    if (!perfilT().nombre) try { await tiendaRpc('mc_tienda_guardar', Object.assign(credTienda(), { p_data: { nombre: 'CHINCARMAS S.A.C.', direccion: 'Villa Rica', horario: 'Lunes a domingo, 8:00 a. m. – 5:00 p. m.' } })); } catch (e) { }
    await actualizarTienda(true);
    toast('¡Tienda activada!'); render();
  },
});
function filaPedidoTienda(p) {
  const d = p.data;
  return '<a class="fila" href="#/t_pedido/' + p.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">N° ' + esc(d.numero) + ' · ' + esc(d.cliente.nombre) + '</div><div class="d">' + fechaHora(d.creado) + ' · ' +
    d.items.length + ' producto(s) · ' + (d.entrega === 'envio' ? 'Envío' : 'Recojo') + ' · ' + esc(d.pago) + '</div></div><div class="x"><div class="t">' + soles(r2((d.total || 0) + (d.envio || 0))) + '</div>' + pill(ESTADOS_PEDIDO[p.estado].t, ESTADOS_PEDIDO[p.estado].tono) + '</div></a>';
}
let filtroTPed = 'pendientes';
VISTAS.t_pedidos = () => {
  if (!rolTienda() || rolTienda() === 'reclamar') return VISTAS.t_panel();
  actualizarPedidosTienda().then(c => { if (c && location.hash === '#/t_pedidos') render(); });
  let ps = Object.values(tPedidos().lista).sort((a, b) => b.data.creado - a.data.creado);
  if (filtroTPed === 'pendientes') ps = ps.filter(p => !['entregado', 'cancelado'].includes(p.estado));
  else if (filtroTPed !== 'todos') ps = ps.filter(p => p.estado === filtroTPed);
  let h = '<div class="chips-h">' + [['pendientes', 'Por atender'], ['recibido', 'Nuevos'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']].map(([k, t]) =>
    '<button class="' + (filtroTPed === k ? 'on' : '') + '" data-act="filtroTPed" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  h += ps.length ? '<div class="lista">' + ps.map(filaPedidoTienda).join('') + '</div>' : vacio('boleta', 'No hay pedidos aquí');
  return { titulo: 'Pedidos', html: h };
};
ACC.filtroTPed = el => { filtroTPed = el.dataset.f; render(); };
VISTAS.t_pedido = id => {
  const p = tPedidos().lista[id];
  if (!p) return { titulo: 'Pedido', atras: true, html: vacio('boleta', 'Pedido no encontrado') };
  const d = p.data, e = ESTADOS_PEDIDO[p.estado];
  let h = '<div class="card" style="display:flex;gap:12px;align-items:center"><span class="avatar">' + esc(iniciales(d.cliente.nombre)) + '</span><div style="flex:1"><b>' + esc(d.cliente.nombre) + '</b><div class="small muted">' + esc(d.cliente.celular) + ' · ' + fechaHora(d.creado) + '</div></div>' +
    '<button class="icon-btn" data-act="llamar" data-cel="' + esc(d.cliente.celular) + '" aria-label="Llamar">' + ico('telefono') + '</button><button class="icon-btn" data-act="whatsapp" data-cel="' + esc(d.cliente.celular) + '" data-txt="' + esc('Hola ' + d.cliente.nombre + ', sobre tu pedido N° ' + d.numero + ' en ' + nombreTienda() + ':') + '" aria-label="WhatsApp" style="color:var(--green)">' + ico('whatsapp') + '</button></div>';
  h += lineaTiempo(p) + htmlItemsPedido(d);
  h += '<div class="card small"><b>Entrega:</b> ' + (d.entrega === 'envio' ? 'Envío a ' + esc(d.direccion) : 'Recojo en tienda') + '<br><b>Pago:</b> ' + esc(d.pago) + (d.nota ? '<br><b>Nota del cliente:</b> ' + esc(d.nota) : '') + '</div>';
  if (e.sig) h += '<button class="btn pri bloque" data-act="tAvanzar" data-id="' + p.id + '" style="margin-bottom:10px">' + ico('check') + esc(e.accion) + '</button>';
  if (p.estado !== 'entregado' && p.estado !== 'cancelado') h += '<div class="btns" style="margin-bottom:10px"><button class="btn" data-act="tAjustar" data-id="' + p.id + '">' + ico('editar') + 'Precios, envío y nota</button><button class="btn peligro" data-act="tCancelar" data-id="' + p.id + '">Cancelar</button></div>';
  return { titulo: 'Pedido N° ' + d.numero, atras: true, html: h };
};
async function tActualizar(p, estado, data, msg) {
  data.historial = (data.historial || []).concat(estado !== p.estado ? [{ estado, ts: Date.now(), por: DB.usuario.nombre }] : []);
  try {
    await tiendaRpc('mc_pedido_actualizar', Object.assign(credTienda(), { p_id: p.id, p_estado: estado, p_data: data }));
    await actualizarPedidosTienda(); toast(msg || 'Pedido actualizado'); render();
    return true;
  } catch (e) { toast(e.message, 'error'); return false; }
}
ACC.tAvanzar = async el => {
  const p = tPedidos().lista[el.dataset.id], sig = ESTADOS_PEDIDO[p.estado].sig;
  const ok = await tActualizar(p, sig, JSON.parse(JSON.stringify(p.data)), 'Pedido: ' + ESTADOS_PEDIDO[sig].t);
  if (ok && await confirmar('Avisar al cliente', '¿Enviar a ' + esc(p.data.cliente.nombre) + ' por WhatsApp que su pedido está "' + ESTADOS_PEDIDO[sig].t.toLowerCase() + '"?', { si: 'Enviar' })) {
    const d = tPedidos().lista[p.id].data;
    abrirExterno(enlaceWhatsApp(d.cliente.celular, 'Hola ' + d.cliente.nombre + ', tu pedido N° ' + d.numero + ' en ' + nombreTienda() + ' está: *' + ESTADOS_PEDIDO[sig].t + '*.' +
      (sig === 'confirmado' ? '\n\n' + textoPedido(d) : '')));
  }
};
ACC.tCancelar = async el => {
  const p = tPedidos().lista[el.dataset.id];
  if (await confirmar('Cancelar pedido', 'El cliente verá su pedido como cancelado.', { si: 'Cancelar pedido', peligro: true })) tActualizar(p, 'cancelado', JSON.parse(JSON.stringify(p.data)), 'Pedido cancelado');
};
ACC.tAjustar = el => {
  const p = tPedidos().lista[el.dataset.id], d = JSON.parse(JSON.stringify(p.data));
  const campos = d.items.map((i, k) => ({ id: 'p' + k, et: cant(i.cantidad) + ' × ' + i.nombre + ' — precio unitario (S/)', tipo: 'num', min: 0 }));
  const val = { envio: d.envio || '', notaTienda: d.notaTienda || '' };
  d.items.forEach((i, k) => { val['p' + k] = i.precio || ''; });
  formulario({
    titulo: 'Ajustar pedido N° ' + d.numero, valores: val,
    campos: campos.concat([
      { id: 'envio', et: 'Costo de envío (S/)', tipo: 'num', min: 0, ver: () => d.entrega === 'envio' },
      { id: 'notaTienda', et: 'Nota para el cliente', tipo: 'texto', ph: 'Ej. llega el jueves' },
    ]),
    alGuardar: async x => {
      d.items.forEach((i, k) => { const v = Number(x['p' + k]); i.precio = v > 0 ? v : null; i.subtotal = i.precio ? r2(i.precio * i.cantidad) : null; });
      d.total = sumar(d.items, i => i.subtotal); d.conPrecioConsultar = d.items.some(i => !i.precio); d.preciosConfirmados = !d.conPrecioConsultar;
      d.envio = Number(x.envio) > 0 ? Number(x.envio) : null; d.notaTienda = x.notaTienda || '';
      if (!(await tActualizar(p, p.estado, d, 'Pedido ajustado'))) return false;
    },
  });
};

/* ---------- Productos de la tienda ---------- */
VISTAS.t_productos = () => {
  if (rolTienda() !== 'admin' && rolTienda() !== 'vendedor') return VISTAS.t_panel();
  const ps = productosTienda(true);
  const h = ps.length ? '<div class="lista">' + ps.map(p => '<div class="fila" data-act="tProductoEditar" data-id="' + p.id + '"><div style="width:48px;flex:none">' + fotoProd(p) + '</div><div class="cuerpo-f"><div class="t">' + esc(p.nombre) +
    (p.activo === false ? ' ' + pill('Oculto', 'warn') : '') + '</div><div class="d">' + esc(tipoP(p.categoria)) + (p.presentacion ? ' · ' + esc(p.presentacion) : '') + (p.stock !== undefined && p.stock !== '' ? ' · stock ' + cant(p.stock) : '') + '</div></div>' +
    '<div class="x"><div class="t">' + precioTxt(p) + '</div></div></div>').join('') + '</div>' : vacio('canasta', 'Aún no hay productos en tu tienda', '<p class="small">Agrega abonos, químicos, semillas y herramientas con su foto y precio.</p>');
  return { titulo: 'Productos', html: h, fab: { t: 'Nuevo producto', icono: 'mas', act: 'tProductoEditar' } };
};
/** Reduce una foto a máx. 480 px en JPEG para que viaje ligera. */
function reducirFoto(archivo) {
  return new Promise((ok, mal) => {
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.72));
    }; img.onerror = () => mal(new Error('No se pudo leer la imagen')); img.src = rd.result; };
    rd.onerror = () => mal(new Error('No se pudo leer el archivo'));
    rd.readAsDataURL(archivo);
  });
}
ACC.tProductoEditar = el => {
  const p = el.dataset && el.dataset.id ? cacheT().items.producto[el.dataset.id] : null;
  let foto = p ? p.foto || '' : '';
  const nombresCult = [...new Set(CATALOGO_CULTIVOS.map(c => c.nombre).concat(DB.todos('cultivos').map(c => c.nombre)))];
  formulario({
    titulo: p ? 'Editar producto' : 'Nuevo producto',
    valores: p ? Object.assign({}, p) : { categoria: 'abono', unidad: 'saco', activo: true, consultar: false, cultivos: [] },
    campos: [
      { id: 'fotoUI', tipo: 'html', html: '<div style="display:flex;gap:12px;align-items:center"><div id="fotoPrev" style="width:84px">' + fotoProd({ foto, categoria: 'abono' }) + '</div>' +
        '<label class="btn chico">' + ico('subir', 's') + 'Elegir foto<input type="file" accept="image/*" id="fotoArch" class="hidden"></label><button type="button" class="btn chico ghost" id="fotoQuitar">Quitar</button></div>' },
      { id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, ph: 'Urea 46%' },
      { id: 'categoria', et: 'Categoría', tipo: 'select', req: true, ops: Object.keys(TIPOS_PRODUCTO).map(k => ({ v: k, t: TIPOS_PRODUCTO[k].t })), par: true },
      { id: 'presentacion', et: 'Presentación', tipo: 'texto', ph: 'Saco 50 kg' },
      { id: 'precio', et: 'Precio (S/)', tipo: 'num', min: 0, par: true, ver: x => !x.consultar },
      { id: 'unidad', et: 'Se cuenta en', tipo: 'select', ops: UNIDADES_PRODUCTO },
      { id: 'consultar', et: 'Precio a consultar (varía)', tipo: 'chk' },
      { id: 'stock', et: 'Stock en tienda', tipo: 'num', min: 0, par: true },
      { id: 'minimo', et: 'Avisar cuando queden', tipo: 'num', min: 0 },
      { id: 'cultivos', et: 'Sirve para', tipo: 'multi', ops: nombresCult, ayuda: 'Ayuda a mostrarlo a quien siembra ese cultivo' },
      { id: 'dosis', et: 'Dosis recomendada', tipo: 'texto' },
      { id: 'descripcion', et: 'Descripción', tipo: 'area' },
      { id: 'activo', et: 'Visible en la tienda', tipo: 'chk' },
    ],
    alAbrir: h => {
      const conectar = () => {
        const a = h.querySelector('#fotoArch'), q = h.querySelector('#fotoQuitar');
        if (a) a.onchange = async () => { if (!a.files[0]) return; try { foto = await reducirFoto(a.files[0]); h.querySelector('#fotoPrev').innerHTML = fotoProd({ foto }); } catch (e) { toast(e.message, 'error'); } };
        if (q) q.onclick = () => { foto = ''; h.querySelector('#fotoPrev').innerHTML = fotoProd({ categoria: 'abono' }); };
      };
      conectar();
    },
    eliminar: p && rolTienda() === 'admin' ? async () => {
      if (!(await confirmar('Eliminar producto', 'Dejará de verse en la tienda.', { si: 'Eliminar', peligro: true }))) return;
      try { await tiendaRpc('mc_tienda_item', Object.assign(credTienda(), { p_tipo: 'producto', p_id: p.id, p_data: Object.assign({}, p, { eliminado: Date.now() }) })); await actualizarTienda(true); cerrarTodas(); render(); }
      catch (e) { toast(e.message, 'error'); }
    } : null,
    alGuardar: async x => {
      delete x.fotoUI;
      const id = p ? p.id : 'pr' + uid();
      const d = Object.assign({}, x, { foto, precio: x.consultar ? null : (Number(x.precio) || null), stock: x.stock === '' ? '' : Number(x.stock), minimo: Number(x.minimo) || 0 });
      delete d.id;
      try { await tiendaRpc('mc_tienda_item', Object.assign(credTienda(), { p_tipo: 'producto', p_id: id, p_data: d })); }
      catch (e) { return e.red ? 'Sin internet: los productos de la tienda se guardan en línea.' : e.message; }
      await actualizarTienda(true); toast('Producto guardado'); render();
    },
  });
};

/* ---------- Ofertas (publicidad) ---------- */
let statsOfertas = {};
VISTAS.t_ofertas = () => {
  if (rolTienda() !== 'admin') return { titulo: 'Ofertas', html: vacio('candado', 'Solo el administrador de la tienda crea ofertas') };
  tiendaRpc('mc_ofertas_stats', credTienda()).then(s => { if (JSON.stringify(s) !== JSON.stringify(statsOfertas)) { statsOfertas = s || {}; if (location.hash === '#/t_ofertas') render(); } }).catch(() => { });
  const hoy = HOY();
  const os = ofertasTienda().sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  let h = '<div class="aviso tono-info small">' + ico('candado', 's') + '<div>Las ofertas se muestran solo a quienes aceptaron recibirlas. Cada celular decide si la oferta le corresponde (por cultivo, zona, abono próximo o stock bajo): <b>la tienda no recibe datos de las chacras</b>, solo cuántos la vieron, la abrieron y pidieron.</div></div>';
  h += os.length ? '<div class="lista">' + os.map(o => {
    const s = statsOfertas[o.id] || { vista: 0, abierta: 0, pedido: 0 };
    const vigente = o.activa !== false && (!o.inicio || o.inicio <= hoy) && (!o.fin || o.fin >= hoy);
    const seg = o.segmento || {};
    const quien = [seg.cultivos && seg.cultivos.length ? seg.cultivos.join(', ') : 'Todos los cultivos', seg.zona ? 'zona ' + seg.zona : '', seg.abonoDias ? 'abono en ' + seg.abonoDias + ' días' : '', seg.stockBajo ? 'con stock bajo' : ''].filter(Boolean).join(' · ');
    return '<div class="fila" data-act="tOfertaEditar" data-id="' + o.id + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + esc(o.titulo) + ' ' + (vigente ? pill('Activa', 'ok') : pill('Inactiva', 'warn')) + '</div>' +
      '<div class="d" style="white-space:normal">' + esc(quien) + (o.fin ? ' · hasta ' + fecha(o.fin) : '') + '</div><div class="tiny muted">👁 ' + s.vista + ' la vieron · 👆 ' + s.abierta + ' la abrieron · 🛒 ' + s.pedido + ' pidieron</div></div></div>';
  }).join('') + '</div>' : vacio('dinero', 'Aún no hay ofertas', '<p class="small">Ej. "Urea a S/ 95 el saco" para quienes siembran café y tienen abono en los próximos 7 días.</p>');
  return { titulo: 'Ofertas', html: h, fab: { t: 'Nueva oferta', icono: 'mas', act: 'tOfertaEditar' } };
};
ACC.tOfertaEditar = el => {
  const o = el.dataset && el.dataset.id ? cacheT().items.oferta[el.dataset.id] : null;
  const seg = o ? o.segmento || {} : {};
  const nombresCult = [...new Set(CATALOGO_CULTIVOS.map(c => c.nombre).concat(DB.todos('cultivos').map(c => c.nombre)))];
  formulario({
    titulo: o ? 'Editar oferta' : 'Nueva oferta',
    valores: o ? Object.assign({}, o, { cultivos: seg.cultivos || [], zona: seg.zona || '', abonoDias: seg.abonoDias || '', stockBajo: !!seg.stockBajo })
      : { inicio: HOY(), fin: sumarDias(HOY(), 14), activa: true, cultivos: [], productoId: '' },
    campos: [
      { id: 'titulo', et: 'Título', tipo: 'texto', req: true, ph: 'Urea a S/ 95 el saco' },
      { id: 'texto', et: 'Mensaje', tipo: 'texto', ph: 'Solo esta semana · envío a coordinar' },
      { id: 'productoId', et: 'Producto', tipo: 'select', ops: [{ v: '', t: 'Ninguno (abre la tienda)' }].concat(productosTienda(true).map(p => ({ v: p.id, t: p.nombre }))) },
      { id: 'precio', et: 'Precio de oferta (S/)', tipo: 'num', min: 0, par: true },
      { id: 'fin', et: 'Válida hasta', tipo: 'fecha', req: true },
      { id: 'inicio', et: 'Desde', tipo: 'fecha', req: true },
      { id: 'seg', tipo: 'html', html: '<div class="grupo" style="margin-top:4px">¿A quién se muestra?</div><p class="small muted" style="margin:0 0 8px">Si no eliges nada, se muestra a todos los que aceptaron ofertas.</p>' },
      { id: 'cultivos', et: 'Solo a quienes siembran', tipo: 'multi', ops: nombresCult },
      { id: 'zona', et: 'Solo en la zona (palabra de la ubicación)', tipo: 'texto', ph: 'Ej. Villa Rica, Oconal' },
      { id: 'abonoDias', et: 'Solo si tienen un abono en los próximos N días', tipo: 'num', min: 1, max: 60 },
      { id: 'stockBajo', et: 'Solo si tienen algún insumo con stock bajo', tipo: 'chk' },
      { id: 'activa', et: 'Oferta activa', tipo: 'chk' },
    ],
    alGuardar: async x => {
      if (x.fin < x.inicio) return 'La fecha final debe ser después del inicio';
      const id = o ? o.id : 'of' + uid();
      const d = { titulo: x.titulo, texto: x.texto || '', productoId: x.productoId || '', precio: Number(x.precio) || null, inicio: x.inicio, fin: x.fin, activa: !!x.activa,
        segmento: { cultivos: x.cultivos || [], zona: x.zona || '', abonoDias: Number(x.abonoDias) || null, stockBajo: !!x.stockBajo } };
      try { await tiendaRpc('mc_tienda_item', Object.assign(credTienda(), { p_tipo: 'oferta', p_id: id, p_data: d })); }
      catch (e) { return e.message; }
      await actualizarTienda(true); toast('Oferta guardada'); render();
    },
    eliminar: o ? async () => {
      if (!(await confirmar('Eliminar oferta', 'Dejará de mostrarse.', { si: 'Eliminar', peligro: true }))) return;
      try { await tiendaRpc('mc_tienda_item', Object.assign(credTienda(), { p_tipo: 'oferta', p_id: o.id, p_data: Object.assign({}, o, { eliminado: Date.now() }) })); await actualizarTienda(true); cerrarTodas(); render(); }
      catch (e) { toast(e.message, 'error'); }
    } : null,
  });
};

/* ---------- Perfil de la tienda y más ---------- */
VISTAS.t_mas = () => {
  const rol = rolTienda();
  const fila = (act, icono, t, d, ruta) => (ruta ? '<a class="fila" href="#/' + ruta + '">' : '<div class="fila" data-act="' + act + '">') + ico(icono) + '<div class="cuerpo-f"><div class="t">' + t + '</div>' + (d ? '<div class="d">' + d + '</div>' : '') + '</div>' + ico('der', 's') + (ruta ? '</a>' : '</div>');
  let h = '<div class="card" style="display:flex;align-items:center;gap:12px"><span class="avatar">' + esc(iniciales(DB.usuario.nombre)) + '</span><div style="flex:1"><b>' + esc(DB.usuario.nombre) + '</b><div class="small muted">' +
    (rol === 'admin' ? 'Administrador de la tienda' : 'Vendedor') + '</div></div><button class="btn chico" data-act="salir">' + ico('cambiar', 's') + 'Salir</button></div>';
  h += '<div class="lista">' + (rol === 'admin' ? fila('tPerfil', 'ajustes', 'Datos de la tienda', 'Nombre, dirección, horario, WhatsApp') : '') +
    (DB.chacraId ? fila('modoChacra', 'hoja', 'Cambiar a modo chacra', 'Volver a tus trabajadores, cosecha y pagos') : '') +
    fila('', 'canasta', 'Ver la tienda como cliente', 'Así la ven los agricultores', 'tienda') + '</div>';
  h += '<p class="center tiny faint" style="margin-top:20px">MI-CHACRA ' + esc(window.VERSION || '') + ' · Modo tienda</p>';
  return { titulo: 'Más', html: h };
};
ACC.tPerfil = () => {
  const pf = perfilT();
  formulario({
    titulo: 'Datos de la tienda', valores: Object.assign({ nombre: 'CHINCARMAS S.A.C.', direccion: 'Villa Rica', horario: 'Lunes a domingo, 8:00 a. m. – 5:00 p. m.' }, pf),
    campos: [
      { id: 'nombre', et: 'Nombre', tipo: 'texto', req: true },
      { id: 'direccion', et: 'Dirección', tipo: 'texto', req: true },
      { id: 'horario', et: 'Horario', tipo: 'texto' },
      { id: 'whatsapp', et: 'WhatsApp de la tienda', tipo: 'tel', req: true, ayuda: 'Aquí llegarán los avisos de pedidos' },
      { id: 'envio', et: 'Información de envíos', tipo: 'texto', ph: 'Envíos a chacras de Villa Rica, costo a coordinar' },
    ],
    alGuardar: async x => {
      try { await tiendaRpc('mc_tienda_guardar', Object.assign(credTienda(), { p_data: x })); } catch (e) { return e.message; }
      await actualizarTienda(true); toast('Datos guardados'); render();
    },
  });
};
