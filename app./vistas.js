'use strict';
/* ==========================================================================
   MI-CHACRA · Pantallas de campo: inicio, trabajadores, asistencia y cosecha
   ========================================================================== */

/* ---------- Ayudas ---------- */
const nomT = id => { const t = DB.get('trabajadores', id); return t ? t.nombre : '(sin trabajador)'; };
const nomP = id => { const p = id && DB.get('parcelas', id); return p ? p.nombre : ''; };
const nomC = id => { const c = id && DB.get('cultivos', id); return c ? c.nombre : ''; };
const trabajadoresChacra = (incluirInactivos) => DB.todos('trabajadores')
  .filter(t => (t.chacras || []).includes(DB.chacraId) && (incluirInactivos || t.activo !== false))
  .sort((a, b) => a.nombre.localeCompare(b.nombre));
const parcelasChacra = () => DB.deChacra('parcelas').filter(p => p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
const cultivosActivos = () => DB.todos('cultivos').filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));
const laboresLista = () => DB.todos('labores').map(l => l.nombre);
const opsParcelas = () => [{ v: '', t: 'Sin parcela' }].concat(parcelasChacra().map(p => ({ v: p.id, t: p.nombre })));
function resumenCantidades(regs) {
  const g = {};
  for (const r of regs) { const k = (nomC(r.cultivoId) || '') + '|' + r.unidad; g[k] = (g[k] || 0) + (Number(r.cantidad) || 0); }
  return Object.keys(g).map(k => { const [c, u] = k.split('|'); return { cultivo: c, unidad: u, cantidad: r2(g[k]) }; })
    .sort((a, b) => b.cantidad - a.cantidad);
}
function avisoPagado(tid, fechaR) {
  const l = DB.periodoPagado(tid, DB.chacraId, fechaR);
  return l ? 'La semana del ' + fecha(l.desde) + ' al ' + fecha(l.hasta) + ' ya se pagó. Si cambias el monto, la diferencia quedará en el saldo del trabajador.' : '';
}
function trasEditarPago(tid, antes, despues) {
  const d = r2(despues - antes);
  if (!d) return;
  toast(d > 0 ? 'Se le debe ' + soles(d) + ' más a ' + nomT(tid) : 'Se descontarán ' + soles(-d) + ' a ' + nomT(tid));
}
function puedeOToast(accion) { if (DB.puede(accion)) return true; toast('No tienes permiso para esto', 'error'); return false; }
function fechaNav(act, f) {
  return '<div class="fecha-nav"><button class="icon-btn" data-act="' + act + '" data-d="-1" aria-label="Día anterior">' + ico('izq') + '</button>' +
    '<input class="inp" type="date" value="' + f + '" max="' + HOY() + '" data-fecha="' + act + '">' +
    '<button class="icon-btn" data-act="' + act + '" data-d="1" aria-label="Día siguiente"' + (f >= HOY() ? ' disabled style="opacity:.3"' : '') + '>' + ico('der') + '</button></div>';
}
document.addEventListener('change', e => {
  const el = e.target.closest('[data-fecha]');
  if (el && el.value && ACC[el.dataset.fecha]) ACC[el.dataset.fecha]({ dataset: { valor: el.value } });
});

/* ==========================================================================
   INICIO
   ========================================================================== */
VISTAS.inicio = () => {
  const hoy = HOY(), m = DB.puede('montos'), camp = DB.campaniaActiva();
  const cosHoy = DB.deChacra('cosechas').filter(r => r.fecha === hoy);
  const trHoy = DB.deChacra('trabajos').filter(r => r.fecha === hoy);
  const presentes = new Set([...cosHoy, ...trHoy].map(r => r.trabajadorId)).size;
  const activos = trabajadoresChacra().length;
  const cants = resumenCantidades(cosHoy);
  const sem = DB.semana(hoy);
  const enSem = r => r.fecha >= sem.desde && r.fecha <= sem.hasta;
  const ganadoSem = sumar(DB.deChacra('trabajos').filter(enSem), r => r.total) + sumar(DB.deChacra('cosechas').filter(enSem), r => r.total);
  let porPagar = 0;
  if (m) for (const t of trabajadoresChacra(true)) { const s = DB.saldo(t.id, DB.chacraId); if (s > 0) porPagar += s; }
  const contratas = DB.deChacra('contratas').filter(c => c.estado !== 'terminada');
  const saldoContr = sumar(contratas, c => c.monto - DB.pagadoContrata(c));

  let h = '';
  if (!camp) h += '<div class="aviso tono-warn">' + ico('alerta', 's') + '<div>No hay una campaña activa. <a href="#/campanias">Crea una campaña</a> para empezar a registrar.</div></div>';
  if (!activos) h += '<div class="aviso tono-info">' + ico('info', 's') + '<div>Empieza registrando a tus trabajadores. <a href="#/trabajadores">Ir a trabajadores</a></div></div>';
  const repPend = DB.puede('reportes') ? DB.deChacra('reportes').filter(r => r.estado === 'pendiente').length : 0;
  if (repPend) h += '<a class="aviso tono-warn" href="#/reportes" style="text-decoration:none">' + ico('alerta', 's') + '<div><b>' + repPend + (repPend === 1 ? ' trabajador reportó' : ' reportes de trabajadores') + '</b> un posible error. Toca para revisar.</div></a>';
  // Para atender: abonos que tocan, carencias, stock bajo, cobros y pagos (hoy, mañana y atrasados)
  if (DB.rol() !== 'operario') {
    const al = DB.alertas(DB.chacraId, 1).filter(a => (!a.dinero || DB.puede('finanzas')) && (a.tipo !== 'stock' && a.tipo !== 'vence' || DB.puede('campo')));
    if (al.length) {
      h += '<div class="card" style="padding:6px 0"><div style="display:flex;justify-content:space-between;align-items:center;padding:6px 14px"><h3 style="margin:0">Para atender</h3><a class="small" href="#/calendario">Calendario</a></div>' +
        al.slice(0, 6).map(a => {
          const attrs = a.tipo === 'abono' ? 'data-act="aplicarPlan" data-plan="' + a.planId + '" data-parcela="' + a.parcelaId + '"' : 'data-act="ir" data-ruta="' + (a.ruta || 'calendario') + '"';
          const cuando = a.tipo === 'carencia' || a.tipo === 'stock' ? '' : a.atrasada ? pill('Atrasado', 'err') : a.fecha === hoy ? pill('Hoy', 'warn') :
            a.fecha === sumarDias(hoy, 1) ? pill('Mañana', 'info') : pill(fecha(a.fecha).slice(0, 5), 'info');
          return '<div class="fila" ' + attrs + ' style="min-height:52px">' + ico(ICONO_ALERTA[a.tipo] || 'info') + '<div class="cuerpo-f"><div class="t" style="white-space:normal">' + esc(a.titulo) + '</div>' +
            (a.texto ? '<div class="d">' + esc(a.texto) + '</div>' : '') + '</div>' + (cuando || pill(a.tipo === 'carencia' ? 'Carencia' : 'Stock', a.tipo === 'carencia' ? 'err' : 'warn')) + '</div>';
        }).join('') + (al.length > 6 ? '<a class="small" href="#/calendario" style="display:block;padding:8px 14px">Ver ' + (al.length - 6) + ' más</a>' : '') + '</div>';
    }
  }

  if (camp && DB.puede('finanzas')) {
    const R = DB.resultado(camp.id);
    h += '<a href="#/ganancia" class="kpi ' + (R.ganancia >= 0 ? 'hero' : 'tono-err') + '" style="display:block;text-decoration:none;margin-bottom:10px"><div class="l">Utilidad neta · ' + esc(camp.nombre) + '</div>' +
      '<div class="v" style="font-size:28px">' + soles(R.ganancia) + '</div><div class="s">Ingresos ' + soles(R.ingresos) + ' · Gastos totales ' + soles(R.costos) + (R.rentabilidad !== null ? ' · ' + R.rentabilidad + '%' : '') + '</div></a>';
  }

  h += htmlOfertas(2);
  h += '<div class="kpis">';
  h += '<div class="kpi ' + (DB.puede('finanzas') && camp ? '' : 'hero') + '"><div class="l">Cosechado hoy</div><div class="v">' + (cants[0] ? plural(cants[0].cantidad, cants[0].unidad) : '0') + '</div><div class="s">' +
    (cants[0] ? esc(cants[0].cultivo) + (cants.length > 1 ? ' · +' + (cants.length - 1) + ' más' : '') : 'Aún sin cosecha') + '</div></div>';
  h += '<div class="kpi"><div class="l">Presentes hoy</div><div class="v">' + presentes + '</div><div class="s">de ' + activos + ' activos</div></div>';
  if (m) {
    h += '<div class="kpi"><div class="l">Por pagar</div><div class="v">' + soles(porPagar) + '</div><div class="s">a trabajadores</div></div>';
    h += '<div class="kpi"><div class="l">Mano de obra semana</div><div class="v">' + soles(ganadoSem) + '</div><div class="s">' + fecha(sem.desde).slice(0, 5) + ' – ' + fecha(sem.hasta).slice(0, 5) + '</div></div>';
  }
  h += '</div>';

  h += '<div class="acciones-rapidas">' +
    '<button class="accion" data-act="ir" data-ruta="cosecha">' + ico('canasta', 'l') + 'Registrar cosecha</button>' +
    '<button class="accion" data-act="ir" data-ruta="tareo">' + ico('asistencia', 'l') + 'Marcar asistencia</button>' +
    (DB.puede('adelantos') ? '<button class="accion" data-act="movNuevo">' + ico('dinero', 'l') + 'Dar adelanto</button>' : '') +
    (DB.puede('trabajadores') ? '<button class="accion" data-act="trabNuevo">' + ico('usuario', 'l') + 'Nuevo trabajador</button>' : '') +
    (DB.puede('campo') ? '<button class="accion" data-act="aplicacionNueva">' + ico('hoja', 'l') + 'Registrar abono</button>' : '') +
    (DB.puede('finanzas') ? '<button class="accion" data-act="ventaNueva">' + ico('dinero', 'l') + 'Registrar venta</button>' +
      '<button class="accion" data-act="gastoEditar">' + ico('boleta', 'l') + 'Registrar gasto</button>' : '') +
    '</div>';

  // Producción de las últimas 8 semanas (cultivo y unidad principal de la campaña)
  if (camp) {
    const principal = resumenCantidades(DB.deChacra('cosechas').filter(r => r.campaniaId === camp.id))[0];
    if (principal) {
      const cos = DB.deChacra('cosechas').filter(r => nomC(r.cultivoId) === principal.cultivo && r.unidad === principal.unidad);
      const sems = [];
      for (let i = 7; i >= 0; i--) {
        const s = DB.semana(sumarDias(hoy, -7 * i));
        sems.push({ l: fecha(s.desde).slice(0, 5), v: sumar(cos.filter(r => r.fecha >= s.desde && r.fecha <= s.hasta), r => r.cantidad) });
      }
      h += '<div class="card"><h3>' + esc(principal.cultivo) + ' cosechado por semana (' + esc(pluralU(principal.unidad)) + ')</h3>' + columnas(sems) + '</div>';
    }
  }

  if (cants.length > 1) {
    h += '<div class="card"><h3>Cosecha de hoy</h3><table class="tabla">' + cants.map(c => '<tr><td>' + esc(c.cultivo) + '</td><td class="m">' + plural(c.cantidad, c.unidad) + '</td></tr>').join('') + '</table></div>';
  }

  // Mejores cosechadores de hoy
  const porT = {};
  for (const r of cosHoy) porT[r.trabajadorId] = (porT[r.trabajadorId] || 0) + (Number(r.cantidad) || 0);
  const top = Object.keys(porT).map(id => ({ id, n: porT[id] })).sort((a, b) => b.n - a.n).slice(0, 5);
  if (top.length) {
    const max = top[0].n || 1, u = cants[0] ? cants[0].unidad : '';
    h += '<div class="grupo">Cosechadores de hoy</div><div class="card">' + top.map(x =>
      '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:14px"><span>' + esc(nomT(x.id)) + '</span><b class="num">' + cant(x.n) + ' ' + esc(cants.length === 1 ? pluralU(u) : '') + '</b></div>' +
      '<div class="barra"><i style="width:' + Math.round(x.n / max * 100) + '%"></i></div></div>').join('') + '</div>';
  }

  if (contratas.length) {
    h += '<div class="grupo">Contratas en curso</div><div class="lista">' + contratas.slice(0, 4).map(c =>
      '<a class="fila" href="#/contrata/' + c.id + '">' + ico('contrata') + '<div class="cuerpo-f"><div class="t">' + esc(c.contratista) + '</div><div class="d">' + esc(c.labor) + ' · avance ' + (c.avance || 0) + '%</div></div>' +
      (m ? '<div class="x"><div class="t">' + soles(c.monto - DB.pagadoContrata(c)) + '</div><div class="d">por pagar</div></div>' : '') + '</a>').join('') + '</div>';
    if (m && contratas.length > 4) h += '<p class="small muted">Total por pagar en contratas: ' + soles(saldoContr) + '</p>';
  }

  if (camp) {
    const cc = DB.deChacra('cosechas').filter(r => r.campaniaId === camp.id);
    const ct = DB.deChacra('trabajos').filter(r => r.campaniaId === camp.id);
    const ccon = DB.deChacra('contratas').filter(r => r.campaniaId === camp.id);
    const mo = sumar(cc, r => r.total) + sumar(ct, r => r.total) + sumar(ccon, r => r.monto);
    h += '<div class="grupo">' + esc(camp.nombre) + '</div><div class="card">' +
      '<table class="tabla">' + resumenCantidades(cc).map(c => '<tr><td>' + esc(c.cultivo) + ' cosechado</td><td class="m">' + plural(c.cantidad, c.unidad) + '</td></tr>').join('') +
      '<tr><td>Jornadas registradas</td><td class="m">' + cant(sumar(ct.filter(r => r.modalidad === 'jornal'), r => r.cantidad)) + ' días</td></tr>' +
      (m ? '<tr><td><b>Mano de obra acumulada</b></td><td class="m"><b>' + soles(mo) + '</b></td></tr>' : '') + '</table>' +
      (DB.puede('finanzas') ? '<a class="btn chico" href="#/ganancia" style="margin-top:10px">' + ico('bandera', 's') + 'Ver ganancia de la campaña</a>' : '') + '</div>';
  }
  return { titulo: 'Hola, ' + DB.usuario.nombre.split(' ')[0], html: h };
};

/* ==========================================================================
   TRABAJADORES
   ========================================================================== */
let filtroTrab = 'activos', buscaTrab = '';
VISTAS.trabajadores = () => {
  const m = DB.puede('montos');
  let lista = trabajadoresChacra(true);
  if (filtroTrab === 'activos') lista = lista.filter(t => t.activo !== false);
  if (filtroTrab === 'inactivos') lista = lista.filter(t => t.activo === false);
  const q = buscaTrab.toLowerCase();
  if (q) lista = lista.filter(t => (t.nombre + ' ' + (t.dni || '') + ' ' + (t.celular || '') + ' ' + (t.codigo || '')).toLowerCase().includes(q));
  let h = '<div class="buscar">' + ico('buscar') + '<input class="inp" id="buscaTrab" placeholder="Buscar por nombre, DNI o celular" value="' + esc(buscaTrab) + '"></div>';
  h += '<div class="chips-h">' + [['activos', 'Activos'], ['inactivos', 'Inactivos'], ['todos', 'Todos']].map(([k, t]) =>
    '<button class="' + (filtroTrab === k ? 'on' : '') + '" data-act="filtroTrab" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  if (!lista.length) h += vacio('personas', q ? 'No hay resultados' : 'Aún no hay trabajadores en esta chacra');
  else h += '<div class="lista" id="listaTrab">' + lista.map(t => {
    const s = m ? DB.saldo(t.id, DB.chacraId) : 0;
    return '<a class="fila" href="#/trabajador/' + t.id + '"><span class="avatar">' + esc(iniciales(t.nombre)) + '</span><div class="cuerpo-f"><div class="t">' + esc(t.nombre) +
      (t.activo === false ? ' ' + pill('Inactivo', 'warn') : '') + '</div><div class="d">N° ' + esc(t.codigo || '—') + ' · ' + esc(t.celular || 'sin celular') + '</div></div>' +
      (m && s ? '<div class="x"><div class="t">' + soles(s) + '</div><div class="d">' + (s > 0 ? 'por pagar' : 'a favor') + '</div></div>' : '') + '</a>';
  }).join('') + '</div>';
  return {
    titulo: 'Trabajadores', html: h,
    fab: DB.puede('trabajadores') ? { t: 'Nuevo', icono: 'mas', act: 'trabNuevo' } : null,
    despues: root => {
      const b = $('#buscaTrab', root);
      b.addEventListener('input', () => { buscaTrab = b.value; const pos = b.selectionStart; render(); const nb = $('#buscaTrab'); nb.focus(); nb.setSelectionRange(pos, pos); });
    },
  };
};
ACC.filtroTrab = el => { filtroTrab = el.dataset.f; render(); };

function formTrabajador(t) {
  if (!puedeOToast('trabajadores')) return;
  const nuevo = !t;
  const chs = DB.chacrasVisibles();
  formulario({
    titulo: nuevo ? 'Nuevo trabajador' : 'Editar trabajador',
    valores: nuevo ? { codigo: DB.siguienteCodigo(), tipo: 'cosecha', chacras: [DB.chacraId], activo: true } : Object.assign({}, t),
    campos: [
      { id: 'nombre', et: 'Nombres y apellidos', tipo: 'texto', req: true, foco: nuevo, ph: 'Juan Quispe Huamán' },
      { id: 'celular', et: 'Celular', tipo: 'tel', req: true, ph: '987654321', par: true },
      { id: 'dni', et: 'DNI', tipo: 'dni', ph: '45128763', valida: v => {
        const o = DB.todos('trabajadores').find(x => x.dni === v && (!t || x.id !== t.id));
        return o ? 'Ya existe ' + o.nombre + ' con ese DNI' : '';
      } },
      { id: 'codigo', et: 'N° de trabajador', tipo: 'texto', par: true },
      { id: 'activo', et: 'Activo', tipo: 'chk' },
      { id: 'tipo', et: 'Trabajo habitual', tipo: 'seg', ops: [{ v: 'cosecha', t: 'Cosecha' }, { v: 'jornal', t: 'Jornal' }, { v: 'cuadra', t: 'Por cuadra' }, { v: 'tarea', t: 'Por tarea' }] },
      { id: 'chacras', et: 'Trabaja en', tipo: 'multi', req: true, ops: chs.map(c => ({ v: c.id, t: c.nombre })), ver: () => chs.length > 1 },
      { id: 'nota', et: 'Notas', tipo: 'area', ph: 'Opcional' },
      { id: 'acceso', et: 'Puede ver sus latas y pagos en la app', tipo: 'chk', ver: () => DB.puede('pagos'),
        ayuda: 'Entra con su DNI y un PIN. Solo ve su propia información.' },
      { id: 'pinT', et: t && t.pin ? 'Nuevo PIN (déjalo vacío para no cambiarlo)' : 'PIN del trabajador (4 dígitos)', tipo: 'pin', req: !(t && t.pin),
        ver: v => !!v.acceso && DB.puede('pagos'), valida: v => /^\d{4}$/.test(v) ? '' : 'El PIN debe tener 4 dígitos' },
    ],
    eliminar: nuevo || !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar trabajador', 'Se moverá a la papelera. Sus registros de cosecha y pagos se conservan.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('trabajadores', t.id, t.nombre); cerrarTodas(); toast('Trabajador eliminado'); ir('trabajadores');
      }
    },
    alGuardar: async v => {
      v.nombre = v.nombre.replace(/\s+/g, ' ');
      if (!v.chacras || !v.chacras.length) v.chacras = [DB.chacraId];
      if (v.acceso && !v.dni) return 'Para darle acceso, escribe su DNI (con eso entra a la app)';
      if (v.pinT) { v.sal = uid(); v.pin = await huellaPin(v.pinT, v.sal); }
      delete v.pinT;
      if (!DB.puede('pagos') && t) v.acceso = !!t.acceso;
      if (nuevo) { const r = DB.crear('trabajadores', v, 'Nuevo trabajador: ' + v.nombre); toast('Trabajador registrado'); ir('trabajador/' + r.id); }
      else { DB.editar('trabajadores', t.id, v, t.nombre); toast('Cambios guardados'); render(); }
    },
  });
}
ACC.trabNuevo = () => formTrabajador(null);
ACC.trabEditar = el => formTrabajador(DB.get('trabajadores', el.dataset.id));
ACC.llamar = el => abrirExterno('tel:' + el.dataset.cel);
ACC.whatsapp = el => abrirExterno(enlaceWhatsApp(el.dataset.cel, el.dataset.txt || ''));

VISTAS.trabajador = id => {
  const t = DB.get('trabajadores', id);
  if (!t || t.eliminado) return { titulo: 'Trabajador', atras: true, html: vacio('usuario', 'Este trabajador no existe o fue eliminado') };
  const m = DB.puede('montos'), camp = DB.campaniaActiva();
  const desde = camp ? camp.inicio : null;
  const g = DB.ganancias(t.id, DB.chacraId, desde, null);
  const ganado = sumar(g.trabajos, r => r.total) + sumar(g.cosechas, r => r.total);
  const saldo = DB.saldo(t.id, DB.chacraId);
  const dias = DB.diasTrabajados(t.id, DB.chacraId, desde, null);
  const cants = resumenCantidades(g.cosechas);
  let h = '<div class="card center"><span class="avatar xl">' + esc(iniciales(t.nombre)) + '</span><h2 style="margin-top:8px">' + esc(t.nombre) + '</h2>' +
    '<div class="muted small">N° ' + esc(t.codigo || '—') + ' · ' + (t.activo === false ? 'Inactivo' : 'Activo') + '</div>' +
    (t.celular ? '<div class="btns" style="margin-top:12px"><button class="btn" data-act="llamar" data-cel="' + esc(t.celular) + '">' + ico('telefono') + 'Llamar</button>' +
      '<button class="btn tono-ok" data-act="whatsapp" data-cel="' + esc(t.celular) + '">' + ico('whatsapp') + 'WhatsApp</button></div>' : '') + '</div>';
  h += '<div class="kpis"><div class="kpi"><div class="l">Días trabajados</div><div class="v">' + dias + '</div><div class="s">' + (camp ? esc(camp.nombre) : 'total') + '</div></div>' +
    '<div class="kpi"><div class="l">Cosechado</div><div class="v">' + (cants[0] ? plural(cants[0].cantidad, cants[0].unidad) : '0') + '</div><div class="s">' + (cants[0] ? esc(cants[0].cultivo) : '—') + '</div></div>' +
    (m ? '<div class="kpi"><div class="l">Ganado</div><div class="v">' + soles(ganado) + '</div><div class="s">en la campaña</div></div>' +
      '<div class="kpi ' + (saldo > 0 ? 'tono-warn' : 'tono-ok') + '"><div class="l">Saldo</div><div class="v">' + soles(saldo) + '</div><div class="s">' + (saldo > 0 ? 'por pagar' : saldo < 0 ? 'a favor de la chacra' : 'al día') + '</div></div>' : '') + '</div>';
  if (m) h += '<div class="btns" style="margin-bottom:12px"><a class="btn pri" href="#/liquidacion/' + t.id + '">' + ico('boleta') + 'Liquidación</a>' +
    (DB.puede('adelantos') ? '<button class="btn" data-act="movNuevo" data-t="' + t.id + '">' + ico('dinero') + 'Adelanto</button>' : '') + '</div>';
  h += '<div class="card"><table class="tabla"><tr><td class="muted">Celular</td><td class="m">' + esc(t.celular || '—') + '</td></tr>' +
    '<tr><td class="muted">DNI</td><td class="m">' + esc(t.dni || '—') + '</td></tr>' +
    '<tr><td class="muted">Trabajo habitual</td><td class="m">' + esc({ cosecha: 'Cosecha', jornal: 'Jornal', cuadra: 'Por cuadra', tarea: 'Por tarea' }[t.tipo] || '—') + '</td></tr>' +
    '<tr><td class="muted">Chacras</td><td class="m">' + esc((t.chacras || []).map(c => (DB.get('chacras', c) || {}).nombre).filter(Boolean).join(', ')) + '</td></tr>' +
    '<tr><td class="muted">Acceso a la app</td><td class="m">' + (t.acceso ? 'Sí · entra con DNI y PIN' : 'No') + '</td></tr>' +
    (t.nota ? '<tr><td class="muted">Notas</td><td class="m" style="white-space:normal">' + esc(t.nota) + '</td></tr>' : '') + '</table></div>';
  // Últimos registros
  const regs = [...DB.deChacra('cosechas').filter(r => r.trabajadorId === t.id).map(r => ({ r, col: 'cosechas' })),
    ...DB.deChacra('trabajos').filter(r => r.trabajadorId === t.id).map(r => ({ r, col: 'trabajos' })),
    ...DB.deChacra('movimientos').filter(r => r.trabajadorId === t.id).map(r => ({ r, col: 'movimientos' }))]
    .sort((a, b) => (b.r.fecha || '').localeCompare(a.r.fecha || '') || b.r.creado - a.r.creado).slice(0, 30);
  h += '<div class="grupo">Últimos registros</div>';
  h += regs.length ? '<div class="lista">' + regs.map(x => filaRegistro(x.col, x.r, false)).join('') + '</div>' : vacio('historial', 'Sin registros todavía');
  return {
    titulo: t.nombre, atras: true, html: h,
    acciones: DB.puede('trabajadores') ? '<button class="icon-btn" data-act="trabEditar" data-id="' + t.id + '" aria-label="Editar">' + ico('editar') + '</button>' : '',
  };
};

/** Fila genérica para cosechas, trabajos y movimientos (toca para corregir). */
function filaRegistro(col, r, conNombre) {
  const m = DB.puede('montos');
  let ic, t, d, x = '';
  if (col === 'cosechas') {
    ic = 'canasta'; t = plural(r.cantidad, r.unidad) + ' de ' + nomC(r.cultivoId);
    d = fechaCorta(r.fecha) + (r.parcelaId ? ' · ' + nomP(r.parcelaId) : '') + (r.merma ? ' · merma ' + cant(r.merma) : '');
    if (m) x = soles(r.total);
  } else if (col === 'trabajos') {
    const md = MODALIDADES[r.modalidad] || MODALIDADES.jornal;
    ic = 'asistencia';
    t = r.labor + ' · ' + (r.modalidad === 'jornal' ? (Number(r.cantidad) === 0.5 ? 'medio día' : plural(r.cantidad, 'día')) : plural(r.cantidad, md.u, md.us));
    d = fechaCorta(r.fecha) + (r.parcelaId ? ' · ' + nomP(r.parcelaId) : '') + (r.horasExtra ? ' · ' + cant(r.horasExtra) + ' h extra' : '');
    if (m) x = soles(r.total);
  } else {
    ic = 'dinero'; t = (TIPOS_MOV[r.tipo] || {}).t || r.tipo; d = fechaCorta(r.fecha) + (r.nota ? ' · ' + r.nota : '') + (r.forma ? ' · ' + r.forma : '');
    if (m) x = ((TIPOS_MOV[r.tipo] || {}).signo > 0 ? '+' : '−') + soles(r.monto);
  }
  if (conNombre) { d = t + ' · ' + d; t = nomT(r.trabajadorId); }
  return '<div class="fila" data-act="editarReg" data-col="' + col + '" data-id="' + r.id + '">' + ico(ic) + '<div class="cuerpo-f"><div class="t">' + esc(t) + '</div><div class="d">' + esc(d) + '</div></div>' +
    (x ? '<div class="x"><div class="t">' + x + '</div></div>' : '') + '</div>';
}
ACC.editarReg = el => {
  const r = DB.get(el.dataset.col, el.dataset.id);
  if (!r) return;
  if (el.dataset.col === 'cosechas') formCosecha(r);
  else if (el.dataset.col === 'trabajos') formTrabajo(r);
  else formMovimiento(r);
};

/* ==========================================================================
   ASISTENCIA (TAREO)
   ========================================================================== */
let fechaTareo = HOY();
ACC.navTareo = el => { fechaTareo = el.dataset.valor || sumarDias(fechaTareo, +el.dataset.d); if (fechaTareo > HOY()) fechaTareo = HOY(); render(); };
VISTAS.tareo = () => {
  const m = DB.puede('montos');
  const regs = DB.deChacra('trabajos').filter(r => r.fecha === fechaTareo).sort((a, b) => nomT(a.trabajadorId).localeCompare(nomT(b.trabajadorId)));
  const cos = DB.deChacra('cosechas').filter(r => r.fecha === fechaTareo);
  const presentes = new Set([...regs, ...cos].map(r => r.trabajadorId)).size;
  let h = fechaNav('navTareo', fechaTareo);
  h += '<div class="kpis"><div class="kpi"><div class="l">Presentes</div><div class="v">' + presentes + '</div><div class="s">incluye cosecha</div></div>' +
    '<div class="kpi"><div class="l">Registros</div><div class="v">' + regs.length + '</div><div class="s">de trabajo</div></div>' +
    (m ? '<div class="kpi"><div class="l">Costo del día</div><div class="v">' + soles(sumar(regs, r => r.total)) + '</div><div class="s">sin cosecha</div></div>' : '') + '</div>';
  if (!regs.length) h += vacio('asistencia', 'No hay asistencia registrada para ' + fechaCorta(fechaTareo).toLowerCase(), '<p class="small">Toca <b>Marcar asistencia</b> para registrar a varios trabajadores a la vez.</p>');
  else h += '<div class="lista">' + regs.map(r => filaRegistro('trabajos', r, true)).join('') + '</div>';
  return { titulo: 'Asistencia', html: h, fab: { t: 'Marcar asistencia', icono: 'check', act: 'tareoNuevo' } };
};

function formTrabajo(r) {
  const nuevo = !r;
  if (!puedeOToast('tareo')) return;
  if (!nuevo) { const b = DB.bloqueo(r); if (b) { toast(b, 'error'); return; } }
  const m = DB.puede('montos');
  const ya = new Set(DB.deChacra('trabajos').filter(x => x.fecha === fechaTareo).map(x => x.trabajadorId));
  const trabs = trabajadoresChacra(!nuevo);
  if (!trabs.length) { toast('Primero registra trabajadores', 'error'); return; }
  const clave = v => 'tareo:' + v.modalidad + ':' + v.labor;
  const val = nuevo
    ? { fecha: fechaTareo, trabajadores: [], labor: laboresLista().includes('Deshierbo') ? 'Deshierbo' : laboresLista()[0], parcelaId: '', modalidad: 'jornal', jornada: '1', cantidad: 1, horasExtra: '', precioHora: DB.precio('horaExtra') }
    : Object.assign({}, r, { jornada: String(r.cantidad) === '0.5' ? '0.5' : '1' });
  if (nuevo) val.precio = DB.precio(clave(val));
  const campos = [
    nuevo
      ? { id: 'trabajadores', et: 'Trabajadores', tipo: 'multi', req: true, ops: trabs.map(t => ({ v: t.id, t: t.nombre + (ya.has(t.id) ? ' ✓' : '') })),
          ayuda: '✓ = ya tiene un registro ese día' }
      : { id: 'trabajadorId', et: 'Trabajador', tipo: 'select', req: true, ops: trabs.map(t => ({ v: t.id, t: t.nombre })) },
    nuevo ? { id: 'todos', tipo: 'html', html: '<button type="button" class="btn chico" data-todos>Seleccionar todos</button>' } : null,
    { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true, valida: v => v > HOY() ? 'No puede ser una fecha futura' : '' },
    { id: 'labor', et: 'Labor', tipo: 'select', req: true, ops: laboresLista(), par: true },
    { id: 'parcelaId', et: 'Parcela', tipo: 'select', ops: opsParcelas() },
    { id: 'modalidad', et: 'Forma de pago', tipo: 'seg', req: true, ops: Object.keys(MODALIDADES).map(k => ({ v: k, t: MODALIDADES[k].t })) },
    { id: 'jornada', et: 'Jornada', tipo: 'seg', ops: [{ v: '1', t: 'Día completo' }, { v: '0.5', t: 'Medio día' }], ver: v => v.modalidad === 'jornal' },
    { id: 'cantidad', et: 'Cantidad', tipo: 'num', req: true, min: 0.01, ver: v => v.modalidad !== 'jornal',
      ayuda: 'Cuántas cuadras o tareas hizo cada uno' },
    m ? { id: 'precio', et: 'Precio', tipo: 'num', req: true, min: 0, ayuda: 'Precio por día, cuadra o tarea. Se recuerda para la próxima vez.' } : null,
    { id: 'horasExtra', et: 'Horas extra', tipo: 'num', min: 0, max: 16, par: !!m },
    m ? { id: 'precioHora', et: 'Precio por hora extra', tipo: 'num', min: 0, ver: v => Number(v.horasExtra) > 0 } : null,
    { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Opcional' },
    m ? { id: 'total', tipo: 'calc', calc: v => {
      const x = DB.totalTrabajo(datosTrabajo(v));
      const n = nuevo ? (v.trabajadores || []).length : 1;
      return '<span>' + (n > 1 ? 'Total por trabajador' : 'Total') + '</span><b>' + soles(x) + '</b>';
    } } : null,
  ].filter(Boolean);
  const total0 = nuevo ? 0 : r.total;
  formulario({
    titulo: nuevo ? 'Marcar asistencia' : 'Corregir trabajo',
    valores: val, campos,
    aviso: nuevo ? '' : avisoPagado(r.trabajadorId, r.fecha),
    guardar: nuevo ? 'Registrar' : 'Guardar',
    alAbrir: (h, refrescar) => {
      const b = h.querySelector('[data-todos]');
      if (b) b.onclick = () => {
        const bs = $$('[data-c="trabajadores"] button', h);
        const todos = bs.every(x => x.classList.contains('on'));
        bs.forEach(x => x.classList.toggle('on', !todos));
        b.textContent = todos ? 'Seleccionar todos' : 'Quitar todos';
        refrescar('trabajadores');
      };
    },
    alCambiar: (v, origen, h) => {
      if (nuevo && m && (origen === 'modalidad' || origen === 'labor')) {
        const p = DB.precio(clave(v));
        const el = h.querySelector('[data-c="precio"]');
        if (el && p !== '') { el.value = p; v.precio = p; }
      }
    },
    eliminar: nuevo || !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar registro', 'Se quitará este trabajo de ' + esc(nomT(r.trabajadorId)) + ' y su pago (' + soles(r.total) + ').', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('trabajos', r.id, nomT(r.trabajadorId) + ': ' + r.labor + ' ' + fecha(r.fecha));
        trasEditarPago(r.trabajadorId, r.total, 0); cerrarTodas(); render();
      }
    },
    alGuardar: v => {
      if (!m) { v.precio = DB.precio(clave(v)) || 0; v.precioHora = DB.precio('horaExtra') || 0; }
      const camp = DB.campaniaActiva();
      if (nuevo) {
        for (const tid of v.trabajadores) {
          const d = datosTrabajo(v); d.trabajadorId = tid; d.campaniaId = camp ? camp.id : null; d.total = DB.totalTrabajo(d);
          DB.crear('trabajos', d, nomT(tid) + ': ' + d.labor + ' ' + fecha(d.fecha));
        }
        if (m) { DB.recordarPrecio(clave(v), v.precio); if (v.precioHora) DB.recordarPrecio('horaExtra', v.precioHora); }
        toast(v.trabajadores.length === 1 ? 'Asistencia registrada' : v.trabajadores.length + ' trabajadores registrados');
      } else {
        const d = datosTrabajo(v); d.trabajadorId = v.trabajadorId; d.total = DB.totalTrabajo(d);
        DB.editar('trabajos', r.id, d, nomT(d.trabajadorId) + ': ' + d.labor + ' ' + fecha(d.fecha));
        trasEditarPago(r.trabajadorId, total0, d.total);
        toast('Corregido');
      }
      fechaTareo = v.fecha;
      render();
    },
  });
}
function datosTrabajo(v) {
  return {
    fecha: v.fecha, labor: v.labor, parcelaId: v.parcelaId || '', modalidad: v.modalidad,
    cantidad: v.modalidad === 'jornal' ? Number(v.jornada || 1) : (Number(v.cantidad) || 0),
    precio: Number(v.precio) || 0, horasExtra: Number(v.horasExtra) || 0, precioHora: Number(v.horasExtra) > 0 ? (Number(v.precioHora) || 0) : 0, nota: v.nota || '',
  };
}
ACC.tareoNuevo = () => formTrabajo(null);

/* ==========================================================================
   COSECHA
   ========================================================================== */
const EC = { fecha: HOY(), parcelaId: '', cultivoId: '', unidad: '', precio: '', q: '' };
function prepararCosecha() {
  const ult = (DB.d.ultCosecha || {})[DB.chacraId];
  if (ult && !EC._cargado) { Object.assign(EC, ult); EC._cargado = DB.chacraId; }
  if (EC._cargado !== DB.chacraId) { Object.assign(EC, { parcelaId: '', cultivoId: '', unidad: '', precio: '' }, ult || {}); EC._cargado = DB.chacraId; }
  const cultivos = cultivosDeParcela(EC.parcelaId);
  if (!cultivos.find(c => c.id === EC.cultivoId)) EC.cultivoId = cultivos[0] ? cultivos[0].id : '';
  const cu = DB.get('cultivos', EC.cultivoId);
  const unidades = cu ? cu.unidadesCosecha : [];
  if (!unidades.includes(EC.unidad)) EC.unidad = unidades[0] || '';
  if (EC.precio === '' || EC.precio === undefined) EC.precio = DB.precio(claveCosecha());
}
function cultivosDeParcela(pid) {
  const act = cultivosActivos();
  const p = pid && DB.get('parcelas', pid);
  if (p && p.cultivos && p.cultivos.length) { const s = act.filter(c => p.cultivos.includes(c.id)); if (s.length) return s; }
  return act;
}
const claveCosecha = () => 'cosecha:' + EC.cultivoId + ':' + EC.unidad;
function guardarEC() {
  (DB.d.ultCosecha = DB.d.ultCosecha || {})[DB.chacraId] = { parcelaId: EC.parcelaId, cultivoId: EC.cultivoId, unidad: EC.unidad, precio: EC.precio };
  DB.guardar();
}
function regCosecha(tid) {
  return DB.deChacra('cosechas').find(r => r.trabajadorId === tid && r.fecha === EC.fecha && (r.parcelaId || '') === (EC.parcelaId || '') &&
    r.cultivoId === EC.cultivoId && r.unidad === EC.unidad && Number(r.precio) === (Number(EC.precio) || 0)) || null;
}
const totalDiaT = tid => DB.deChacra('cosechas').filter(r => r.trabajadorId === tid && r.fecha === EC.fecha && r.cultivoId === EC.cultivoId && r.unidad === EC.unidad);

VISTAS.cosecha = () => {
  prepararCosecha();
  const m = DB.puede('montos');
  const cu = DB.get('cultivos', EC.cultivoId);
  if (!cu) return { titulo: 'Cosecha', html: vacio('hoja', 'No hay cultivos activos.', DB.puede('config') ? '<a class="btn pri" href="#/cultivos">Activar cultivos</a>' : '') };
  const trabs = trabajadoresChacra();
  const delDia = DB.deChacra('cosechas').filter(r => r.fecha === EC.fecha && r.cultivoId === EC.cultivoId && r.unidad === EC.unidad);
  const u = EC.unidad;
  let h = fechaNav('navCosecha', EC.fecha);
  h += '<div class="card"><div class="cos-conf">' +
    '<div class="campo"><label class="et">Parcela</label><select class="inp" data-ec="parcelaId">' + opsParcelas().map(o => '<option value="' + o.v + '"' + (o.v === EC.parcelaId ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></div>' +
    '<div class="campo"><label class="et">Cultivo</label><select class="inp" data-ec="cultivoId">' + cultivosDeParcela(EC.parcelaId).map(c => '<option value="' + c.id + '"' + (c.id === EC.cultivoId ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</select></div>' +
    '<div class="campo"><label class="et">Unidad</label><select class="inp" data-ec="unidad">' + cu.unidadesCosecha.map(x => '<option' + (x === u ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
    (m ? '<div class="campo"><label class="et">Precio por ' + esc(u) + '</label><input class="inp" inputmode="decimal" data-ec="precio" value="' + esc(EC.precio) + '" placeholder="S/ 0.00"></div>'
      : '<div class="campo"><label class="et">Precio</label><div class="inp muted" style="display:flex;align-items:center">Lo pone el administrador</div></div>') +
    '</div></div>';
  h += '<div class="kpis"><div class="kpi hero"><div class="l">Total del día</div><div class="v">' + plural(sumar(delDia, r => r.cantidad), u) + '</div><div class="s">' + esc(cu.nombre) + ' · ' + new Set(delDia.map(r => r.trabajadorId)).size + ' cosechadores</div></div>' +
    (m ? '<div class="kpi"><div class="l">A pagar hoy</div><div class="v">' + soles(sumar(delDia, r => r.total)) + '</div><div class="s">merma: ' + cant(sumar(delDia, r => r.merma)) + '</div></div>' : '') + '</div>';
  const carEC = EC.parcelaId ? DB.carencia(EC.parcelaId) : null;
  if (carEC) h += '<div class="aviso tono-err">' + ico('alerta', 's') + '<div><b>' + esc(nomP(EC.parcelaId)) + ' está en periodo de carencia</b> hasta el ' + fecha(carEC.hasta) +
    ' (se aplicó ' + esc(carEC.aplicacion.producto) + ' el ' + fecha(carEC.aplicacion.fecha) + '). No se recomienda cosechar todavía.</div></div>';
  if (m && (EC.precio === '' || !(Number(EC.precio) > 0))) h += '<div class="aviso tono-warn">' + ico('alerta', 's') + '<div>Escribe el precio por ' + esc(u) + ' para calcular el pago.</div></div>';
  if (!trabs.length) h += vacio('personas', 'No hay trabajadores activos', DB.puede('trabajadores') ? '<button class="btn pri" data-act="trabNuevo">Registrar trabajador</button>' : '');
  else {
    h += '<div class="buscar">' + ico('buscar') + '<input class="inp" id="buscaCos" placeholder="Buscar cosechador" value="' + esc(EC.q) + '"></div>';
    h += '<div class="lista" id="listaCos">' + trabs.map(t => filaContador(t)).join('') + '</div>';
  }
  if (delDia.length || DB.deChacra('cosechas').some(r => r.fecha === EC.fecha)) {
    const todos = DB.deChacra('cosechas').filter(r => r.fecha === EC.fecha).sort((a, b) => nomT(a.trabajadorId).localeCompare(nomT(b.trabajadorId)));
    h += '<div class="grupo">Registros del día (toca para corregir)</div><div class="lista">' + todos.map(r => filaRegistro('cosechas', r, true)).join('') + '</div>';
  }
  return {
    titulo: 'Cosecha', html: h,
    despues: root => {
      $$('[data-ec]', root).forEach(el => el.addEventListener('change', () => {
        const k = el.dataset.ec;
        if (k === 'precio') { const n = num(el.value); if (isNaN(n) || n < 0) { toast('Precio no válido', 'error'); el.value = EC.precio; return; } EC.precio = n; DB.recordarPrecio(claveCosecha(), n); }
        else { EC[k] = el.value; if (k !== 'parcelaId') EC.precio = ''; if (k === 'cultivoId') EC.unidad = ''; prepararCosecha(); }
        guardarEC(); render();
      }));
      const b = $('#buscaCos', root);
      if (b) b.addEventListener('input', () => {
        EC.q = b.value; const q = b.value.toLowerCase();
        $$('#listaCos .cos-fila').forEach(f => f.classList.toggle('hidden', !!q && !f.dataset.n.includes(q)));
      });
      if (EC.q) b && b.dispatchEvent(new Event('input'));
    },
  };
};
ACC.navCosecha = el => { EC.fecha = el.dataset.valor || sumarDias(EC.fecha, +el.dataset.d); if (EC.fecha > HOY()) EC.fecha = HOY(); render(); };

function filaContador(t) {
  const r = regCosecha(t.id);
  const n = r ? r.cantidad : 0;
  const dia = totalDiaT(t.id);
  const tot = sumar(dia, x => x.cantidad);
  const sub = tot !== n ? 'Hoy: ' + plural(tot, EC.unidad) + ' (en otros precios o parcelas)' : (DB.puede('montos') && tot ? soles(sumar(dia, x => x.total)) : 'N° ' + (t.codigo || '—'));
  return '<div class="cos-fila" data-tid="' + t.id + '" data-n="' + esc(t.nombre.toLowerCase()) + '">' +
    '<div class="nom" data-act="contadorXL" data-tid="' + t.id + '"><div class="t">' + esc(t.nombre) + '</div><div class="d">' + esc(sub) + '</div></div>' +
    '<button class="bmenos" data-act="cosMenos" data-tid="' + t.id + '" aria-label="Quitar uno">−</button>' +
    '<div class="cnt" data-cnt="' + t.id + '">' + cant(n) + '</div>' +
    '<button class="bmas" data-act="cosMas" data-tid="' + t.id + '" aria-label="Sumar uno">+1</button></div>';
}

/** Suma o resta en el contador. Devuelve la nueva cantidad o null si no se pudo. */
async function cambiarCosecha(tid, delta, campo) {
  campo = campo || 'cantidad';
  if (!DB.puede('cosecha')) { toast('No tienes permiso', 'error'); return null; }
  if (!EC.cultivoId || !EC.unidad) { toast('Elige cultivo y unidad', 'error'); return null; }
  let r = regCosecha(tid);
  if (r) { const b = DB.bloqueo(r, true); if (b) { toast(b, 'error'); return null; } }
  if (!r && delta < 0) return 0;
  if (!r && campo === 'merma') { toast('Primero suma la cosecha', 'error'); return null; }
  if (!r) {
    const l = DB.periodoPagado(tid, DB.chacraId, EC.fecha);
    if (l && !(await confirmar('Semana ya pagada', 'Esta fecha está en una semana que ya se le pagó a ' + esc(nomT(tid)) + '. Lo que registres quedará como saldo pendiente. ¿Continuar?', { si: 'Continuar' }))) return null;
  }
  const camp = DB.campaniaActiva();
  if (!r) {
    const precio = DB.puede('montos') ? (Number(EC.precio) || 0) : (Number(DB.precio(claveCosecha())) || 0);
    if (!DB.puede('montos')) EC.precio = precio;
    r = DB.crear('cosechas', { fecha: EC.fecha, trabajadorId: tid, parcelaId: EC.parcelaId || '', cultivoId: EC.cultivoId, unidad: EC.unidad,
      cantidad: 0, merma: 0, pagarMerma: false, precio, total: 0, campaniaId: camp ? camp.id : null }, nomT(tid) + ': cosecha ' + fecha(EC.fecha));
  }
  const nuevo = Math.max(0, r2((Number(r[campo]) || 0) + delta));
  const cambios = { [campo]: nuevo };
  if (campo === 'cantidad' && (r.merma || 0) > nuevo) cambios.merma = nuevo;
  const tmp = Object.assign({}, r, cambios);
  cambios.total = DB.totalCosecha(tmp);
  if (campo === 'cantidad' && nuevo === 0) {
    DB.eliminar('cosechas', r.id, nomT(tid) + ': cosecha ' + fecha(EC.fecha) + ' quedó en 0');
  } else DB.editar('cosechas', r.id, cambios, '', true);
  return nuevo;
}
function refrescarFila(tid) {
  const f = $('.cos-fila[data-tid="' + tid + '"]');
  if (!f) return;
  const t = DB.get('trabajadores', tid);
  const tmp = document.createElement('div'); tmp.innerHTML = filaContador(t);
  const nf = tmp.firstChild;
  if (f.classList.contains('hidden')) nf.classList.add('hidden');
  f.replaceWith(nf);
}
ACC.cosMas = async el => { vibrar(); const n = await cambiarCosecha(el.dataset.tid, 1); if (n !== null) { refrescarFila(el.dataset.tid); refrescarTotalesCosecha(); } };
ACC.cosMenos = async el => { const n = await cambiarCosecha(el.dataset.tid, -1); if (n !== null) { refrescarFila(el.dataset.tid); refrescarTotalesCosecha(); } };
let _rtc;
function refrescarTotalesCosecha() { clearTimeout(_rtc); _rtc = setTimeout(() => { const y = window.scrollY; const a = document.activeElement && document.activeElement.id; render(); window.scrollTo(0, y); if (a) { const e = document.getElementById(a); e && e.focus(); } }, 1200); }

ACC.contadorXL = el => {
  const tid = el.dataset.tid, t = DB.get('trabajadores', tid);
  const m = DB.puede('montos');
  const pintar = () => {
    const r = regCosecha(tid);
    const n = r ? r.cantidad : 0, me = r ? r.merma || 0 : 0;
    h.querySelector('.n').textContent = cant(n);
    h.querySelector('[data-me]').textContent = cant(me);
    h.querySelector('[data-pago]').textContent = m ? soles(r ? r.total : 0) : '';
  };
  const h = abrirHoja(cabHoja(t.nombre) +
    '<div class="contador-xl"><div class="muted small">' + esc(nomC(EC.cultivoId)) + (EC.parcelaId ? ' · ' + esc(nomP(EC.parcelaId)) : '') + ' · ' + fechaCorta(EC.fecha) +
    (m ? ' · ' + soles(EC.precio) + ' por ' + esc(EC.unidad) : '') + '</div>' +
    '<div class="n">0</div><div class="muted">' + esc(pluralU(EC.unidad)) + '</div>' +
    '<button class="mas-xl" data-x="mas">+1 ' + esc(EC.unidad) + '</button>' +
    '<div class="btns" style="margin-top:10px"><button class="btn" data-x="menos">−1</button><button class="btn" data-x="escribir">' + ico('editar') + 'Escribir cantidad</button></div>' +
    '<div class="merma-box tono-err"><div style="text-align:left"><b>Merma / rechazo</b><div class="tiny">No se paga</div></div><div style="display:flex;align-items:center;gap:8px">' +
    '<button class="bmenos" data-x="mm">−</button><b class="cnt" data-me>0</b><button class="bmenos" data-x="mp">+</button></div></div>' +
    (m ? '<div class="calc" style="margin-top:12px"><span>Pago de este registro</span><b data-pago></b></div>' : '<span data-pago></span>') + '</div>',
    { alCerrar: () => render() });
  h.querySelector('[data-x=mas]').onclick = async () => { vibrar(); if (await cambiarCosecha(tid, 1) !== null) pintar(); };
  h.querySelector('[data-x=menos]').onclick = async () => { if (await cambiarCosecha(tid, -1) !== null) pintar(); };
  h.querySelector('[data-x=mp]').onclick = async () => { const r = regCosecha(tid); if (r && (r.merma || 0) >= r.cantidad) return toast('La merma no puede ser mayor que lo cosechado', 'error'); if (await cambiarCosecha(tid, 1, 'merma') !== null) pintar(); };
  h.querySelector('[data-x=mm]').onclick = async () => { if (await cambiarCosecha(tid, -1, 'merma') !== null) pintar(); };
  h.querySelector('[data-x=escribir]').onclick = () => {
    const r = regCosecha(tid);
    formulario({
      titulo: 'Cantidad de ' + t.nombre, valores: { n: r ? r.cantidad : '' },
      campos: [{ id: 'n', et: 'Cantidad (' + pluralU(EC.unidad) + ')', tipo: 'num', req: true, min: 0, foco: true }],
      alGuardar: async v => { const act = r ? r.cantidad : 0; if (await cambiarCosecha(tid, v.n - act) === null) return false; pintar(); },
    });
  };
  pintar();
};

function formCosecha(r) {
  const b = DB.bloqueo(r); if (b) { toast(b, 'error'); return; }
  const m = DB.puede('montos');
  const total0 = r.total;
  formulario({
    titulo: 'Corregir cosecha', valores: Object.assign({}, r), aviso: avisoPagado(r.trabajadorId, r.fecha),
    campos: [
      { id: 'trabajadorId', et: 'Trabajador', tipo: 'select', req: true, ops: trabajadoresChacra(true).map(t => ({ v: t.id, t: t.nombre })) },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true, par: true, valida: v => v > HOY() ? 'No puede ser una fecha futura' : '' },
      { id: 'parcelaId', et: 'Parcela', tipo: 'select', ops: opsParcelas() },
      { id: 'cultivoId', et: 'Cultivo', tipo: 'select', req: true, par: true, ops: () => DB.todos('cultivos').filter(c => c.activo || c.id === r.cultivoId).map(c => ({ v: c.id, t: c.nombre })) },
      { id: 'unidad', et: 'Unidad', tipo: 'select', req: true, ops: v => { const c = DB.get('cultivos', v.cultivoId); return c ? c.unidadesCosecha : []; } },
      { id: 'cantidad', et: 'Cantidad', tipo: 'num', req: true, min: 0, par: true },
      { id: 'merma', et: 'Merma / rechazo', tipo: 'num', min: 0, valida: (x, v) => x > v.cantidad ? 'No puede ser mayor que la cantidad' : '' },
      { id: 'pagarMerma', et: 'Pagar también la merma', tipo: 'chk', ver: v => Number(v.merma) > 0 },
      m ? { id: 'precio', et: 'Precio por unidad', tipo: 'num', req: true, min: 0 } : null,
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Opcional' },
      m ? { id: 'total', tipo: 'calc', calc: v => '<span>Total a pagar</span><b>' + soles(DB.totalCosecha(v)) + '</b>' } : null,
    ].filter(Boolean),
    eliminar: !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar cosecha', 'Se quitarán ' + plural(r.cantidad, r.unidad) + ' de ' + esc(nomT(r.trabajadorId)) + '.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('cosechas', r.id, nomT(r.trabajadorId) + ': ' + plural(r.cantidad, r.unidad) + ' ' + fecha(r.fecha));
        trasEditarPago(r.trabajadorId, total0, 0); cerrarTodas(); render();
      }
    },
    alGuardar: v => {
      const d = { trabajadorId: v.trabajadorId, fecha: v.fecha, parcelaId: v.parcelaId || '', cultivoId: v.cultivoId, unidad: v.unidad,
        cantidad: Number(v.cantidad) || 0, merma: Number(v.merma) || 0, pagarMerma: !!v.pagarMerma, precio: m ? Number(v.precio) || 0 : r.precio, nota: v.nota || '' };
      d.total = DB.totalCosecha(d);
      const res = nomT(d.trabajadorId) + ': ' + (r.cantidad !== d.cantidad ? cant(r.cantidad) + ' → ' : '') + plural(d.cantidad, d.unidad) + ' ' + fecha(d.fecha);
      DB.editar('cosechas', r.id, d, res);
      trasEditarPago(d.trabajadorId, total0, d.total);
      toast('Corregido'); render();
    },
  });
}
