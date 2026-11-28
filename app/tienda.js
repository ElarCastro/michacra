'use strict';
/* ==========================================================================
   MI-CHACRA · Etapa 6 · Fase 4A: MERCADO con varias tiendas
   - Cualquier cuenta puede inscribir su tienda ("Quiero vender"); la aprueba el
     administrador de la plataforma. 30 días gratis y luego pago mensual acordado.
   - El agricultor ve todas las tiendas aprobadas, arma un carrito por tienda y pide.
   - Las ofertas se eligen DENTRO del celular del agricultor (cultivo, zona, abonos,
     stock): las tiendas nunca reciben datos de la chacra, solo conteos anónimos.
   - Máximo 3 ofertas nuevas por semana en el inicio de cada agricultor.
   ========================================================================== */

const ESTADOS_PEDIDO = {
  recibido: { t: 'Recibido', tono: 'warn', sig: 'confirmado', accion: 'Confirmar pedido' },
  confirmado: { t: 'Confirmado', tono: 'info', sig: 'preparando', accion: 'Empezar a preparar' },
  preparando: { t: 'Preparando', tono: 'info', sig: 'enviado', accion: 'Marcar enviado / listo para recoger' },
  enviado: { t: 'En camino / listo', tono: 'info', sig: 'entregado', accion: 'Marcar entregado' },
  entregado: { t: 'Entregado', tono: 'ok' },
  cancelado: { t: 'Cancelado', tono: 'err' },
};
const ORDEN_ESTADOS = ['recibido', 'confirmado', 'preparando', 'enviado', 'entregado'];
const DISTRITOS = ['Villa Rica', 'Anexo Alto Chincarmas', 'Puerto Bermúdez', 'Oxapampa', 'Pichanaqui'];
const RUBROS = ['Agroveterinaria', 'Abonos y fertilizantes', 'Semillas y plantones', 'Herramientas y equipos', 'Acopiador (compra de cosecha)', 'Otro'];
const TERMINOS_VENDEDORES = 'https://elarcastro.github.io/michacra/terminos-vendedores.html';
const OFERTAS_NUEVAS_SEMANA = 3;

/** RPC del mercado: con la cuenta si hay sesión; si no, como visitante (solo catálogo). */
const mRpc = (fn, args) => CUENTA.activa() ? CUENTA.rpc(fn, args) : NUBE.rpc(fn, args, { url: NUBE_URL, key: NUBE_KEY });
const precioTxt = p => p.consultar || !(Number(p.precio) > 0) ? 'Consultar' : soles(p.precio);

/* ==========================================================================
   CATÁLOGO (se guarda en el celular para verlo sin señal)
   ========================================================================== */
const MK = () => (DB.d.mercado = DB.d.mercado || { desde: 0, tiendas: {}, items: {} });
const claveItem = (v, tipo, id) => v + '|' + tipo + '|' + id;
const silenciadas = () => (DB.d.config.silenciadas = DB.d.config.silenciadas || []);
const tiendaDe = v => MK().tiendas[v] || null;
const nombreDe = v => ((tiendaDe(v) || {}).data || {}).nombre || 'Tienda';
const tiendasVisibles = () => Object.values(MK().tiendas).filter(t => t.visible).sort((a, b) => (b.n_calif ? b.calificacion : 0) - (a.n_calif ? a.calificacion : 0) || nombreDe(a.id).localeCompare(nombreDe(b.id)));
const itemsDe = (tipo, v) => Object.values(MK().items).filter(x => x.tipo === tipo && (!v || x.v === v) && !x.eliminado && (tiendaDe(x.v) || {}).visible);
const productosM = v => itemsDe('producto', v).filter(p => p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
const ofertasM = v => itemsDe('oferta', v);
const productoM = (v, id) => MK().items[claveItem(v, 'producto', id)] || null;
/** Compatibilidad con pantallas antiguas (almacén, abonos): nombre genérico. */
const nombreTienda = () => (miTienda() && miTienda().data.nombre) || 'Mercado';

let _mkCargando = null;
async function actualizarMercado(forzar) {
  if (_mkCargando) return _mkCargando;
  const m = MK();
  if (!forzar && m.actualizado && Date.now() - m.actualizado < 60000) return false;
  _mkCargando = (async () => {
    try {
      let cambio = false;
      for (let i = 0; i < 20; i++) {
        const r = await mRpc('mc2_mercado', { p_desde: m.desde || 0 });
        if (!r) break;
        const ts = {}; for (const t of r.tiendas || []) ts[t.id] = t;
        if (JSON.stringify(ts) !== JSON.stringify(m.tiendas)) { m.tiendas = ts; cambio = true; }
        for (const it of r.items || []) {
          const k = claveItem(it.v, it.tipo, it.id);
          if (it.oculto || !it.data || it.data.eliminado) delete m.items[k];
          else m.items[k] = Object.assign({}, it.data, { id: it.id, v: it.v, tipo: it.tipo });
          cambio = true;
        }
        m.desde = Math.max(m.desde || 0, Number(r.hasta) || 0);
        if (!r.mas) break;
      }
      m.actualizado = Date.now(); m.error = '';
      DB.guardar();
      return cambio;
    } catch (e) { m.error = e.message; return false; }
    finally { _mkCargando = null; }
  })();
  return _mkCargando;
}
/** Nombre antiguo que usan otras pantallas. */
const actualizarTienda = f => actualizarMercado(f).then(c => {
  actualizarMisTiendas().then(x => { if (x && DB.usuario && !PILA.length && /^#\/(mas|inicio)?$/.test(location.hash)) render(); });
  return c;
});

function fotoUrl(p) { return (p.fotos && p.fotos[0]) || p.foto || p.miniatura || ''; }
function fotoProd(p) {
  const src = fotoUrl(p);
  if (src) {
    const mini = p.miniatura && src !== p.miniatura ? ' onerror="this.onerror=null;this.src=\'' + p.miniatura + '\'"' : '';
    return '<img src="' + esc(src) + '" alt=""' + mini + ' loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block;background:var(--line)">';
  }
  return '<div style="width:100%;aspect-ratio:1;border-radius:10px;background:var(--green-soft);color:var(--green-text);display:flex;align-items:center;justify-content:center">' + ico((TIPOS_PRODUCTO[p.categoria] || {}).aplica ? 'hoja' : 'canasta', 'l') + '</div>';
}
function logoTienda(t, tam) {
  const d = (t && t.data) || {};
  const s = 'width:' + (tam || 44) + 'px;height:' + (tam || 44) + 'px;flex:none';
  return d.logo ? '<img src="' + esc(d.logo) + '" alt="" style="' + s + ';border-radius:12px;object-fit:cover">'
    : '<span class="avatar" style="' + s + ';background:var(--blue-soft);color:var(--blue-text)">' + esc(iniciales(d.nombre || 'T')) + '</span>';
}
const estrellas = (n, c) => n ? '★ ' + String(n).replace('.', ',') + (c ? ' (' + c + ')' : '') : 'Sin calificaciones';

/* ==========================================================================
   OFERTAS PERSONALIZADAS (se calculan aquí, en el celular)
   ========================================================================== */
function ofertasParaMi() {
  if (DB.d.config.ofertas !== true || !DB.chacraId) return [];
  const hoy = HOY();
  const misCultivos = cultivosActivos().map(c => c.nombre.toLowerCase());
  const ch = DB.get('chacras', DB.chacraId) || {};
  const zona = (ch.ubicacion || '').toLowerCase();
  const sil = silenciadas();
  let alertas = null;
  const al = () => (alertas = alertas || DB.alertas(DB.chacraId, 30));
  return ofertasM().filter(o => {
    if (sil.includes(o.v)) return false;
    if (o.activa === false || (o.inicio && o.inicio > hoy) || (o.fin && o.fin < hoy)) return false;
    const s = o.segmento || {};
    if (s.cultivos && s.cultivos.length && !s.cultivos.some(c => misCultivos.includes(String(c).toLowerCase()))) return false;
    if (s.zona && s.zona.trim() && !zona.includes(s.zona.trim().toLowerCase())) return false;
    if (Number(s.abonoDias) > 0 && !al().some(a => a.tipo === 'abono' && a.fecha <= sumarDias(hoy, Number(s.abonoDias)))) return false;
    if (s.stockBajo && !al().some(a => a.tipo === 'stock')) return false;
    return true;
  });
}
function eventoOferta(o, tipo) {
  const reg = (DB.d.ofertasEventos = DB.d.ofertasEventos || {});
  const k = o.v + '|' + o.id + '|' + tipo;
  if (reg[k] || !CUENTA.activa()) return;
  reg[k] = Date.now(); DB.guardar();
  CUENTA.rpc('mc2_evento', { p_v: o.v, p_oferta: o.id, p_tipo: tipo }).catch(() => { delete reg[k]; });
}
/** Tarjetas de ofertas para Inicio, Abonos y Almacén (respeta el límite semanal de ofertas nuevas). */
function htmlOfertas(max, filtro) {
  let os = ofertasParaMi();
  if (filtro) os = os.filter(filtro);
  const vistas = (DB.d.ofertasVistas = DB.d.ofertasVistas || {});
  const semana = Date.now() - 7 * 864e5;
  let cupo = OFERTAS_NUEVAS_SEMANA - Object.values(vistas).filter(ts => ts > semana).length;
  const elegidas = [];
  for (const o of os) {
    if (elegidas.length >= (max || 2)) break;
    const k = o.v + '|' + o.id;
    if (vistas[k]) elegidas.push(o);
    else if (cupo > 0) { cupo--; vistas[k] = Date.now(); elegidas.push(o); }
  }
  for (const o of elegidas) eventoOferta(o, 'vista');
  return elegidas.map(htmlTarjetaOferta).join('');
}
function htmlTarjetaOferta(o) {
  const p = o.productoId ? productoM(o.v, o.productoId) : null;
  return '<div class="card tono-info" data-act="abrirOferta" data-v="' + o.v + '" data-id="' + esc(o.id) + '" style="display:flex;gap:12px;align-items:center;cursor:pointer;margin-bottom:10px">' +
    (p && fotoUrl(p) ? '<div style="width:56px;flex:none">' + fotoProd(p) + '</div>' : '<span class="avatar" style="background:var(--card)">' + ico('dinero') + '</span>') +
    '<div style="flex:1;min-width:0"><div class="tiny" style="font-weight:600">OFERTA · ' + esc(nombreDe(o.v)) + '</div><div style="font-weight:700">' + esc(o.titulo) + '</div>' +
    (o.texto ? '<div class="small">' + esc(o.texto) + '</div>' : '') + '</div><b>' + (o.precio ? soles(o.precio) : 'Ver') + '</b></div>';
}
ACC.abrirOferta = el => {
  const o = MK().items[claveItem(el.dataset.v, 'oferta', el.dataset.id)];
  if (!o) return;
  eventoOferta(o, 'abierta');
  const p = o.productoId ? productoM(o.v, o.productoId) : null;
  if (p) verProducto(o.v, p.id, o); else ir('tiendav/' + o.v);
};
async function pedirConsentimiento() {
  if (DB.d.config.ofertas !== undefined || !ofertasM().length) return;
  DB.d.config.ofertas = false; DB.guardar(); // se pregunta una sola vez
  const si = await confirmar('Ofertas para tu chacra', 'Las tiendas del mercado pueden mostrarte ofertas pensadas para tu cultivo y tus próximos abonos (máximo ' + OFERTAS_NUEVAS_SEMANA + ' nuevas por semana).<br><br>' +
    '🔒 Se eligen <b>dentro de tu celular</b>: las tiendas no reciben datos de tu chacra. Puedes cambiarlo cuando quieras en Ajustes.', { si: 'Sí, quiero ofertas' });
  DB.d.config.ofertas = si; DB.guardar(); render();
}

/* ==========================================================================
   MERCADO (VISTA DEL AGRICULTOR)
   ========================================================================== */
const EST = { cat: 'todos', q: '', distrito: '' };
/** Carrito: [{ v, id, cantidad, precioOferta, ofertaId }] (un pedido por tienda). */
const carrito = () => {
  const c = (DB.d.carrito = DB.d.carrito || []);
  if (c.some(x => !x.v)) DB.d.carrito = c.filter(x => x.v); // carritos de la versión anterior (una sola tienda)
  return DB.d.carrito;
};
const enCarrito = () => carrito().reduce((s, x) => s + x.cantidad, 0);
function tarjetaProducto(p, conTienda) {
  const sinStock = p.stock !== undefined && p.stock !== '' && Number(p.stock) <= 0;
  return '<div class="card" style="padding:8px;margin:0;cursor:pointer" data-act="verProducto" data-v="' + p.v + '" data-id="' + esc(p.id) + '">' + fotoProd(p) +
    '<div style="font-weight:600;margin-top:6px;line-height:1.25">' + esc(p.nombre) + '</div><div class="tiny muted">' + esc(p.presentacion || '') + '</div>' +
    (conTienda ? '<div class="tiny" style="color:var(--blue-text)">' + esc(nombreDe(p.v)) + '</div>' : '') +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><b>' + precioTxt(p) + '</b>' + (sinStock ? pill('Agotado', 'err') : '') + '</div></div>';
}
const grilla = html => '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:12px">' + html + '</div>';
function filtrarProductos(ps) {
  const misCult = cultivosActivos().map(x => x.nombre.toLowerCase());
  if (EST.cat === 'micultivo') ps = ps.filter(p => !(p.cultivos || []).length || (p.cultivos || []).some(x => misCult.includes(String(x).toLowerCase())));
  else if (EST.cat !== 'todos') ps = ps.filter(p => p.categoria === EST.cat);
  if (EST.q) { const q = EST.q.toLowerCase(); ps = ps.filter(p => (p.nombre + ' ' + (p.descripcion || '') + ' ' + (p.cultivos || []).join(' ') + ' ' + nombreDe(p.v)).toLowerCase().includes(q)); }
  return ps;
}
function chipsCategorias(ps) {
  const cats = [...new Set(ps.map(p => p.categoria).filter(Boolean))];
  return '<div class="chips-h">' + [['todos', 'Todos'], ['micultivo', 'Para mi cultivo']].concat(cats.map(k => [k, tipoP(k)])).map(([k, t]) =>
    '<button class="' + (EST.cat === k ? 'on' : '') + '" data-act="catTienda" data-c="' + esc(k) + '">' + esc(t) + '</button>').join('') + '</div>';
}
const buscador = ph => '<div class="buscar">' + ico('buscar') + '<input class="inp" id="buscaTienda" placeholder="' + ph + '" value="' + esc(EST.q) + '"></div>';
const despuesBuscador = root => { const b = $('#buscaTienda', root); if (b) b.oninput = () => { EST.q = b.value; const pos = b.selectionStart; render(); const nb = $('#buscaTienda'); nb.focus(); nb.setSelectionRange(pos, pos); }; };
const fabCarrito = () => { const n = enCarrito(); return n ? { t: 'Carrito (' + cant(n) + ')', icono: 'canasta', act: 'irCarrito' } : null; };

VISTAS.tienda = () => {
  actualizarMercado().then(c => { if (c && location.hash.startsWith('#/tienda') && !PILA.length) render(); });
  const m = MK();
  let ts = tiendasVisibles();
  if (!ts.length) {
    return { titulo: 'Mercado', atras: true, html: vacio('tienda', m.actualizado ? 'Todavía no hay tiendas en el mercado.' : 'Conéctate a internet para ver el mercado la primera vez.') + htmlQuieroVender() };
  }
  if (EST.distrito) ts = ts.filter(t => t.data.distrito === EST.distrito || (t.data.zonas || []).includes(EST.distrito));
  let h = htmlOfertasMercado();
  h += buscador('Buscar urea, fungicida, una tienda…');
  const dists = [...new Set(tiendasVisibles().map(t => t.data.distrito).filter(Boolean))];
  if (dists.length > 1) h += '<div class="chips-h">' + [['', 'Todas las zonas']].concat(dists.map(d => [d, d])).map(([k, t]) =>
    '<button class="' + (EST.distrito === k ? 'on' : '') + '" data-act="distritoTienda" data-d="' + esc(k) + '">' + esc(t) + '</button>').join('') + '</div>';
  if (EST.q || EST.cat !== 'todos') {
    const ps = filtrarProductos(productosM().filter(p => ts.some(t => t.id === p.v)));
    h += chipsCategorias(productosM());
    h += ps.length ? grilla(ps.slice(0, 60).map(p => tarjetaProducto(p, true)).join('')) : vacio('buscar', 'No hay productos con ese filtro');
  } else {
    h += '<div class="grupo">Tiendas</div><div class="lista">' + ts.map(t => {
      const n = productosM(t.id).length;
      return '<a class="fila" href="#/tiendav/' + t.id + '">' + logoTienda(t) + '<div class="cuerpo-f"><div class="t">' + esc(t.data.nombre) + '</div><div class="d">' +
        esc([t.data.rubro, t.data.distrito].filter(Boolean).join(' · ')) + '</div><div class="tiny muted">' + estrellas(t.calificacion, t.n_calif) + ' · ' + plural(n, 'producto') + '</div></div>' + ico('der', 's') + '</a>';
    }).join('') + '</div>';
    h += chipsCategorias(productosM());
  }
  h += '<div class="btns" style="margin:8px 0"><a class="btn chico" href="#/mispedidos">' + ico('boleta', 's') + 'Mis pedidos</a></div>' + htmlQuieroVender();
  return { titulo: 'Mercado', atras: true, html: h, fab: fabCarrito(), despues: despuesBuscador };
};
function htmlOfertasMercado() {
  if (DB.d.config.ofertas === false) return '';
  const sil = silenciadas(), hoy = HOY();
  const os = ofertasM().filter(o => !sil.includes(o.v) && o.activa !== false && (!o.inicio || o.inicio <= hoy) && (!o.fin || o.fin >= hoy)).slice(0, 6);
  if (!os.length) return '';
  for (const o of os) eventoOferta(o, 'vista');
  return '<div class="grupo">Ofertas</div>' + os.map(htmlTarjetaOferta).join('');
}
function htmlQuieroVender() {
  if (miTienda()) return '';
  return '<div class="card small" style="margin-top:12px"><b>¿Tienes una tienda?</b> Agroveterinaria, abonos, semillas o compra de cosecha: vende aquí a las chacras de la zona. ' +
    '<b>30 días gratis.</b><div style="margin-top:8px"><button class="btn chico" data-act="quieroVender">' + ico('tienda', 's') + 'Quiero vender</button></div></div>';
}
ACC.catTienda = el => { EST.cat = el.dataset.c; render(); };
ACC.distritoTienda = el => { EST.distrito = el.dataset.d; render(); };
ACC.irCarrito = () => ir('carrito');

/* ---------- Página de una tienda ---------- */
VISTAS.tiendav = v => {
  actualizarMercado().then(c => { if (c && location.hash === '#/tiendav/' + v && !PILA.length) render(); });
  const t = tiendaDe(v);
  if (!t || !t.visible) return { titulo: 'Tienda', atras: true, html: vacio('tienda', 'Esta tienda no está disponible por ahora.') };
  const d = t.data, sil = silenciadas().includes(v);
  let h = '<div class="card" style="display:flex;gap:12px;align-items:center">' + logoTienda(t, 56) + '<div style="flex:1;min-width:0"><b>' + esc(d.nombre) + '</b>' +
    '<div class="small muted">' + esc([d.rubro, d.distrito].filter(Boolean).join(' · ')) + '</div><div class="small">' + estrellas(t.calificacion, t.n_calif) + '</div></div>' +
    (d.whatsapp ? '<button class="icon-btn" data-act="whatsapp" data-cel="' + esc(d.whatsapp) + '" aria-label="WhatsApp de la tienda" style="color:var(--green)">' + ico('whatsapp') + '</button>' : '') + '</div>';
  const info = [d.direccion ? '<b>Dirección:</b> ' + esc(d.direccion) : '', d.horario ? '<b>Horario:</b> ' + esc(d.horario) : '',
    (d.zonas || []).length ? '<b>Reparte en:</b> ' + esc(d.zonas.join(', ')) : '', d.envio ? '<b>Envíos:</b> ' + esc(d.envio) : ''].filter(Boolean);
  if (info.length) h += '<div class="card small">' + info.join('<br>') + '</div>';
  const hoy = HOY();
  const os = ofertasM(v).filter(o => o.activa !== false && (!o.inicio || o.inicio <= hoy) && (!o.fin || o.fin >= hoy));
  if (os.length) h += os.map(htmlTarjetaOferta).join('');
  const todos = productosM(v), ps = filtrarProductos(todos);
  h += buscador('Buscar en ' + esc(d.nombre) + '…') + chipsCategorias(todos);
  h += ps.length ? grilla(ps.map(p => tarjetaProducto(p)).join('')) : vacio('buscar', todos.length ? 'No hay productos con ese filtro' : 'Esta tienda aún no publica productos');
  h += '<div class="btns" style="margin:8px 0 4px"><button class="btn chico ghost" data-act="silenciarTienda" data-v="' + v + '">' + ico(sil ? 'alerta' : 'cerrar', 's') + (sil ? 'Volver a ver sus ofertas' : 'No ver sus ofertas') + '</button>' +
    '<button class="btn chico ghost" data-act="denunciar" data-v="' + v + '" data-tipo="tienda" data-id="">' + ico('alerta', 's') + 'Denunciar tienda</button></div>';
  return { titulo: d.nombre, atras: true, html: h, fab: fabCarrito(), despues: despuesBuscador };
};
ACC.silenciarTienda = el => {
  const s = silenciadas(), v = el.dataset.v;
  DB.d.config.silenciadas = s.includes(v) ? s.filter(x => x !== v) : s.concat(v);
  DB.guardar(); toast(s.includes(v) ? 'Volverás a ver sus ofertas' : 'Ya no verás ofertas de esta tienda'); render();
};

ACC.verProducto = el => verProducto(el.dataset.v, el.dataset.id);
function verProducto(v, id, oferta) {
  const p = productoM(v, id);
  if (!p) return;
  let n = 1;
  const fotos = (p.fotos || []).length ? p.fotos : [fotoUrl(p)].filter(Boolean);
  const galeria = fotos.length > 1 ? '<div style="display:flex;gap:8px;overflow-x:auto;margin:0 0 12px">' + fotos.map(f => '<img src="' + esc(f) + '" alt="" loading="lazy" style="width:78%;max-width:300px;aspect-ratio:1;object-fit:cover;border-radius:10px;flex:none">').join('') + '</div>'
    : '<div style="max-width:320px;margin:0 auto 12px">' + fotoProd(p) + '</div>';
  const h = abrirHoja(cabHoja(p.nombre) + galeria +
    '<div class="small" style="margin:-4px 0 8px;color:var(--blue-text)">' + ico('tienda', 's') + ' ' + esc(nombreDe(v)) + '</div>' +
    (oferta ? '<div class="aviso tono-info small">' + ico('dinero', 's') + '<div><b>' + esc(oferta.titulo) + '</b>' + (oferta.texto ? '<br>' + esc(oferta.texto) : '') + '</div></div>' : '') +
    '<div class="card"><table class="tabla">' + (p.presentacion ? '<tr><td class="muted">Presentación</td><td class="m">' + esc(p.presentacion) + '</td></tr>' : '') +
    '<tr><td class="muted">Precio</td><td class="m"><b>' + (oferta && oferta.precio ? soles(oferta.precio) + ' <s class="faint">' + precioTxt(p) + '</s>' : precioTxt(p)) + '</b></td></tr>' +
    ((p.cultivos || []).length ? '<tr><td class="muted">Para</td><td class="m">' + esc(p.cultivos.join(', ')) + '</td></tr>' : '') +
    (p.dosis ? '<tr><td class="muted">Dosis</td><td class="m" style="white-space:normal">' + esc(p.dosis) + '</td></tr>' : '') + '</table>' +
    (p.descripcion ? '<p class="small" style="margin:10px 0 0">' + esc(p.descripcion) + '</p>' : '') + '</div>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin:8px 0 4px"><button class="bmenos" data-x="m" aria-label="Menos">−</button><b class="cnt" data-n>1</b><button class="bmenos" data-x="p" aria-label="Más">+</button></div>' +
    '<div class="pie"><button class="btn pri" data-x="add">' + ico('mas') + 'Agregar al carrito</button></div>' +
    '<button class="btn chico ghost" data-x="den" style="margin-top:6px">' + ico('alerta', 's') + 'Denunciar este producto</button>');
  const pint = () => { h.querySelector('[data-n]').textContent = n; };
  h.querySelector('[data-x=m]').onclick = () => { n = Math.max(1, n - 1); pint(); };
  h.querySelector('[data-x=p]').onclick = () => { n++; pint(); };
  h.querySelector('[data-x=den]').onclick = () => { cerrarHoja(); ACC.denunciar({ dataset: { v, tipo: oferta ? 'oferta' : 'producto', id: oferta ? oferta.id : id } }); };
  h.querySelector('[data-x=add]').onclick = () => {
    if (miTienda() && miTienda().id === v) return toast('Es tu propia tienda', 'error');
    const it = carrito().find(x => x.v === v && x.id === id);
    if (it) it.cantidad += n; else carrito().push({ v, id, cantidad: n, precioOferta: oferta && oferta.precio ? oferta.precio : null, ofertaId: oferta ? oferta.id : null });
    DB.guardar(); cerrarHoja(); toast('Agregado al carrito de ' + nombreDe(v)); render();
  };
}

/* ---------- Denunciar ---------- */
ACC.denunciar = el => {
  if (!CUENTA.activa()) return toast('Para denunciar, entra con tu cuenta en Más → Mi cuenta y nube', 'error');
  const { v, tipo, id } = el.dataset;
  formulario({
    titulo: tipo === 'tienda' ? 'Denunciar tienda' : 'Denunciar ' + (tipo === 'oferta' ? 'oferta' : 'producto'), valores: { motivo: 'Engañoso' },
    aviso: 'El administrador de MI-CHACRA lo revisará. Tu nombre no se muestra a la tienda.',
    campos: [
      { id: 'motivo', et: 'Motivo', tipo: 'select', req: true, ops: ['Engañoso', 'Producto prohibido o no autorizado por SENASA', 'Precio falso', 'No entregó el pedido', 'Contenido ofensivo', 'Otro'] },
      { id: 'detalle', et: 'Cuéntanos más', tipo: 'area', ph: 'Opcional' },
    ],
    guardar: 'Enviar denuncia',
    alGuardar: async x => {
      try { await CUENTA.rpc('mc2_denunciar', { p_v: v, p_tipo: tipo, p_objeto: id || '', p_motivo: x.motivo + (x.detalle ? ': ' + x.detalle : '') }); } catch (e) { return e.message; }
      toast('Gracias. Lo revisaremos.');
    },
  });
};

/* ---------- Carrito (agrupado por tienda) ---------- */
function lineasCarrito(v) {
  return carrito().filter(it => it.v === v && productoM(v, it.id)).map(it => {
    const p = productoM(v, it.id), pu = it.precioOferta || (p.consultar ? null : p.precio);
    return { it, p, pu: pu > 0 ? pu : null };
  });
}
VISTAS.carrito = () => {
  const vs = [...new Set(carrito().map(x => x.v))].filter(v => lineasCarrito(v).length);
  if (!vs.length) return { titulo: 'Carrito', atras: true, html: vacio('canasta', 'Tu carrito está vacío', '<a class="btn pri" href="#/tienda">Ir al mercado</a>') };
  let h = vs.length > 1 ? '<div class="aviso tono-info small">' + ico('info', 's') + '<div>Tienes productos de ' + vs.length + ' tiendas: se envía <b>un pedido a cada tienda</b>.</div></div>' : '';
  for (const v of vs) {
    const ls = lineasCarrito(v), t = tiendaDe(v);
    const total = sumar(ls, l => l.pu ? l.pu * l.it.cantidad : 0), consultar = ls.some(l => !l.pu);
    h += '<div class="grupo">' + esc(nombreDe(v)) + (t && !t.visible ? ' ' + pill('No disponible', 'err') : '') + '</div><div class="lista">' + ls.map(l =>
      '<div class="fila"><div style="width:52px;flex:none">' + fotoProd(l.p) + '</div><div class="cuerpo-f"><div class="t">' + esc(l.p.nombre) + '</div><div class="d">' + (l.pu ? soles(l.pu) + ' c/u' : 'Precio a consultar') + '</div></div>' +
      '<button class="bmenos" data-act="cantCarrito" data-v="' + v + '" data-id="' + esc(l.p.id) + '" data-d="-1" aria-label="Menos">−</button><b class="cnt" style="min-width:30px">' + l.it.cantidad + '</b>' +
      '<button class="bmenos" data-act="cantCarrito" data-v="' + v + '" data-id="' + esc(l.p.id) + '" data-d="1" aria-label="Más">+</button></div>').join('') + '</div>';
    h += '<div class="card"><div class="total-l" style="padding:0"><span>Total</span><span class="num">' + soles(r2(total)) + '</span></div>' +
      (consultar ? '<p class="small muted" style="margin:6px 0 0">Algunos productos tienen precio a consultar: la tienda te confirmará el total.</p>' : '') +
      '<p class="small muted" style="margin:6px 0 0">El costo de envío y el pago se coordinan con la tienda.</p></div>' +
      '<button class="btn pri bloque" data-act="hacerPedido" data-v="' + v + '" style="margin-bottom:14px"' + (t && t.visible ? '' : ' disabled') + '>' + ico('check') + 'Pedir a ' + esc(nombreDe(v)) + '</button>';
  }
  return { titulo: 'Carrito', atras: true, html: h };
};
ACC.cantCarrito = el => {
  const it = carrito().find(x => x.v === el.dataset.v && x.id === el.dataset.id);
  if (!it) return;
  it.cantidad += Number(el.dataset.d);
  if (it.cantidad <= 0) DB.d.carrito = carrito().filter(x => x !== it);
  DB.guardar(); render();
};
ACC.hacerPedido = el => {
  const v = el.dataset.v;
  if (!CUENTA.activa()) {
    return confirmar('Entra con tu cuenta', 'Para enviar pedidos necesitas entrar con tu correo o Google. Tu carrito se queda guardado.', { si: 'Entrar' }).then(s => { if (s) ACC.entrarCorreo(); });
  }
  const ch = DB.get('chacras', DB.chacraId) || {};
  const u = DB.usuario || {};
  const td = (tiendaDe(v) || {}).data || {};
  formulario({
    titulo: 'Pedido a ' + nombreDe(v), valores: { nombre: u.soloTienda ? '' : u.nombre || '', entrega: 'recojo', pago: 'Yape', direccion: [ch.nombre, ch.ubicacion].filter(Boolean).join(', '), celular: DB.d.config.miCelular || '' },
    campos: [
      { id: 'nombre', et: 'Tu nombre', tipo: 'texto', req: true },
      { id: 'celular', et: 'Tu celular', tipo: 'tel', req: true, ayuda: 'La tienda te escribirá a este número' },
      { id: 'entrega', et: 'Entrega', tipo: 'seg', req: true, ops: [{ v: 'recojo', t: 'Recojo en tienda' }, { v: 'envio', t: 'Envío a mi chacra' }] },
      { id: 'direccion', et: 'Dirección o referencia', tipo: 'area', req: true, ver: x => x.entrega === 'envio', ayuda: td.envio || 'El costo de envío se coordina con la tienda' },
      { id: 'pago', et: 'Forma de pago', tipo: 'seg', req: true, ops: ['Yape', 'Plin', 'Transferencia', 'Contra entrega'] },
      { id: 'nota', et: 'Nota para la tienda', tipo: 'texto', ph: 'Opcional' },
    ],
    guardar: 'Enviar pedido',
    alGuardar: async x => {
      DB.d.config.miCelular = x.celular;
      const items = lineasCarrito(v).map(l => ({ id: l.p.id, nombre: l.p.nombre, presentacion: l.p.presentacion || '', unidad: l.p.unidad || 'unidad', categoria: l.p.categoria || 'otro',
        cantidad: l.it.cantidad, precio: l.pu, subtotal: l.pu ? r2(l.pu * l.it.cantidad) : null, ofertaId: l.it.ofertaId || null }));
      if (!items.length) return 'El carrito está vacío';
      const id = uid(), numero = id.slice(-5).toUpperCase();
      const data = { numero, cliente: { nombre: x.nombre, celular: x.celular }, items, total: sumar(items, i => i.subtotal), conPrecioConsultar: items.some(i => !i.precio),
        entrega: x.entrega, direccion: x.entrega === 'envio' ? x.direccion : '', pago: x.pago, nota: x.nota || '', envio: null, creado: Date.now(), historial: [{ estado: 'recibido', ts: Date.now(), por: 'cliente' }] };
      try { await CUENTA.rpc('mc2_pedir', { p_v: v, p_id: id, p_data: data }); }
      catch (e) { return e.red ? 'Sin internet. Tu carrito se guardó: envía el pedido cuando tengas señal.' : e.message; }
      (DB.d.misPedidos = DB.d.misPedidos || []).unshift({ v, tienda: nombreDe(v), whatsapp: td.whatsapp || '', id, data, estado: 'recibido', mod: Date.now() });
      for (const it of items) if (it.ofertaId) eventoOferta({ v, id: it.ofertaId }, 'pedido');
      DB.d.carrito = carrito().filter(it => it.v !== v); DB.guardarYa();
      cerrarTodas(); toast('¡Pedido enviado!'); ir('mipedido/' + id);
      if (td.whatsapp) setTimeout(async () => { if (await confirmar('Avisar por WhatsApp', '¿Quieres enviar tu pedido N° ' + numero + ' por WhatsApp a ' + esc(nombreDe(v)) + '?', { si: 'Enviar' })) abrirExterno(enlaceWhatsApp(td.whatsapp, textoPedido(data))); }, 400);
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

/* ---------- Mis pedidos (de todas las tiendas) ---------- */
const pedidoValido = p => !!(p && p.data && p.data.cliente && typeof p.data.cliente.nombre === 'string' && Array.isArray(p.data.items) && p.data.numero && ESTADOS_PEDIDO[p.estado]);
async function actualizarMisPedidos() {
  if (!CUENTA.activa()) return false;
  try {
    // Pedidos hechos con la versión anterior (tienda única): se vinculan a la cuenta una sola vez.
    if (DB.d.cliente && DB.d.cliente.id && !DB.d.cliente.reclamado) {
      const r = await CUENTA.rpc('mc2_reclamar_pedidos_v1', { p_cliente: DB.d.cliente.id, p_clave: DB.d.cliente.clave });
      if (r) { DB.d.cliente.reclamado = Date.now(); DB.guardar(); }
    }
    const rs = (await CUENTA.rpc('mc2_mis_pedidos')) || [];
    const antes = {}; for (const p of DB.d.misPedidos || []) antes[p.id] = p.estado;
    DB.d.misPedidos = rs.filter(pedidoValido);
    for (const p of DB.d.misPedidos) if (antes[p.id] && antes[p.id] !== p.estado) {
      const txt = 'Tu pedido N° ' + p.data.numero + ' (' + p.tienda + '): ' + ESTADOS_PEDIDO[p.estado].t;
      toast(txt); if (NATIVO && Android.notificar) Android.notificar('MI-CHACRA · Mercado', txt);
    }
    DB.guardar(); return true;
  } catch (e) { return false; }
}
VISTAS.mispedidos = () => {
  actualizarMisPedidos().then(c => { if (c && location.hash === '#/mispedidos' && !PILA.length) render(); });
  const ps = (DB.d.misPedidos || []).filter(pedidoValido);
  const h = ps.length ? '<div class="lista">' + ps.map(p => '<a class="fila" href="#/mipedido/' + p.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">' + esc(p.tienda || 'Tienda') + ' · N° ' + esc(p.data.numero) + '</div><div class="d">' +
    fechaHora(p.data.creado) + ' · ' + p.data.items.length + ' producto(s)</div></div><div class="x"><div class="t">' + soles(r2((p.data.total || 0) + (p.data.envio || 0))) + '</div>' + pill(ESTADOS_PEDIDO[p.estado].t, ESTADOS_PEDIDO[p.estado].tono) + '</div></a>').join('') + '</div>'
    : vacio('boleta', CUENTA.activa() ? 'Aún no has hecho pedidos' : 'Entra con tu cuenta para ver tus pedidos', '<a class="btn pri" href="#/tienda">Ir al mercado</a>');
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
  if (!p || !pedidoValido(p)) return { titulo: 'Pedido', atras: true, html: vacio('boleta', 'Pedido no encontrado') };
  const d = p.data;
  let h = '<div class="small muted" style="margin:0 0 8px">' + ico('tienda', 's') + ' ' + esc(p.tienda || 'Tienda') + '</div>' + lineaTiempo(p) + htmlItemsPedido(d);
  h += '<div class="card small"><b>Entrega:</b> ' + (d.entrega === 'envio' ? 'Envío a ' + esc(d.direccion) : 'Recojo en tienda') + '<br><b>Pago:</b> ' + esc(d.pago) + (d.nota ? '<br><b>Nota:</b> ' + esc(d.nota) : '') + '</div>';
  if (p.estado === 'entregado' && p.v) {
    h += '<div class="card center"><div class="small" style="margin-bottom:6px">' + (p.calificado ? 'Tu calificación' : '¿Cómo te atendió ' + esc(p.tienda) + '?') + '</div><div style="display:flex;justify-content:center;gap:6px">' +
      [1, 2, 3, 4, 5].map(n => '<button class="btn chico' + (p.calificado >= n ? ' pri' : '') + '" data-act="calificar" data-v="' + p.v + '" data-id="' + p.id + '" data-n="' + n + '" aria-label="' + n + ' estrellas">★</button>').join('') + '</div></div>';
  }
  h += '<div class="btns" style="margin-bottom:10px">' + (p.whatsapp ? '<button class="btn" data-act="whatsapp" data-cel="' + esc(p.whatsapp) + '" data-txt="' + esc('Hola, consulto por mi pedido N° ' + d.numero) + '">' + ico('whatsapp') + 'Escribir a la tienda</button>' : '') +
    '<button class="btn" data-act="repetirPedido" data-id="' + p.id + '">' + ico('restaurar') + 'Volver a pedir</button></div>';
  if (['recibido', 'confirmado'].includes(p.estado) && p.v) h += '<button class="btn peligro bloque" data-act="cancelarPedido" data-v="' + p.v + '" data-id="' + p.id + '" style="margin-bottom:10px">Cancelar pedido</button>';
  if (['enviado', 'entregado'].includes(p.estado) && DB.chacraId && DB.puede('campo')) {
    const reg = (DB.d.pedidosRegistrados || {})[p.id];
    h += reg ? '<div class="aviso tono-ok">' + ico('check', 's') + '<div>Ya pasaste este pedido a tu almacén y gastos.</div></div>'
      : '<button class="btn pri bloque" data-act="registrarPedido" data-id="' + p.id + '">' + ico('canasta') + 'Ya lo recibí: pasar a mi almacén y gastos</button>';
  }
  return { titulo: 'Pedido N° ' + d.numero, atras: true, html: h };
};
ACC.calificar = async el => {
  try { await CUENTA.rpc('mc2_calificar', { p_v: el.dataset.v, p_pedido: el.dataset.id, p_estrellas: Number(el.dataset.n) }); }
  catch (e) { return toast(e.message, 'error'); }
  const p = (DB.d.misPedidos || []).find(x => x.id === el.dataset.id); if (p) p.calificado = Number(el.dataset.n);
  DB.guardar(); toast('¡Gracias por calificar!'); render();
};
ACC.cancelarPedido = async el => {
  if (!(await confirmar('Cancelar pedido', '¿Seguro que quieres cancelar este pedido?', { si: 'Cancelar pedido', peligro: true }))) return;
  try { await CUENTA.rpc('mc2_cancelar_pedido', { p_v: el.dataset.v, p_id: el.dataset.id }); await actualizarMisPedidos(); toast('Pedido cancelado'); render(); }
  catch (e) { toast(e.message, 'error'); }
};
ACC.repetirPedido = el => {
  const p = (DB.d.misPedidos || []).find(x => x.id === el.dataset.id);
  let n = 0;
  for (const i of p.data.items) {
    if (!p.v || !productoM(p.v, i.id)) continue;
    const it = carrito().find(x => x.v === p.v && x.id === i.id);
    if (it) it.cantidad += i.cantidad; else carrito().push({ v: p.v, id: i.id, cantidad: i.cantidad });
    n++;
  }
  DB.guardar(); toast(n ? 'Productos agregados al carrito' : 'Esos productos ya no están en la tienda', n ? null : 'error'); if (n) ir('carrito');
};
/** Pasa lo recibido al almacén (entradas) y a los gastos de la campaña (agrupados por categoría). */
ACC.registrarPedido = async el => {
  const p = (DB.d.misPedidos || []).find(x => x.id === el.dataset.id), d = p.data, prov = p.tienda || 'Tienda';
  const camp = DB.campaniaActiva();
  if (!(await confirmar('Pasar a mi almacén', 'Se registrarán ' + d.items.length + ' producto(s) en tu almacén y el gasto de ' + soles(r2((d.total || 0) + (d.envio || 0))) + ' en ' + esc(camp ? camp.nombre : 'la campaña') + '.', { si: 'Registrar' }))) return;
  const porCat = {};
  for (const i of d.items) {
    let prod = DB.deChacra('productos').find(x => x.nombre.toLowerCase() === i.nombre.toLowerCase());
    if (!prod) prod = DB.crear('productos', { nombre: i.nombre, tipo: TIPOS_PRODUCTO[i.categoria] ? i.categoria : 'otro', unidad: UNIDADES_PRODUCTO.includes(i.unidad) ? i.unidad : 'unidad', nota: i.presentacion || '' }, 'Producto: ' + i.nombre);
    DB.crear('inventario', { productoId: prod.id, tipo: 'entrada', cantidad: i.cantidad, costoUnit: i.precio || 0, fecha: HOY(), proveedor: prov, nota: 'Pedido N° ' + d.numero }, 'Entrada de ' + i.nombre + ' (pedido ' + d.numero + ')');
    const cat = (TIPOS_PRODUCTO[i.categoria] || TIPOS_PRODUCTO.otro).cat;
    porCat[cat] = r2((porCat[cat] || 0) + (i.subtotal || 0));
  }
  if (d.envio) porCat['Transporte / flete'] = r2((porCat['Transporte / flete'] || 0) + d.envio);
  for (const cat of Object.keys(porCat)) if (porCat[cat] > 0)
    DB.crear('gastos', { categoria: cat, descripcion: 'Pedido N° ' + d.numero + ' · ' + prov, monto: porCat[cat], fecha: HOY(), proveedor: prov, campaniaId: camp ? camp.id : null, pagado: true }, 'Gasto: pedido ' + d.numero);
  (DB.d.pedidosRegistrados = DB.d.pedidosRegistrados || {})[p.id] = Date.now();
  DB.guardar(); toast('Registrado en tu almacén y gastos'); render();
};

/* ==========================================================================
   MI TIENDA (vendedor): inscripción, suscripción y modo tienda
   ========================================================================== */
const misTiendas = () => DB.d.misTiendas || [];
function miTienda() {
  const ts = misTiendas();
  return ts.find(t => t.id === DB.d.miTiendaId) || ts[0] || null;
}
let _mtCargando = null;
async function actualizarMisTiendas() {
  if (!CUENTA.activa()) { if (DB.d.misTiendas && DB.d.misTiendas.length) { DB.d.misTiendas = []; DB.guardar(); } return false; }
  if (_mtCargando) return _mtCargando;
  _mtCargando = (async () => {
    try {
      const ts = (await CUENTA.rpc('mc2_mis_tiendas')) || [];
      const cambio = JSON.stringify(ts) !== JSON.stringify(misTiendas());
      DB.d.misTiendas = ts; DB.guardar();
      return cambio;
    } catch (e) { return false; } finally { _mtCargando = null; }
  })();
  return _mtCargando;
}
/** Rol del usuario actual en su tienda: 'dueno' | 'ayudante' | null. */
function rolTienda() {
  const u = DB.usuario, t = miTienda();
  if (!u || u.esTrabajador || !t) return null;
  if (u.soloTienda || u.dueno) return t.rol;
  if (u.tienda) return u.tienda === 'admin' ? t.rol : 'ayudante'; // vendedor que entra con PIN en el celular del dueño
  return null;
}
const tiendaActivaAqui = () => !!miTienda();
const esDuenoTienda = () => rolTienda() === 'dueno';
const tiendaOperativa = () => { const t = miTienda(); return !!t && (t.estado === 'aprobado' || t.estado === 'pendiente'); };

/** Entrar solo a la tienda (cuenta sin chacra en este celular). */
function entrarComoTienda() {
  const t = miTienda();
  if (!t) return;
  iniciarSesion({ id: 'v:' + (CUENTA.ses().uid || 'tienda'), nombre: t.data.nombre || CUENTA.email(), soloTienda: true, tienda: t.rol });
}
ACC.abrirMiTienda = async () => { await actualizarMisTiendas(); if (miTienda()) entrarComoTienda(); else toast('No encontramos una tienda en tu cuenta', 'error'); };

/* ---------- Inscripción ---------- */
ACC.quieroVender = () => {
  if (!CUENTA.activa()) {
    return confirmar('Entra con tu cuenta', 'Para inscribir tu tienda necesitas entrar con tu correo o con Google. Así solo tú podrás manejarla.', { si: 'Entrar' }).then(s => { if (s) ACC.entrarCorreo(); });
  }
  let logo = '';
  formulario({
    titulo: 'Inscribir mi tienda', valores: { rubro: 'Agroveterinaria', distrito: 'Villa Rica', zonas: ['Villa Rica'], horario: 'Lunes a sábado, 8:00 a. m. – 6:00 p. m.' },
    aviso: 'Revisaremos tus datos y te avisaremos aquí mismo. <b>Los primeros 30 días son gratis</b>; después se acuerda un pago mensual. La app no cobra: el pago se coordina directamente.',
    campos: camposTienda(() => logo, v => { logo = v; }).concat([
      { id: 'terminos', tipo: 'html', html: '<p class="small" style="margin:4px 0">Lee los <a href="#" data-act="abrirTerminosV">Términos para vendedores</a>: datos verdaderos, nada de productos prohibidos o no autorizados por SENASA y nada engañoso.</p>' },
      { id: 'acepto', et: 'Acepto los Términos para vendedores', tipo: 'chk', valida: v => v ? '' : 'Debes aceptarlos para inscribirte' },
    ]),
    alAbrir: h => conectarLogo(h, v => { logo = v; }),
    guardar: 'Enviar inscripción',
    alGuardar: async x => {
      if (!x.acepto) return 'Debes aceptar los Términos para vendedores';
      const d = datosTienda(x, logo); d.acepto = true;
      let r;
      try { r = await CUENTA.rpc('mc2_inscribir_vendedor', { p_data: d }); } catch (e) { return e.message; }
      DB.d.miTiendaId = r.id; await actualizarMisTiendas();
      cerrarTodas();
      await confirmar('¡Inscripción enviada!', 'Tu tienda <b>' + esc(d.nombre) + '</b> está <b>en revisión</b>. Mientras tanto ya puedes cargar tus productos; se publicarán cuando la aprobemos.', { si: 'Ir a mi tienda' });
      if (DB.usuario && !DB.usuario.esTrabajador) ACC.modoTienda(); else entrarComoTienda();
      return false;
    },
  });
};
ACC.abrirTerminosV = () => abrirExterno(TERMINOS_VENDEDORES);
function camposTienda() {
  return [
    { id: 'logoUI', tipo: 'html', html: '<div style="display:flex;gap:12px;align-items:center"><div id="logoPrev" style="width:56px;height:56px"></div>' +
      '<label class="btn chico">' + ico('subir', 's') + 'Logo o foto<input type="file" accept="image/*" id="logoArch" class="hidden"></label></div>' },
    { id: 'nombre', et: 'Nombre comercial', tipo: 'texto', req: true, ph: 'Agroveterinaria El Cafetal' },
    { id: 'ruc', et: 'RUC', tipo: 'texto', ph: '20123456789 (si tienes)', valida: v => !v || /^\d{11}$/.test(v) ? '' : 'El RUC tiene 11 dígitos' },
    { id: 'rubro', et: 'Rubro', tipo: 'select', req: true, ops: RUBROS },
    { id: 'distrito', et: 'Distrito', tipo: 'select', req: true, ops: DISTRITOS.concat(['Otro']) },
    { id: 'direccion', et: 'Dirección', tipo: 'texto', ph: 'Jr. ..., frente al mercado' },
    { id: 'whatsapp', et: 'WhatsApp de la tienda', tipo: 'tel', req: true, ayuda: 'Aquí te escribirán los clientes' },
    { id: 'horario', et: 'Horario', tipo: 'texto' },
    { id: 'zonas', et: 'Zonas donde repartes', tipo: 'multi', ops: DISTRITOS },
    { id: 'envio', et: 'Información de envíos', tipo: 'texto', ph: 'Envíos a chacras, costo a coordinar' },
  ];
}
function conectarLogo(h, poner, actual) {
  const prev = h.querySelector('#logoPrev'), a = h.querySelector('#logoArch');
  const pint = src => { prev.innerHTML = src ? '<img src="' + esc(src) + '" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover">' : '<span class="avatar" style="width:56px;height:56px">' + ico('tienda') + '</span>'; };
  pint(actual);
  if (a) a.onchange = async () => { if (!a.files[0]) return; try { const src = await miniaturaDe(a.files[0], 160, 0.7); poner(src); pint(src); } catch (e) { toast(e.message, 'error'); } };
}
function datosTienda(x, logo) {
  return { nombre: x.nombre.trim(), ruc: x.ruc || '', rubro: x.rubro, distrito: x.distrito, direccion: x.direccion || '', whatsapp: x.whatsapp, horario: x.horario || '',
    zonas: x.zonas || [], envio: x.envio || '', logo: logo || '' };
}

/* ---------- Fotos: comprimidas en el celular y guardadas en la nube (carpeta de la tienda) ---------- */
function leerImagen(archivo) {
  return new Promise((ok, mal) => {
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => mal(new Error('No se pudo leer la imagen')); img.src = rd.result; };
    rd.onerror = () => mal(new Error('No se pudo leer el archivo'));
    rd.readAsDataURL(archivo);
  });
}
function lienzo(img, max) {
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
async function miniaturaDe(archivoOImg, max, calidad) {
  const img = archivoOImg instanceof Image ? archivoOImg : await leerImagen(archivoOImg);
  return lienzo(img, max || 96).toDataURL('image/jpeg', calidad || 0.6);
}
/** Foto ≤150 KB (JPEG, máx. 900 px). */
async function fotoComprimida(archivo) {
  const img = await leerImagen(archivo);
  let max = 900, q = 0.8, b;
  for (let i = 0; i < 8; i++) {
    const c = lienzo(img, max);
    b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', q));
    if (b && b.size <= 150 * 1024) break;
    if (q > 0.5) q -= 0.1; else max = Math.round(max * 0.8);
  }
  return { blob: b, mini: await miniaturaDe(img, 96, 0.6) };
}
async function subirFoto(v, blob) {
  const tk = await CUENTA.token();
  const ruta = v + '/' + uid() + '.jpg';
  let r;
  try { r = await fetch(NUBE_URL + '/storage/v1/object/mercado/' + ruta, { method: 'POST', headers: { apikey: NUBE_KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'image/jpeg' }, body: blob }); }
  catch (e) { const err = new Error('Sin internet: no se pudo subir la foto'); err.red = true; throw err; }
  if (!r.ok) throw new Error('No se pudo subir la foto (' + r.status + ')');
  return NUBE_URL + '/storage/v1/object/public/mercado/' + ruta;
}
async function borrarFoto(url) {
  const ruta = String(url || '').split('/object/public/mercado/')[1];
  if (!ruta) return;
  try { const tk = await CUENTA.token(); await fetch(NUBE_URL + '/storage/v1/object/mercado/' + ruta, { method: 'DELETE', headers: { apikey: NUBE_KEY, Authorization: 'Bearer ' + tk } }); } catch (e) { }
}

/* ---------- Datos propios de la tienda (incluye ocultos y la tienda en revisión) ---------- */
const TT = v => { const c = (DB.d.tiendaDatos = DB.d.tiendaDatos || {}); return (c[v] = c[v] || { items: { producto: {}, oferta: {} }, pedidos: { version: 0, lista: {} }, stats: {} }); };
const misProductos = () => { const t = miTienda(); return t ? Object.values(TT(t.id).items.producto).sort((a, b) => a.nombre.localeCompare(b.nombre)) : []; };
const misOfertas = () => { const t = miTienda(); return t ? Object.values(TT(t.id).items.oferta) : []; };
async function actualizarItemsTienda() {
  const t = miTienda(); if (!t) return false;
  try {
    const rs = (await CUENTA.rpc('mc2_items_tienda', { p_v: t.id })) || [];
    const its = { producto: {}, oferta: {} };
    for (const r of rs) its[r.tipo][r.id] = Object.assign({}, r.data, { id: r.id, oculto: r.oculto });
    const c = JSON.stringify(its) !== JSON.stringify(TT(t.id).items);
    TT(t.id).items = its; DB.guardar(); return c;
  } catch (e) { return false; }
}
async function actualizarPedidosTienda() {
  const t = miTienda(); if (!t || !rolTienda()) return false;
  try {
    const tp = TT(t.id).pedidos, nuevos = [];
    for (let i = 0; i < 20; i++) {
      const rs = await CUENTA.rpc('mc2_pedidos_tienda', { p_v: t.id, p_desde: tp.version });
      for (const r of rs) { tp.version = Math.max(tp.version, r.version); if (!pedidoValido(r)) continue; if (!tp.lista[r.id] && r.estado === 'recibido') nuevos.push(r); tp.lista[r.id] = r; }
      if (rs.length < 500) break;
    }
    if (nuevos.length && tp.inicializado) {
      const txt = nuevos.length === 1 ? 'Nuevo pedido N° ' + nuevos[0].data.numero + ' de ' + nuevos[0].data.cliente.nombre : nuevos.length + ' pedidos nuevos';
      toast(txt); if (NATIVO && Android.notificar) Android.notificar(t.data.nombre, txt);
    }
    tp.inicializado = true; DB.guardar(); return true;
  } catch (e) { return false; }
}
const tPedidos = () => { const t = miTienda(); return t ? TT(t.id).pedidos : { version: 0, lista: {} }; };
setInterval(() => { if (DB.modo === 'tienda' && !document.hidden) actualizarPedidosTienda().then(c => { if (c && !PILA.length && location.hash.includes('t_')) render(); }); }, 60000);

ACC.modoTienda = () => { ponerModo('tienda'); ir('t_panel'); };
ACC.modoChacra = () => {
  if (!DB.chacraId) return toast('No tienes acceso a ninguna chacra', 'error');
  ponerModo('chacra'); ir('inicio');
};

/** Aviso del estado de la tienda y de su suscripción. */
function htmlEstadoTienda(t) {
  if (t.estado === 'pendiente') return '<div class="aviso tono-warn">' + ico('calendario', 's') + '<div><b>Tu tienda está en revisión.</b> Puedes cargar productos y ofertas; se publicarán cuando la aprobemos.</div></div>';
  if (t.estado === 'rechazado') return '<div class="aviso tono-err">' + ico('cerrar', 's') + '<div><b>Tu inscripción no fue aprobada.</b>' + (t.motivo ? '<br>Motivo: ' + esc(t.motivo) : '') + '</div></div>';
  if (t.estado === 'suspendido') return '<div class="aviso tono-err">' + ico('candado', 's') + '<div><b>Tu tienda está suspendida</b> y no se muestra en el mercado.' + (t.motivo ? '<br>Motivo: ' + esc(t.motivo) : '') + '</div></div>';
  if (t.legado === 'chincarmas' && String(t.hasta) >= '2099-01-01') return '';
  const hoy = HOY(), hasta = String(t.hasta || '').slice(0, 10), dias = Math.round((new Date(hasta) - new Date(hoy)) / 864e5);
  const pagado = t.pagado_hasta && String(t.pagado_hasta) >= String(t.prueba_hasta || '');
  const etiqueta = (pagado ? 'Pagado hasta el ' : 'Periodo gratis hasta el ') + fecha(hasta);
  if (dias < -5 || !t.visible) return '<div class="aviso tono-err">' + ico('alerta', 's') + '<div><b>Tu tienda está oculta del mercado</b> porque venció el ' + fecha(hasta) + '. Coordina tu pago mensual con MI-CHACRA para volver a publicarla.</div></div>';
  if (dias < 0) return '<div class="aviso tono-err">' + ico('alerta', 's') + '<div><b>Venció el ' + fecha(hasta) + '.</b> Tu tienda se ocultará el ' + fecha(sumarDias(hasta, 5)) + ' si no se registra el pago.</div></div>';
  if (dias <= 7) return '<div class="aviso tono-warn">' + ico('calendario', 's') + '<div><b>' + etiqueta + '</b> (' + plural(dias, 'día') + '). Coordina tu pago mensual para seguir en el mercado.</div></div>';
  return '<div class="small muted" style="margin:0 0 10px">' + ico('check', 's') + ' ' + etiqueta + '</div>';
}

VISTAS.t_panel = () => {
  const t = miTienda(), rol = rolTienda();
  if (!t || !rol) return { titulo: 'Tienda', html: vacio('tienda', CUENTA.activa() ? 'Aún no tienes una tienda en el mercado' : 'Para manejar una tienda, entra con tu cuenta', CUENTA.activa() ? '<button class="btn pri" data-act="quieroVender">Quiero vender</button>' : '') };
  actualizarMisTiendas().then(c => { if (c && location.hash === '#/t_panel') render(); });
  actualizarPedidosTienda().then(c => { if (c && location.hash === '#/t_panel') render(); });
  actualizarItemsTienda().then(c => { if (c && location.hash === '#/t_panel') render(); });
  const ps = Object.values(tPedidos().lista);
  const mes = HOY().slice(0, 7);
  const nuevos = ps.filter(p => p.estado === 'recibido'), proceso = ps.filter(p => ['confirmado', 'preparando', 'enviado'].includes(p.estado));
  const entMes = ps.filter(p => p.estado === 'entregado' && fechaISO(new Date(p.mod)).slice(0, 7) === mes);
  const prods = misProductos(), bajos = prods.filter(p => Number(p.minimo) > 0 && Number(p.stock) <= Number(p.minimo));
  let h = (rol === 'dueno' ? htmlEstadoTienda(t) : '') + '<div class="kpis"><div class="kpi ' + (nuevos.length ? 'tono-warn' : '') + '"><div class="l">Pedidos nuevos</div><div class="v">' + nuevos.length + '</div></div>' +
    '<div class="kpi"><div class="l">En proceso</div><div class="v">' + proceso.length + '</div></div>' +
    '<div class="kpi hero"><div class="l">Vendido este mes</div><div class="v">' + soles(sumar(entMes, p => (p.data.total || 0) + (p.data.envio || 0))) + '</div><div class="s">' + entMes.length + ' pedidos entregados</div></div>' +
    '<div class="kpi ' + (bajos.length ? 'tono-err' : '') + '"><div class="l">Stock bajo</div><div class="v">' + bajos.length + '</div><div class="s">de ' + prods.length + ' productos</div></div></div>';
  const recientes = ps.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').sort((a, b) => b.mod - a.mod).slice(0, 8);
  h += '<div class="grupo">Pedidos por atender</div>' + (recientes.length ? '<div class="lista">' + recientes.map(filaPedidoTienda).join('') + '</div>' : vacio('check', 'No hay pedidos pendientes'));
  const vend = {};
  for (const p of ps.filter(p => p.estado === 'entregado')) for (const i of p.data.items) vend[i.nombre] = (vend[i.nombre] || 0) + i.cantidad;
  const top = Object.keys(vend).map(k => ({ l: k, v: vend[k] })).sort((a, b) => b.v - a.v).slice(0, 5);
  if (top.length) h += '<div class="card"><h3>Más vendidos</h3>' + barras(top) + '</div>';
  if (bajos.length) h += '<div class="grupo">Stock bajo en la tienda</div><div class="lista">' + bajos.map(p => '<div class="fila" data-act="tProductoEditar" data-id="' + esc(p.id) + '">' + ico('alerta') + '<div class="cuerpo-f"><div class="t">' + esc(p.nombre) + '</div></div>' + pill(cant(p.stock) + ' en stock', 'err') + '</div>').join('') + '</div>';
  return { titulo: t.data.nombre, html: h };
};
function filaPedidoTienda(p) {
  const d = p.data;
  return '<a class="fila" href="#/t_pedido/' + p.id + '">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">N° ' + esc(d.numero) + ' · ' + esc(d.cliente.nombre) + '</div><div class="d">' + fechaHora(d.creado) + ' · ' +
    d.items.length + ' producto(s) · ' + (d.entrega === 'envio' ? 'Envío' : 'Recojo') + ' · ' + esc(d.pago) + '</div></div><div class="x"><div class="t">' + soles(r2((d.total || 0) + (d.envio || 0))) + '</div>' + pill(ESTADOS_PEDIDO[p.estado].t, ESTADOS_PEDIDO[p.estado].tono) + '</div></a>';
}
let filtroTPed = 'pendientes';
VISTAS.t_pedidos = () => {
  if (!rolTienda()) return VISTAS.t_panel();
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
  const d = p.data, e = ESTADOS_PEDIDO[p.estado], nt = miTienda().data.nombre;
  let h = '<div class="card" style="display:flex;gap:12px;align-items:center"><span class="avatar">' + esc(iniciales(d.cliente.nombre)) + '</span><div style="flex:1"><b>' + esc(d.cliente.nombre) + '</b><div class="small muted">' + esc(d.cliente.celular) + ' · ' + fechaHora(d.creado) + '</div></div>' +
    '<button class="icon-btn" data-act="llamar" data-cel="' + esc(d.cliente.celular) + '" aria-label="Llamar">' + ico('telefono') + '</button><button class="icon-btn" data-act="whatsapp" data-cel="' + esc(d.cliente.celular) + '" data-txt="' + esc('Hola ' + d.cliente.nombre + ', sobre tu pedido N° ' + d.numero + ' en ' + nt + ':') + '" aria-label="WhatsApp" style="color:var(--green)">' + ico('whatsapp') + '</button></div>';
  h += lineaTiempo(p) + htmlItemsPedido(d);
  h += '<div class="card small"><b>Entrega:</b> ' + (d.entrega === 'envio' ? 'Envío a ' + esc(d.direccion) : 'Recojo en tienda') + '<br><b>Pago:</b> ' + esc(d.pago) + (d.nota ? '<br><b>Nota del cliente:</b> ' + esc(d.nota) : '') + '</div>';
  if (e.sig) h += '<button class="btn pri bloque" data-act="tAvanzar" data-id="' + p.id + '" style="margin-bottom:10px">' + ico('check') + esc(e.accion) + '</button>';
  if (p.estado !== 'entregado' && p.estado !== 'cancelado') h += '<div class="btns" style="margin-bottom:10px"><button class="btn" data-act="tAjustar" data-id="' + p.id + '">' + ico('editar') + 'Precios, envío y nota</button><button class="btn peligro" data-act="tCancelar" data-id="' + p.id + '">Cancelar</button></div>';
  return { titulo: 'Pedido N° ' + d.numero, atras: true, html: h };
};
async function tActualizar(p, estado, data, msg) {
  data.historial = (data.historial || []).concat(estado !== p.estado ? [{ estado, ts: Date.now(), por: DB.usuario.nombre }] : []);
  try {
    await CUENTA.rpc('mc2_actualizar_pedido', { p_v: miTienda().id, p_id: p.id, p_estado: estado, p_data: data });
    await actualizarPedidosTienda(); toast(msg || 'Pedido actualizado'); render();
    return true;
  } catch (e) { toast(e.message, 'error'); return false; }
}
ACC.tAvanzar = async el => {
  const p = tPedidos().lista[el.dataset.id], sig = ESTADOS_PEDIDO[p.estado].sig;
  const ok = await tActualizar(p, sig, JSON.parse(JSON.stringify(p.data)), 'Pedido: ' + ESTADOS_PEDIDO[sig].t);
  if (ok && await confirmar('Avisar al cliente', '¿Enviar a ' + esc(p.data.cliente.nombre) + ' por WhatsApp que su pedido está "' + ESTADOS_PEDIDO[sig].t.toLowerCase() + '"?', { si: 'Enviar' })) {
    const d = tPedidos().lista[p.id].data;
    abrirExterno(enlaceWhatsApp(d.cliente.celular, 'Hola ' + d.cliente.nombre + ', tu pedido N° ' + d.numero + ' en ' + miTienda().data.nombre + ' está: *' + ESTADOS_PEDIDO[sig].t + '*.' +
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
  if (!rolTienda()) return VISTAS.t_panel();
  actualizarItemsTienda().then(c => { if (c && location.hash === '#/t_productos') render(); });
  const ps = misProductos();
  const h = (tiendaOperativa() ? '' : htmlEstadoTienda(miTienda())) + (ps.length ? '<div class="lista">' + ps.map(p => '<div class="fila" data-act="tProductoEditar" data-id="' + esc(p.id) + '"><div style="width:48px;flex:none">' + fotoProd(p) + '</div><div class="cuerpo-f"><div class="t">' + esc(p.nombre) +
    (p.activo === false ? ' ' + pill('Oculto', 'warn') : '') + (p.oculto ? ' ' + pill('Ocultado por revisión', 'err') : '') + '</div><div class="d">' + esc(tipoP(p.categoria)) + (p.presentacion ? ' · ' + esc(p.presentacion) : '') + (p.stock !== undefined && p.stock !== '' ? ' · stock ' + cant(p.stock) : '') + '</div></div>' +
    '<div class="x"><div class="t">' + precioTxt(p) + '</div></div></div>').join('') + '</div>' : vacio('canasta', 'Aún no hay productos en tu tienda', '<p class="small">Agrega abonos, químicos, semillas y herramientas con sus fotos y precio (hasta 200).</p>'));
  return { titulo: 'Productos', html: h, fab: tiendaOperativa() ? { t: 'Nuevo producto', icono: 'mas', act: 'tProductoEditar' } : null };
};
ACC.tProductoEditar = el => {
  const t = miTienda();
  if (!t || !tiendaOperativa()) return toast('Tu tienda no puede publicar por ahora', 'error');
  const p = el.dataset && el.dataset.id ? TT(t.id).items.producto[el.dataset.id] : null;
  // fotos: [{ url }] ya subidas o [{ blob, mini, prev }] nuevas
  let fotos = p ? ((p.fotos || []).map(url => ({ url })).concat(!(p.fotos || []).length && p.foto ? [{ url: p.foto, legado: true }] : [])) : [];
  const quitadas = [];
  const nombresCult = [...new Set(CATALOGO_CULTIVOS.map(c => c.nombre).concat(DB.todos('cultivos').map(c => c.nombre)))];
  const pintarFotos = h => {
    const caja = h.querySelector('#fotosProd');
    caja.innerHTML = fotos.map((f, i) => '<div style="position:relative;width:76px"><img src="' + esc(f.prev || f.url) + '" alt="Foto ' + (i + 1) + '" style="width:76px;height:76px;object-fit:cover;border-radius:10px">' +
      '<button type="button" class="icon-btn" data-quitar="' + i + '" aria-label="Quitar foto ' + (i + 1) + '" style="position:absolute;top:-6px;right:-6px;background:var(--card);width:28px;height:28px">' + ico('cerrar', 's') + '</button></div>').join('') +
      (fotos.length < 3 ? '<label class="btn chico" style="height:76px">' + ico('subir', 's') + 'Agregar foto<input type="file" accept="image/*" id="fotoArch" class="hidden"></label>' : '');
    caja.querySelectorAll('[data-quitar]').forEach(b => { b.onclick = () => { const f = fotos.splice(Number(b.dataset.quitar), 1)[0]; if (f.url && !f.legado) quitadas.push(f.url); pintarFotos(h); }; });
    const a = caja.querySelector('#fotoArch');
    if (a) a.onchange = async () => { if (!a.files[0]) return; try { const r = await fotoComprimida(a.files[0]); fotos.push({ blob: r.blob, mini: r.mini, prev: URL.createObjectURL(r.blob) }); pintarFotos(h); } catch (e) { toast(e.message, 'error'); } };
  };
  formulario({
    titulo: p ? 'Editar producto' : 'Nuevo producto',
    valores: p ? Object.assign({}, p) : { categoria: 'abono', unidad: 'saco', activo: true, consultar: false, cultivos: [] },
    campos: [
      { id: 'fotoUI', tipo: 'html', html: '<div class="small muted" style="margin-bottom:4px">Fotos (hasta 3)</div><div id="fotosProd" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"></div>' },
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
      { id: 'activo', et: 'Visible en el mercado', tipo: 'chk' },
    ],
    alAbrir: h => pintarFotos(h),
    eliminar: p && esDuenoTienda() ? async () => {
      if (!(await confirmar('Eliminar producto', 'Dejará de verse en el mercado.', { si: 'Eliminar', peligro: true }))) return;
      try { await CUENTA.rpc('mc2_guardar_item', { p_v: t.id, p_tipo: 'producto', p_id: p.id, p_data: { nombre: p.nombre, eliminado: Date.now() } }); }
      catch (e) { return toast(e.message, 'error'); }
      for (const u of p.fotos || []) borrarFoto(u);
      await actualizarItemsTienda(); actualizarMercado(true); cerrarTodas(); render();
    } : null,
    alGuardar: async x => {
      delete x.fotoUI; delete x.oculto;
      const id = p ? p.id : 'pr' + uid();
      let urls = [], mini = p ? p.miniatura || '' : '';
      try {
        for (const f of fotos) {
          if (f.url && !f.legado) urls.push(f.url);
          else if (f.blob) urls.push(await subirFoto(t.id, f.blob));
        }
      } catch (e) { return e.message; }
      const primera = fotos[0];
      if (!primera) mini = '';
      else if (primera.mini) mini = primera.mini;
      else if (primera.legado) mini = await miniaturaDe(await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = primera.url; }), 96, 0.6).catch(() => '');
      const d = Object.assign({}, x, { fotos: urls, miniatura: mini, precio: x.consultar ? null : (Number(x.precio) || null), stock: x.stock === '' ? '' : Number(x.stock), minimo: Number(x.minimo) || 0 });
      delete d.id; delete d.foto;
      try { await CUENTA.rpc('mc2_guardar_item', { p_v: t.id, p_tipo: 'producto', p_id: id, p_data: d }); }
      catch (e) { return e.red ? 'Sin internet: los productos de la tienda se guardan en línea.' : e.message; }
      for (const u of quitadas) borrarFoto(u);
      await actualizarItemsTienda(); actualizarMercado(true); toast('Producto guardado'); render();
    },
  });
};

/* ---------- Ofertas (publicidad) ---------- */
VISTAS.t_ofertas = () => {
  if (!esDuenoTienda()) return { titulo: 'Ofertas', html: vacio('candado', 'Solo el dueño de la tienda crea ofertas') };
  const t = miTienda();
  CUENTA.rpc('mc2_stats_tienda', { p_v: t.id }).then(s => { if (s && JSON.stringify(s) !== JSON.stringify(TT(t.id).stats)) { TT(t.id).stats = s; DB.guardar(); if (location.hash === '#/t_ofertas') render(); } }).catch(() => { });
  actualizarItemsTienda().then(c => { if (c && location.hash === '#/t_ofertas') render(); });
  const st = TT(t.id).stats || {}, hoy = HOY();
  const os = misOfertas().sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  const activas = os.filter(o => o.activa !== false && !o.oculto && (!o.fin || o.fin >= hoy)).length;
  let h = '<div class="aviso tono-info small">' + ico('candado', 's') + '<div>Las ofertas se muestran solo a quienes aceptaron recibirlas, y cada celular decide si le corresponde (cultivo, zona, abono próximo o stock bajo): <b>no recibes datos de las chacras</b>, solo cuántos la vieron, la abrieron y pidieron. Puedes tener <b>hasta 10 activas</b> (tienes ' + activas + ').</div></div>';
  if (st.n_calif) h += '<div class="card small">Calificación de tu tienda: <b>' + estrellas(st.calificacion, st.n_calif) + '</b></div>';
  h += os.length ? '<div class="lista">' + os.map(o => {
    const s = (st.ofertas || {})[o.id] || { vista: 0, abierta: 0, pedido: 0 };
    const vigente = o.activa !== false && !o.oculto && (!o.inicio || o.inicio <= hoy) && (!o.fin || o.fin >= hoy);
    const seg = o.segmento || {};
    const quien = [seg.cultivos && seg.cultivos.length ? seg.cultivos.join(', ') : 'Todos los cultivos', seg.zona ? 'zona ' + seg.zona : '', seg.abonoDias ? 'abono en ' + seg.abonoDias + ' días' : '', seg.stockBajo ? 'con stock bajo' : ''].filter(Boolean).join(' · ');
    return '<div class="fila" data-act="tOfertaEditar" data-id="' + esc(o.id) + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + esc(o.titulo) + ' ' + (o.oculto ? pill('Ocultada por revisión', 'err') : vigente ? pill('Activa', 'ok') : pill('Inactiva', 'warn')) + '</div>' +
      '<div class="d" style="white-space:normal">' + esc(quien) + (o.fin ? ' · hasta ' + fecha(o.fin) : '') + '</div><div class="tiny muted">👁 ' + s.vista + ' la vieron · 👆 ' + s.abierta + ' la abrieron · 🛒 ' + s.pedido + ' pidieron</div></div></div>';
  }).join('') + '</div>' : vacio('dinero', 'Aún no hay ofertas', '<p class="small">Ej. "Urea a S/ 95 el saco" para quienes siembran café y tienen abono en los próximos 7 días.</p>');
  return { titulo: 'Ofertas', html: h, fab: tiendaOperativa() ? { t: 'Nueva oferta', icono: 'mas', act: 'tOfertaEditar' } : null };
};
ACC.tOfertaEditar = el => {
  const t = miTienda();
  if (!t || !tiendaOperativa() || !esDuenoTienda()) return toast('Tu tienda no puede publicar por ahora', 'error');
  const o = el.dataset && el.dataset.id ? TT(t.id).items.oferta[el.dataset.id] : null;
  const seg = o ? o.segmento || {} : {};
  const nombresCult = [...new Set(CATALOGO_CULTIVOS.map(c => c.nombre).concat(DB.todos('cultivos').map(c => c.nombre)))];
  formulario({
    titulo: o ? 'Editar oferta' : 'Nueva oferta',
    valores: o ? Object.assign({}, o, { cultivos: seg.cultivos || [], zona: seg.zona || '', abonoDias: seg.abonoDias || '', stockBajo: !!seg.stockBajo })
      : { inicio: HOY(), fin: sumarDias(HOY(), 14), activa: true, cultivos: [], productoId: '' },
    campos: [
      { id: 'titulo', et: 'Título', tipo: 'texto', req: true, ph: 'Urea a S/ 95 el saco' },
      { id: 'texto', et: 'Mensaje', tipo: 'texto', ph: 'Solo esta semana · envío a coordinar' },
      { id: 'productoId', et: 'Producto', tipo: 'select', ops: [{ v: '', t: 'Ninguno (abre la tienda)' }].concat(misProductos().map(p => ({ v: p.id, t: p.nombre }))) },
      { id: 'precio', et: 'Precio de oferta (S/)', tipo: 'num', min: 0, par: true },
      { id: 'fin', et: 'Válida hasta', tipo: 'fecha', req: true },
      { id: 'inicio', et: 'Desde', tipo: 'fecha', req: true },
      { id: 'seg', tipo: 'html', html: '<div class="grupo" style="margin-top:4px">¿A quién se muestra?</div><p class="small muted" style="margin:0 0 8px">Si no eliges nada, se muestra a todos los que aceptaron ofertas.</p>' },
      { id: 'cultivos', et: 'Solo a quienes siembran', tipo: 'multi', ops: nombresCult },
      { id: 'zona', et: 'Solo en la zona (palabra de la ubicación)', tipo: 'texto', ph: 'Ej. Villa Rica, Chincarmas' },
      { id: 'abonoDias', et: 'Solo si tienen un abono en los próximos N días', tipo: 'num', min: 1, max: 60 },
      { id: 'stockBajo', et: 'Solo si tienen algún insumo con stock bajo', tipo: 'chk' },
      { id: 'activa', et: 'Oferta activa', tipo: 'chk' },
    ],
    alGuardar: async x => {
      if (x.fin < x.inicio) return 'La fecha final debe ser después del inicio';
      const id = o ? o.id : 'of' + uid();
      const d = { titulo: x.titulo, texto: x.texto || '', productoId: x.productoId || '', precio: Number(x.precio) || null, inicio: x.inicio, fin: x.fin, activa: !!x.activa,
        segmento: { cultivos: x.cultivos || [], zona: x.zona || '', abonoDias: Number(x.abonoDias) || null, stockBajo: !!x.stockBajo } };
      try { await CUENTA.rpc('mc2_guardar_item', { p_v: t.id, p_tipo: 'oferta', p_id: id, p_data: d }); }
      catch (e) { return e.message; }
      await actualizarItemsTienda(); actualizarMercado(true); toast('Oferta guardada'); render();
    },
    eliminar: o ? async () => {
      if (!(await confirmar('Eliminar oferta', 'Dejará de mostrarse.', { si: 'Eliminar', peligro: true }))) return;
      try { await CUENTA.rpc('mc2_guardar_item', { p_v: t.id, p_tipo: 'oferta', p_id: o.id, p_data: { titulo: o.titulo, eliminado: Date.now() } }); await actualizarItemsTienda(); actualizarMercado(true); cerrarTodas(); render(); }
      catch (e) { toast(e.message, 'error'); }
    } : null,
  });
};

/* ---------- Más: datos de la tienda, ayudantes ---------- */
let EQUIPO_T = null;
VISTAS.t_mas = () => {
  const rol = rolTienda(), t = miTienda();
  const fila = (act, icono, tt, d, ruta) => (ruta ? '<a class="fila" href="#/' + ruta + '">' : '<div class="fila" data-act="' + act + '">') + ico(icono) + '<div class="cuerpo-f"><div class="t">' + tt + '</div>' + (d ? '<div class="d">' + d + '</div>' : '') + '</div>' + ico('der', 's') + (ruta ? '</a>' : '</div>');
  let h = '<div class="card" style="display:flex;align-items:center;gap:12px">' + (t ? logoTienda(t) : '') + '<div style="flex:1"><b>' + esc(t ? t.data.nombre : 'Tienda') + '</b><div class="small muted">' +
    esc(DB.usuario.nombre) + ' · ' + (rol === 'dueno' ? 'Dueño de la tienda' : 'Ayudante') + '</div></div><button class="btn chico" data-act="salir">' + ico('cambiar', 's') + 'Salir</button></div>';
  if (rol === 'dueno' && t) h += htmlEstadoTienda(t);
  h += '<div class="lista">' + (rol === 'dueno' ? fila('tPerfil', 'ajustes', 'Datos de la tienda', 'Nombre, logo, dirección, horario, WhatsApp, reparto') + fila('', 'personas', 'Ayudantes', 'Personas que atienden pedidos con su propia cuenta', 't_equipo') : '') +
    (misTiendas().length > 1 ? fila('tCambiarTienda', 'cambiar', 'Cambiar de tienda', misTiendas().length + ' tiendas en tu cuenta') : '') +
    (DB.chacraId ? fila('modoChacra', 'hoja', 'Cambiar a modo chacra', 'Volver a tus trabajadores, cosecha y pagos') : '') +
    (t && t.visible ? fila('', 'canasta', 'Ver mi tienda como cliente', 'Así la ven los agricultores', 'tiendav/' + t.id) : '') +
    (DB.d.esAdmin ? fila('', 'escudo', 'Administrar plataforma', 'Tiendas, pagos, denuncias y uso', 'admin') : '') +
    fila('abrirTerminosV', 'boleta', 'Términos para vendedores', '') + '</div>';
  h += '<p class="center tiny faint" style="margin-top:20px">MI-CHACRA ' + esc(window.VERSION || '') + ' · Modo tienda</p>';
  return { titulo: 'Más', html: h };
};
ACC.tCambiarTienda = async () => {
  const r = await elegir('Elige la tienda', misTiendas().map(t => ({ v: t.id, t: t.data.nombre, d: (t.rol === 'dueno' ? 'Dueño' : 'Ayudante') + ' · ' + t.estado, icono: 'tienda' })), (miTienda() || {}).id);
  if (r) { DB.d.miTiendaId = r; DB.guardar(); ir('t_panel'); render(); }
};
ACC.tPerfil = () => {
  const t = miTienda();
  if (!t || !esDuenoTienda()) return;
  let logo = t.data.logo || '';
  formulario({
    titulo: 'Datos de la tienda', valores: Object.assign({}, t.data),
    campos: camposTienda(),
    alAbrir: h => conectarLogo(h, v => { logo = v; }, logo),
    alGuardar: async x => {
      delete x.logoUI;
      try { await CUENTA.rpc('mc2_guardar_tienda', { p_v: t.id, p_data: datosTienda(x, logo) }); } catch (e) { return e.message; }
      await actualizarMisTiendas(); actualizarMercado(true); toast('Datos guardados'); render();
    },
  });
};
VISTAS.t_equipo = () => {
  const t = miTienda();
  if (!t || !esDuenoTienda()) return { titulo: 'Ayudantes', atras: true, html: vacio('candado', 'Solo el dueño de la tienda') };
  CUENTA.rpc('mc2_ayudantes', { p_v: t.id }).then(r => { if (JSON.stringify(r) !== JSON.stringify(EQUIPO_T)) { EQUIPO_T = r; if (location.hash === '#/t_equipo') render(); } }).catch(() => { });
  const eq = EQUIPO_T || { miembros: [], invitaciones: [] };
  let h = '<p class="small muted">Cada ayudante entra con <b>su propia cuenta</b> y puede atender pedidos y editar productos. Las ofertas y los datos de la tienda solo los cambias tú.</p>';
  h += '<div class="lista">' + eq.miembros.map(m => '<div class="fila"><span class="avatar">' + esc(iniciales(m.email || '?')) + '</span><div class="cuerpo-f"><div class="t">' + esc(m.email || '') + '</div><div class="d">' + (m.rol === 'dueno' ? 'Dueño' : 'Ayudante') + '</div></div>' +
    (m.rol === 'ayudante' ? '<button class="btn chico peligro" data-act="tQuitarAyudante" data-u="' + m.usuario + '" data-e="' + esc(m.email || '') + '">Quitar</button>' : '') + '</div>').join('') +
    eq.invitaciones.map(i => '<div class="fila">' + ico('correo') + '<div class="cuerpo-f"><div class="t">' + esc(i.nombre || 'Invitación') + '</div><div class="d">Invitación enviada · vence ' + fecha(String(i.vence).slice(0, 10)) + '</div></div></div>').join('') + '</div>';
  return { titulo: 'Ayudantes', atras: true, html: h, fab: { t: 'Invitar ayudante', icono: 'mas', act: 'tInvitarAyudante' } };
};
ACC.tInvitarAyudante = () => {
  const t = miTienda();
  formulario({
    titulo: 'Invitar ayudante', valores: {}, campos: [{ id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: true }],
    guardar: 'Crear invitación',
    alGuardar: async x => {
      let r;
      try { r = await CUENTA.rpc('mc2_invitar_ayudante', { p_v: t.id, p_nombre: x.nombre }); } catch (e) { return e.message; }
      cerrarTodas();
      const txt = 'Hola ' + x.nombre.split(' ')[0] + ', te invito a atender la tienda ' + t.data.nombre + ' en MI-CHACRA.\n\n' +
        '1) Instala la app desde Play Store: https://play.google.com/apps/internaltest/4700642312873271512\n   o úsala en el navegador: https://elarcastro.github.io/michacra/app/\n' +
        '2) Entra con tu correo o con Google.\n3) Toca "Tengo una invitación" y escribe este código: ' + r.codigo + '\n\n(Sirve una sola vez y vence en 7 días.)';
      const h = abrirHoja(cabHoja('Invitación para ' + x.nombre) + '<p style="font-size:30px;font-weight:700;letter-spacing:3px;text-align:center;margin:8px 0 14px">' + esc(r.codigo) + '</p>' +
        '<button class="btn pri bloque" data-x="wa">' + ico('whatsapp') + 'Enviar por WhatsApp</button>');
      h.querySelector('[data-x=wa]').onclick = () => compartirTexto(txt);
      EQUIPO_T = null; render();
      return false;
    },
  });
};
ACC.tQuitarAyudante = async el => {
  if (!(await confirmar('Quitar ayudante', '¿Quitar el acceso de ' + esc(el.dataset.e) + ' a la tienda?', { si: 'Quitar', peligro: true }))) return;
  try { await CUENTA.rpc('mc2_quitar_ayudante', { p_v: miTienda().id, p_usuario: el.dataset.u }); } catch (e) { return toast(e.message, 'error'); }
  EQUIPO_T = null; toast('Acceso quitado'); render();
};
