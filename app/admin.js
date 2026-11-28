'use strict';
/* ==========================================================================
   MI-CHACRA · Administrar la plataforma (solo cuentas en mc2_admins)
   Tiendas (aprobar, suspender, pagos), denuncias, revisión de lo nuevo y uso.
   El administrador NO ve datos de las fincas: el servidor no tiene funciones para eso.
   ========================================================================== */

const ADM = { tab: 'tiendas', tiendas: null, denuncias: null, recientes: null, uso: null, pagos: {}, cargando: {} };
const ESTADO_T = { pendiente: ['En revisión', 'warn'], aprobado: ['Aprobada', 'ok'], rechazado: ['Rechazada', 'err'], suspendido: ['Suspendida', 'err'] };

/** ¿Esta cuenta administra la plataforma? (se recuerda para mostrar el menú sin señal) */
async function revisarAdmin() {
  if (!CUENTA.activa()) { if (DB.d.esAdmin) { DB.d.esAdmin = false; DB.guardar(); } return false; }
  try { const a = !!(await CUENTA.rpc('mc2_es_admin')); if (a !== !!DB.d.esAdmin) { DB.d.esAdmin = a; DB.guardar(); return true; } } catch (e) { }
  return false;
}
async function cargarAdm(que, fn, args) {
  if (ADM.cargando[que]) return;
  ADM.cargando[que] = true;
  try { const r = await CUENTA.rpc(fn, args || {}); const c = JSON.stringify(r) !== JSON.stringify(ADM[que]); ADM[que] = r; if (c && location.hash.startsWith('#/admin') && !PILA.length) render(); }
  catch (e) { if (location.hash.startsWith('#/admin')) toast(e.message, 'error'); }
  ADM.cargando[que] = false;
}
const recargarAdm = () => { ADM.tiendas = null; cargarAdm('tiendas', 'mc2_admin_vendedores'); cargarAdm('denuncias', 'mc2_admin_denuncias'); };

function htmlVence(t) {
  if (t.estado !== 'aprobado') return '';
  if (String(t.hasta) >= '2099-01-01') return 'Sin vencimiento';
  const hasta = String(t.hasta).slice(0, 10), dias = Math.round((new Date(hasta) - new Date(HOY())) / 864e5);
  const pagado = t.pagado_hasta && String(t.pagado_hasta) >= String(t.prueba_hasta || '');
  return (pagado ? 'Pagado hasta ' : 'Gratis hasta ') + fecha(hasta) + (dias < 0 ? ' · vencida' + (t.visible ? ' (en gracia)' : ' · oculta') : dias <= 7 ? ' · vence en ' + plural(dias, 'día') : '');
}

VISTAS.admin = () => {
  if (!DB.d.esAdmin) { revisarAdmin().then(c => c && render()); return { titulo: 'Administrar plataforma', atras: true, html: vacio('candado', 'Solo el administrador de la plataforma') }; }
  const tabs = [['tiendas', 'Tiendas'], ['denuncias', 'Denuncias'], ['nuevos', 'Publicado hoy'], ['uso', 'Uso']];
  let h = '<div class="chips-h">' + tabs.map(([k, t]) => '<button class="' + (ADM.tab === k ? 'on' : '') + '" data-act="admTab" data-t="' + k + '">' + t +
    (k === 'denuncias' && ADM.denuncias && ADM.denuncias.length ? ' (' + ADM.denuncias.length + ')' : '') +
    (k === 'tiendas' && ADM.tiendas && ADM.tiendas.some(x => x.estado === 'pendiente') ? ' •' : '') + '</button>').join('') + '</div>';
  if (ADM.tab === 'tiendas') {
    if (!ADM.tiendas) cargarAdm('tiendas', 'mc2_admin_vendedores');
    if (!ADM.denuncias) cargarAdm('denuncias', 'mc2_admin_denuncias');
    const ts = ADM.tiendas || [];
    const orden = { pendiente: 0, aprobado: 1, suspendido: 2, rechazado: 3 };
    h += !ADM.tiendas ? vacio('tienda', 'Cargando…') : ts.length ? '<div class="lista">' + ts.slice().sort((a, b) => orden[a.estado] - orden[b.estado]).map(t =>
      '<a class="fila" href="#/admin_t/' + t.id + '">' + logoTienda(t) + '<div class="cuerpo-f"><div class="t">' + esc(t.data.nombre) + ' ' + pill(ESTADO_T[t.estado][0], ESTADO_T[t.estado][1]) + '</div>' +
      '<div class="d">' + esc([t.data.rubro, t.data.distrito, t.email].filter(Boolean).join(' · ')) + '</div><div class="tiny muted">' + esc(htmlVence(t)) +
      (t.denuncias ? ' · ⚠ ' + t.denuncias + ' denuncia(s)' : '') + '</div></div>' + ico('der', 's') + '</a>').join('') + '</div>' : vacio('tienda', 'Aún no hay tiendas inscritas');
  } else if (ADM.tab === 'denuncias') {
    if (!ADM.denuncias) cargarAdm('denuncias', 'mc2_admin_denuncias');
    const ds = ADM.denuncias || [];
    h += !ADM.denuncias ? vacio('alerta', 'Cargando…') : ds.length ? ds.map(d => {
      const it = d.item && d.item.data ? d.item.data : null;
      return '<div class="card"><div class="small muted">' + fechaHora(d.creado) + ' · ' + esc(d.tienda) + ' · ' + (d.tipo === 'tienda' ? 'Tienda' : d.tipo === 'oferta' ? 'Oferta' : 'Producto') + (d.iguales > 1 ? ' · ' + d.iguales + ' denuncias' : '') + '</div>' +
        (it ? '<div style="display:flex;gap:10px;align-items:center;margin:6px 0">' + (d.tipo === 'producto' ? '<div style="width:56px;flex:none">' + fotoProd(it) + '</div>' : '') + '<div><b>' + esc(it.nombre || it.titulo || '') + '</b>' +
          (d.item.oculto ? ' ' + pill('Oculto', 'err') : '') + '<div class="small">' + esc(it.descripcion || it.texto || it.presentacion || '') + '</div></div></div>' : '') +
        '<div class="aviso tono-warn small">' + ico('alerta', 's') + '<div>' + esc(d.motivo) + '</div></div>' +
        '<div class="btns">' + (d.tipo !== 'tienda' ? '<button class="btn chico peligro" data-act="admResolver" data-id="' + d.id + '" data-a="ocultar">Ocultar</button><button class="btn chico" data-act="admResolver" data-id="' + d.id + '" data-a="mostrar">Está bien, mostrar</button>' : '') +
        '<button class="btn chico peligro" data-act="admResolver" data-id="' + d.id + '" data-a="suspender">Suspender tienda</button><button class="btn chico ghost" data-act="admResolver" data-id="' + d.id + '" data-a="descartar">Descartar</button></div></div>';
    }).join('') : vacio('check', 'No hay denuncias pendientes');
  } else if (ADM.tab === 'nuevos') {
    if (!ADM.recientes) cargarAdm('recientes', 'mc2_admin_recientes', { p_horas: 24 });
    const rs = ADM.recientes || [];
    h += '<p class="small muted">Productos y ofertas publicados o cambiados en las últimas 24 horas. Revisa fotos y textos; si algo no cumple, ocúltalo.</p>';
    h += !ADM.recientes ? vacio('canasta', 'Cargando…') : rs.length ? '<div class="lista">' + rs.map(r => '<div class="fila">' + (r.tipo === 'producto' ? '<div style="width:52px;flex:none">' + fotoProd(r.data) + '</div>' : ico('dinero')) +
      '<div class="cuerpo-f"><div class="t">' + esc(r.data.nombre || r.data.titulo || '') + (r.oculto ? ' ' + pill('Oculto', 'err') : '') + '</div><div class="d">' + esc(r.tienda) + ' · ' + fechaHora(r.cambiado) + '</div>' +
      '<div class="tiny muted" style="white-space:normal">' + esc((r.data.descripcion || r.data.texto || '').slice(0, 140)) + '</div></div>' +
      '<button class="btn chico' + (r.oculto ? '' : ' peligro') + '" data-act="admOcultar" data-v="' + r.v + '" data-tipo="' + r.tipo + '" data-id="' + esc(r.id) + '" data-o="' + (r.oculto ? '0' : '1') + '">' + (r.oculto ? 'Mostrar' : 'Ocultar') + '</button></div>').join('') + '</div>' : vacio('check', 'Nada nuevo en las últimas 24 horas');
  } else {
    if (!ADM.uso) cargarAdm('uso', 'mc2_admin_uso');
    const u = ADM.uso;
    if (!u) h += vacio('nube_ok', 'Cargando…');
    else {
      const barra = (l, v, max) => { const pc = Math.min(100, Math.round(v / max * 100)); return '<div style="margin:8px 0"><div class="small" style="display:flex;justify-content:space-between"><span>' + l + '</span><b>' + String(v).replace('.', ',') + ' de ' + max + ' MB (' + pc + ' %)</b></div>' +
        '<div style="height:10px;border-radius:6px;background:var(--line);overflow:hidden"><div style="height:100%;width:' + pc + '%;background:' + (pc >= 80 ? 'var(--red)' : 'var(--green)') + '"></div></div></div>'; };
      h += '<div class="card"><h3>Espacio gratis de Supabase</h3>' + barra('Base de datos', u.mb_base, u.mb_base_max) + barra('Fotos del mercado', u.mb_fotos, u.mb_fotos_max) +
        ((u.mb_base / u.mb_base_max >= 0.8 || u.mb_fotos / u.mb_fotos_max >= 0.8) ? '<div class="aviso tono-err small">' + ico('alerta', 's') + '<div>Pasaste el 80 %. Hay que decidir: archivar campañas antiguas o pasar al plan Pro (pago).</div></div>' : '') + '</div>';
      const t = u.tiendas || {};
      h += '<div class="kpis"><div class="kpi"><div class="l">Cuentas</div><div class="v">' + u.cuentas + '</div></div><div class="kpi"><div class="l">Fincas (espacios)</div><div class="v">' + u.espacios + '</div></div>' +
        '<div class="kpi"><div class="l">Tiendas aprobadas</div><div class="v">' + (t.aprobado || 0) + '</div><div class="s">' + (t.pendiente || 0) + ' en revisión</div></div>' +
        '<div class="kpi"><div class="l">Pedidos (30 días)</div><div class="v">' + u.pedidos_30d + '</div><div class="s">' + u.denuncias + ' denuncias pendientes</div></div></div>';
      h += '<p class="small muted">Solo se muestran conteos. Los datos de cada finca son privados y no se pueden ver desde aquí.</p>';
    }
  }
  return { titulo: 'Administrar plataforma', atras: true, html: h, acciones: '<button class="icon-btn" data-act="admRecargar" aria-label="Actualizar">' + ico('restaurar') + '</button>' };
};
ACC.admTab = el => { ADM.tab = el.dataset.t; render(); };
ACC.admRecargar = () => { ADM.tiendas = ADM.denuncias = ADM.recientes = ADM.uso = null; render(); };
ACC.admResolver = async el => {
  const a = el.dataset.a;
  const txt = { ocultar: 'Se ocultará del mercado.', mostrar: 'Se mostrará y se cerrarán sus denuncias.', suspender: 'La tienda completa dejará de verse en el mercado.', descartar: 'Se cerrará sin cambios.' }[a];
  if (!(await confirmar('¿Confirmas?', txt, { si: 'Confirmar', peligro: a === 'suspender' || a === 'ocultar' }))) return;
  try { await CUENTA.rpc('mc2_admin_resolver', { p_id: Number(el.dataset.id), p_accion: a, p_nota: null }); } catch (e) { return toast(e.message, 'error'); }
  toast('Listo'); ADM.denuncias = null; ADM.tiendas = null; actualizarMercado(true); render();
};
ACC.admOcultar = async el => {
  try { await CUENTA.rpc('mc2_admin_ocultar', { p_v: el.dataset.v, p_tipo: el.dataset.tipo, p_id: el.dataset.id, p_oculto: el.dataset.o === '1' }); } catch (e) { return toast(e.message, 'error'); }
  toast(el.dataset.o === '1' ? 'Ocultado' : 'Visible otra vez'); ADM.recientes = null; actualizarMercado(true); render();
};

/* ---------- Ficha de una tienda ---------- */
VISTAS.admin_t = id => {
  if (!DB.d.esAdmin) return VISTAS.admin();
  if (!ADM.tiendas) cargarAdm('tiendas', 'mc2_admin_vendedores');
  const t = (ADM.tiendas || []).find(x => x.id === id);
  if (!t) return { titulo: 'Tienda', atras: true, html: vacio('tienda', ADM.tiendas ? 'Tienda no encontrada' : 'Cargando…') };
  if (!ADM.pagos[id]) CUENTA.rpc('mc2_admin_pagos', { p_v: id }).then(r => { ADM.pagos[id] = r || []; if (location.hash === '#/admin_t/' + id) render(); }).catch(() => { });
  const d = t.data;
  let h = '<div class="card" style="display:flex;gap:12px;align-items:center">' + logoTienda(t, 56) + '<div style="flex:1;min-width:0"><b>' + esc(d.nombre) + '</b> ' + pill(ESTADO_T[t.estado][0], ESTADO_T[t.estado][1]) +
    '<div class="small muted">' + esc(t.email || '') + '</div></div>' + (d.whatsapp ? '<button class="icon-btn" data-act="whatsapp" data-cel="' + esc(d.whatsapp) + '" aria-label="WhatsApp" style="color:var(--green)">' + ico('whatsapp') + '</button>' : '') + '</div>';
  h += '<div class="card"><table class="tabla">' + [['RUC', d.ruc || '—'], ['Rubro', d.rubro], ['Distrito', d.distrito], ['Dirección', d.direccion], ['WhatsApp', d.whatsapp], ['Horario', d.horario],
    ['Reparte en', (d.zonas || []).join(', ')], ['Inscrita', fecha(fechaISO(new Date(t.creado)))], ['Productos', t.productos], ['Pedidos (30 días)', t.pedidos_30d],
    ['Calificación', t.calificacion ? '★ ' + t.calificacion : '—'], ['Denuncias pendientes', t.denuncias]].filter(r => r[1] !== undefined && r[1] !== '').map(r =>
    '<tr><td class="muted">' + r[0] + '</td><td class="m" style="white-space:normal">' + esc(String(r[1])) + '</td></tr>').join('') + '</table>' +
    (t.motivo ? '<div class="aviso tono-warn small" style="margin-top:8px">' + ico('info', 's') + '<div>Motivo: ' + esc(t.motivo) + '</div></div>' : '') + '</div>';
  // Suscripción
  if (t.estado === 'aprobado') {
    h += '<div class="grupo">Suscripción</div><div class="card"><div><b>' + esc(htmlVence(t)) + '</b></div>' +
      (t.monto_mensual > 0 ? '<div class="small muted">Monto mensual acordado: ' + soles(t.monto_mensual) + '</div>' : '') +
      (t.legado ? '' : '<button class="btn pri bloque" data-act="admPago" data-id="' + t.id + '" style="margin-top:10px">' + ico('dinero') + 'Registrar pago</button>') + '</div>';
    const ps = ADM.pagos[id] || [];
    if (ps.length) h += '<div class="lista">' + ps.map(p => '<div class="fila">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">' + soles(p.monto) + ' · ' + esc(p.forma || '') + '</div><div class="d">' +
      fecha(p.desde) + ' al ' + fecha(p.hasta) + (p.nota ? ' · ' + esc(p.nota) : '') + '</div></div></div>').join('') + '</div>';
  }
  const btn = (a, t2, cls) => '<button class="btn ' + (cls || '') + '" data-act="admDecidir" data-id="' + t.id + '" data-a="' + a + '">' + t2 + '</button>';
  h += '<div class="btns" style="margin-top:12px">' + (t.estado === 'pendiente' ? btn('aprobar', ico('check') + 'Aprobar (30 días gratis)', 'pri') + btn('rechazar', 'Rechazar', 'peligro') : '') +
    (t.estado === 'aprobado' && !t.legado ? btn('suspender', 'Suspender', 'peligro') : '') + (t.estado === 'suspendido' || t.estado === 'rechazado' ? btn('reactivar', 'Aprobar / reactivar', 'pri') : '') + '</div>';
  if (t.estado === 'aprobado') h += '<a class="btn chico ghost" href="#/tiendav/' + t.id + '" style="margin-top:8px">' + ico('canasta', 's') + 'Ver como cliente</a>';
  return { titulo: d.nombre, atras: true, html: h };
};
ACC.admDecidir = el => {
  const a = el.dataset.a, conMotivo = a === 'rechazar' || a === 'suspender';
  const tt = { aprobar: 'Aprobar tienda', rechazar: 'Rechazar inscripción', suspender: 'Suspender tienda', reactivar: 'Reactivar tienda' }[a];
  formulario({
    titulo: tt, valores: {},
    aviso: a === 'aprobar' ? 'Empieza su periodo gratis de 30 días y sus productos se publican en el mercado.' : a === 'suspender' ? 'Sus productos y ofertas dejan de verse. Sus pedidos en curso se pueden seguir atendiendo.' : '',
    campos: conMotivo ? [{ id: 'motivo', et: 'Motivo (lo verá la tienda)', tipo: 'area', req: true }] : [{ id: 'nota', tipo: 'html', html: '' }],
    guardar: tt.split(' ')[0],
    alGuardar: async x => {
      try { await CUENTA.rpc('mc2_admin_decidir', { p_v: el.dataset.id, p_accion: a, p_motivo: x.motivo || null }); } catch (e) { return e.message; }
      toast('Listo'); ADM.tiendas = null; actualizarMercado(true); render();
    },
  });
};
ACC.admPago = el => {
  const t = (ADM.tiendas || []).find(x => x.id === el.dataset.id);
  formulario({
    titulo: 'Registrar pago de ' + t.data.nombre, valores: { meses: 1, monto: t.monto_mensual || '', forma: 'Yape' },
    aviso: 'El pago se recibe fuera de la app. Al registrarlo, la tienda queda pagada desde el día siguiente a su vencimiento (o desde hoy si ya venció).',
    campos: [
      { id: 'monto', et: 'Monto recibido (S/)', tipo: 'num', min: 0, req: true },
      { id: 'meses', et: 'Meses que cubre', tipo: 'num', min: 1, max: 12, req: true },
      { id: 'forma', et: 'Forma de pago', tipo: 'seg', req: true, ops: ['Yape', 'Plin', 'Transferencia', 'Efectivo'] },
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Ej. N° de operación, boleta B001-123' },
    ],
    guardar: 'Registrar',
    alGuardar: async x => {
      let r;
      try { r = await CUENTA.rpc('mc2_admin_pago', { p_v: t.id, p_monto: Number(x.monto), p_forma: x.forma, p_meses: Number(x.meses), p_nota: x.nota || null }); } catch (e) { return e.message; }
      toast('Pagado hasta el ' + fecha(r.hasta)); ADM.tiendas = null; delete ADM.pagos[t.id]; actualizarMercado(true); render();
    },
  });
};
