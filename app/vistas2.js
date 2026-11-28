'use strict';
/* ==========================================================================
   MI-CHACRA · Pagos, contratas, configuración y seguridad
   ========================================================================== */

/* ==========================================================================
   PAGOS
   ========================================================================== */
let tabPagos = 'trabajadores';
VISTAS.pagos = () => {
  if (!DB.puede('montos')) return { titulo: 'Pagos', html: vacio('candado', 'No tienes acceso a los pagos') };
  let h = '<div class="chips-h">' + [['trabajadores', 'Trabajadores'], ['contratas', 'Contratas']].map(([k, t]) =>
    '<button class="' + (tabPagos === k ? 'on' : '') + '" data-act="tabPagos" data-t="' + k + '">' + t + '</button>').join('') + '</div>';
  if (tabPagos === 'contratas') { const v = VISTAS.contratas(); return Object.assign(v, { titulo: 'Pagos', atras: false, html: h + v.html }); }

  const sem = DB.semana(HOY());
  const filas = trabajadoresChacra(true).map(t => {
    const s = DB.saldo(t.id, DB.chacraId);
    const g = DB.ganancias(t.id, DB.chacraId, sem.desde, sem.hasta);
    return { t, s, sem: sumar(g.trabajos, r => r.total) + sumar(g.cosechas, r => r.total) };
  }).filter(x => x.s !== 0 || x.sem > 0 || x.t.activo !== false).sort((a, b) => b.s - a.s || a.t.nombre.localeCompare(b.t.nombre));
  const total = sumar(filas.filter(x => x.s > 0), x => x.s);
  h += '<div class="kpis"><div class="kpi hero"><div class="l">Total por pagar</div><div class="v">' + soles(total) + '</div><div class="s">' + filas.filter(x => x.s > 0).length + ' trabajadores con saldo</div></div>' +
    '<div class="kpi"><div class="l">Ganado esta semana</div><div class="v">' + soles(sumar(filas, x => x.sem)) + '</div><div class="s">' + fecha(sem.desde).slice(0, 5) + ' – ' + fecha(sem.hasta).slice(0, 5) + '</div></div></div>';
  if (!filas.length) h += vacio('billetera', 'Todavía no hay pagos que calcular');
  else h += '<div class="lista">' + filas.map(x =>
    '<a class="fila" href="#/liquidacion/' + x.t.id + '"><span class="avatar">' + esc(iniciales(x.t.nombre)) + '</span><div class="cuerpo-f"><div class="t">' + esc(x.t.nombre) + '</div>' +
    '<div class="d">Esta semana: ' + soles(x.sem) + '</div></div><div class="x">' +
    (x.s > 0 ? pill(soles(x.s), 'warn') : x.s < 0 ? pill(soles(x.s), 'info') : pill('Al día', 'ok')) + '</div></a>').join('') + '</div>';
  return { titulo: 'Pagos', html: h, fab: DB.puede('adelantos') ? { t: 'Adelanto', icono: 'mas', act: 'movNuevo' } : null };
};
ACC.tabPagos = el => { tabPagos = el.dataset.t; render(); };

/* ---------- Liquidación ---------- */
const EL = { periodo: 'semana', desde: '', hasta: '' };
function rangoPeriodo(p) {
  const hoy = HOY(), d = new Date(hoy + 'T12:00:00');
  const ini = fechaISO(new Date(d.getFullYear(), d.getMonth(), 1)), fin = fechaISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  if (p === 'semana') return DB.semana(hoy);
  if (p === 'pasada') return DB.semana(sumarDias(DB.semana(hoy).desde, -1));
  if (p === 'quincena') return d.getDate() <= 15 ? { desde: ini, hasta: sumarDias(ini, 14) } : { desde: sumarDias(ini, 15), hasta: fin };
  if (p === 'mes') return { desde: ini, hasta: fin };
  return { desde: EL.desde || DB.semana(hoy).desde, hasta: EL.hasta || hoy };
}
VISTAS.liquidacion = tid => {
  const t = DB.get('trabajadores', tid);
  if (!t) return { titulo: 'Liquidación', atras: true, html: vacio('usuario', 'Trabajador no encontrado') };
  if (!DB.puede('montos')) return { titulo: 'Liquidación', atras: true, html: vacio('candado', 'No tienes acceso a los pagos') };
  const rg = rangoPeriodo(EL.periodo);
  const L = DB.liquidacion(t.id, DB.chacraId, rg.desde, rg.hasta);
  let h = '<div class="chips-h">' + [['semana', 'Esta semana'], ['pasada', 'Semana pasada'], ['quincena', 'Quincena'], ['mes', 'Este mes'], ['otro', 'Elegir fechas']].map(([k, tx]) =>
    '<button class="' + (EL.periodo === k ? 'on' : '') + '" data-act="periodoLiq" data-p="' + k + '">' + tx + '</button>').join('') + '</div>';
  if (EL.periodo === 'otro') h += '<div class="fila2" style="margin-bottom:12px"><input class="inp" type="date" data-liq="desde" value="' + rg.desde + '"><input class="inp" type="date" data-liq="hasta" value="' + rg.hasta + '"></div>';

  // Resumen por tipo
  const cos = resumenCantidades(L.cosechas);
  const lineas = [];
  for (const c of cos) {
    const regs = L.cosechas.filter(r => nomC(r.cultivoId) === c.cultivo && r.unidad === c.unidad);
    lineas.push(['Cosecha ' + c.cultivo + ': ' + plural(sumar(regs, r => r.cantidad - (r.pagarMerma ? 0 : r.merma || 0)), c.unidad), sumar(regs, r => r.total)]);
  }
  for (const k of Object.keys(MODALIDADES)) {
    const regs = L.trabajos.filter(r => r.modalidad === k);
    if (!regs.length) continue;
    const md = MODALIDADES[k];
    lineas.push([(k === 'jornal' ? 'Jornales' : md.t) + ': ' + plural(sumar(regs, r => r.cantidad), md.u, md.us), sumar(regs, r => r.total - (r.horasExtra || 0) * (r.precioHora || 0))]);
  }
  const he = sumar(L.trabajos, r => r.horasExtra);
  if (he) lineas.push(['Horas extra: ' + cant(he), sumar(L.trabajos, r => (r.horasExtra || 0) * (r.precioHora || 0))]);

  h += '<div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="avatar">' + esc(iniciales(t.nombre)) + '</span><div><b>' + esc(t.nombre) + '</b>' +
    '<div class="small muted">Del ' + fecha(rg.desde) + ' al ' + fecha(rg.hasta) + '</div></div></div><table class="tabla">' +
    (L.anterior ? '<tr><td>Saldo anterior</td><td class="m">' + soles(L.anterior) + '</td></tr>' : '') +
    (lineas.length ? lineas.map(l => '<tr><td>' + esc(l[0]) + '</td><td class="m">' + soles(l[1]) + '</td></tr>').join('') : '<tr><td class="muted">Sin trabajo en este período</td><td class="m">' + soles(0) + '</td></tr>') +
    (L.bonos ? '<tr><td>Bonos / extras</td><td class="m">+' + soles(L.bonos) + '</td></tr>' : '') +
    (L.adelantos ? '<tr><td>Adelantos</td><td class="m">−' + soles(L.adelantos) + '</td></tr>' : '') +
    (L.descuentos ? '<tr><td>Descuentos</td><td class="m">−' + soles(L.descuentos) + '</td></tr>' : '') +
    (L.pagos ? '<tr><td>Pagado</td><td class="m">−' + soles(L.pagos) + '</td></tr>' : '') +
    '</table><div class="total-l"><span>' + (L.saldo >= 0 ? 'Saldo a pagar' : 'Saldo a favor de la chacra') + '</span><span class="num">' + soles(L.saldo) + '</span></div></div>';

  const pagada = DB.deChacra('liquidaciones').find(l => l.trabajadorId === t.id && l.desde === rg.desde && l.hasta === rg.hasta);
  if (pagada && Math.abs(L.saldo) < 0.005) h += '<div class="aviso tono-ok">' + ico('check', 's') + '<div>Pagado el ' + fecha(pagada.fechaPago) + ' (' + soles(pagada.pagado) + ').</div></div>';
  else if (pagada) h += '<div class="aviso tono-warn">' + ico('alerta', 's') + '<div>Se pagó ' + soles(pagada.pagado) + ' el ' + fecha(pagada.fechaPago) + ', pero hubo correcciones después. Queda una diferencia de ' + soles(L.saldo) + '.</div></div>';

  h += '<div class="btns" style="margin-bottom:10px">' +
    (DB.puede('pagos') ? '<button class="btn pri" data-act="pagar" data-t="' + t.id + '"' + (L.saldo <= 0 ? ' disabled style="opacity:.5"' : '') + '>' + ico('check') + 'Registrar pago</button>' : '') +
    '<button class="btn" data-act="boleta" data-t="' + t.id + '">' + ico('whatsapp') + 'Enviar boleta</button></div>';
  if (DB.puede('adelantos')) h += '<div class="btns" style="margin-bottom:12px"><button class="btn chico" data-act="movNuevo" data-t="' + t.id + '" data-tipo="adelanto">+ Adelanto</button>' +
    '<button class="btn chico" data-act="movNuevo" data-t="' + t.id + '" data-tipo="descuento">+ Descuento</button><button class="btn chico" data-act="movNuevo" data-t="' + t.id + '" data-tipo="bono">+ Bono</button></div>';

  const regs = [...L.cosechas.map(r => ({ r, col: 'cosechas' })), ...L.trabajos.map(r => ({ r, col: 'trabajos' })), ...L.movs.map(r => ({ r, col: 'movimientos' }))]
    .sort((a, b) => (a.r.fecha || '').localeCompare(b.r.fecha || '') || a.r.creado - b.r.creado);
  h += '<div class="grupo">Detalle día por día</div>' + (regs.length ? '<div class="lista">' + regs.map(x => filaRegistro(x.col, x.r)).join('') + '</div>' : vacio('calendario', 'Sin registros en este período'));

  const hist = DB.deChacra('liquidaciones').filter(l => l.trabajadorId === t.id).sort((a, b) => b.hasta.localeCompare(a.hasta));
  if (hist.length) h += '<div class="grupo">Pagos anteriores</div><div class="lista">' + hist.map(l =>
    '<div class="fila">' + ico('boleta') + '<div class="cuerpo-f"><div class="t">' + fecha(l.desde) + ' – ' + fecha(l.hasta) + '</div><div class="d">Pagado el ' + fecha(l.fechaPago) + (l.forma ? ' · ' + esc(l.forma) : '') + '</div></div>' +
    '<div class="x"><div class="t">' + soles(l.pagado) + '</div></div></div>').join('') + '</div>';

  return {
    titulo: 'Liquidación', atras: true, html: h,
    despues: root => $$('[data-liq]', root).forEach(el => el.addEventListener('change', () => { EL[el.dataset.liq] = el.value; render(); })),
  };
};
ACC.periodoLiq = el => { EL.periodo = el.dataset.p; if (EL.periodo === 'otro' && !EL.desde) { const s = DB.semana(HOY()); EL.desde = s.desde; EL.hasta = HOY(); } render(); };

ACC.pagar = el => {
  if (!puedeOToast('pagos')) return;
  const t = DB.get('trabajadores', el.dataset.t);
  const rg = rangoPeriodo(EL.periodo);
  const L = DB.liquidacion(t.id, DB.chacraId, rg.desde, rg.hasta);
  formulario({
    titulo: 'Pagar a ' + t.nombre,
    valores: { monto: L.saldo, forma: 'Efectivo', fechaPago: HOY() },
    campos: [
      { id: 'info', tipo: 'html', html: '<div class="calc"><span>Saldo del ' + fecha(rg.desde).slice(0, 5) + ' al ' + fecha(rg.hasta).slice(0, 5) + '</span><b>' + soles(L.saldo) + '</b></div>' },
      { id: 'monto', et: 'Monto pagado (S/)', tipo: 'num', req: true, min: 0.01, ayuda: 'Si pagas menos, la diferencia queda pendiente.' },
      { id: 'forma', et: 'Forma de pago', tipo: 'seg', ops: ['Efectivo', 'Yape', 'Plin', 'Transferencia'] },
      { id: 'fechaPago', et: 'Fecha de pago', tipo: 'fecha', req: true },
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Opcional' },
    ],
    guardar: 'Confirmar pago',
    alGuardar: v => {
      // El pago se asienta dentro del período para que la liquidación cuadre; la fecha real queda guardada.
      const f = v.fechaPago > rg.hasta ? rg.hasta : (v.fechaPago < rg.desde ? rg.desde : v.fechaPago);
      const liq = DB.crear('liquidaciones', { trabajadorId: t.id, desde: rg.desde, hasta: rg.hasta, anterior: L.anterior, ganado: L.ganado, bonos: L.bonos,
        adelantos: L.adelantos, descuentos: L.descuentos, saldoAntes: L.saldo, pagado: v.monto, fechaPago: v.fechaPago, forma: v.forma }, 'Liquidación de ' + t.nombre + ' del ' + fecha(rg.desde) + ' al ' + fecha(rg.hasta));
      DB.crear('movimientos', { trabajadorId: t.id, tipo: 'pago', monto: v.monto, fecha: f, fechaReal: v.fechaPago, forma: v.forma, nota: v.nota || '', liquidacionId: liq.id },
        'Pago a ' + t.nombre + ': ' + soles(v.monto));
      toast('Pago registrado');
      render();
      if (t.celular) setTimeout(async () => {
        if (await confirmar('¿Enviar boleta?', 'Envía a ' + esc(t.nombre) + ' el detalle de su pago por WhatsApp.', { si: 'Enviar' })) abrirExterno(enlaceWhatsApp(t.celular, textoBoleta(t, rg, true)));
      }, 300);
    },
  });
};

function textoBoleta(t, rg, pagado) {
  const L = DB.liquidacion(t.id, DB.chacraId, rg.desde, rg.hasta);
  const ch = DB.get('chacras', DB.chacraId);
  const ln = ['*MI-CHACRA · ' + (ch ? ch.nombre : '') + '*', 'Boleta de ' + t.nombre + (t.codigo ? ' (N° ' + t.codigo + ')' : ''), 'Del ' + fecha(rg.desde) + ' al ' + fecha(rg.hasta), ''];
  if (L.anterior) ln.push('Saldo anterior: ' + soles(L.anterior));
  for (const c of resumenCantidades(L.cosechas)) {
    const regs = L.cosechas.filter(r => nomC(r.cultivoId) === c.cultivo && r.unidad === c.unidad);
    const pagadas = sumar(regs, r => r.cantidad - (r.pagarMerma ? 0 : r.merma || 0));
    const merma = sumar(regs, r => r.merma);
    ln.push('Cosecha ' + c.cultivo + ': ' + plural(pagadas, c.unidad) + (merma ? ' (+' + cant(merma) + ' de merma)' : '') + ' — ' + soles(sumar(regs, r => r.total)));
  }
  for (const k of Object.keys(MODALIDADES)) {
    const regs = L.trabajos.filter(r => r.modalidad === k);
    if (regs.length) ln.push((k === 'jornal' ? 'Jornales' : MODALIDADES[k].t) + ': ' + plural(sumar(regs, r => r.cantidad), MODALIDADES[k].u, MODALIDADES[k].us) + ' — ' + soles(sumar(regs, r => r.total)));
  }
  if (L.bonos) ln.push('Bonos: +' + soles(L.bonos));
  if (L.adelantos) ln.push('Adelantos: −' + soles(L.adelantos));
  if (L.descuentos) ln.push('Descuentos: −' + soles(L.descuentos));
  if (L.pagos) ln.push('Pagado: −' + soles(L.pagos));
  ln.push('', '*' + (pagado && Math.abs(L.saldo) < 0.005 ? 'Pagado. Saldo: ' + soles(0) : 'Saldo a pagar: ' + soles(L.saldo)) + '*');
  return ln.join('\n');
}
ACC.boleta = el => {
  const t = DB.get('trabajadores', el.dataset.t);
  const txt = textoBoleta(t, rangoPeriodo(EL.periodo));
  if (t.celular) abrirExterno(enlaceWhatsApp(t.celular, txt)); else compartirTexto(txt);
};

/* ---------- Adelantos, descuentos y bonos ---------- */
function formMovimiento(r, preset) {
  const nuevo = !r;
  const esPago = r && r.tipo === 'pago';
  if (!puedeOToast(esPago ? 'pagos' : 'adelantos')) return;
  if (!nuevo) { const b = DB.bloqueo(r); if (b) { toast(b, 'error'); return; } }
  const trabs = trabajadoresChacra(!nuevo);
  if (!trabs.length) { toast('Primero registra trabajadores', 'error'); return; }
  preset = preset || {};
  const monto0 = r ? r.monto : 0;
  formulario({
    titulo: nuevo ? 'Nuevo ' + ((TIPOS_MOV[preset.tipo] || TIPOS_MOV.adelanto).t.toLowerCase()) : 'Corregir ' + TIPOS_MOV[r.tipo].t.toLowerCase(),
    valores: nuevo ? { trabajadorId: preset.trabajadorId || '', tipo: preset.tipo || 'adelanto', fecha: HOY() } : Object.assign({}, r),
    campos: [
      { id: 'trabajadorId', et: 'Trabajador', tipo: 'select', req: true, ph: 'Elige un trabajador', ops: trabs.map(t => ({ v: t.id, t: t.nombre })) },
      esPago ? null : { id: 'tipo', et: 'Tipo', tipo: 'seg', req: true, ops: ['adelanto', 'descuento', 'bono'].map(k => ({ v: k, t: TIPOS_MOV[k].t })) },
      { id: 'monto', et: 'Monto (S/)', tipo: 'num', req: true, min: 0.01, par: true, foco: nuevo },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      { id: 'forma', et: 'Forma', tipo: 'seg', ops: ['Efectivo', 'Yape', 'Plin', 'Transferencia'], ver: v => v.tipo !== 'descuento' && v.tipo !== 'bono' },
      { id: 'nota', et: 'Motivo / nota', tipo: 'texto', ph: 'Ej. para medicinas' },
      { id: 'saldo', tipo: 'html', html: v => v.trabajadorId ? '<div class="small muted">Saldo actual de ' + esc(nomT(v.trabajadorId)) + ': <b>' + soles(DB.saldo(v.trabajadorId, DB.chacraId)) + '</b></div>' : '' },
    ].filter(Boolean),
    aviso: nuevo ? '' : (esPago ? 'Corregir un pago cambia el saldo del trabajador.' : ''),
    eliminar: nuevo || !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar ' + TIPOS_MOV[r.tipo].t.toLowerCase(), 'Se quitará ' + soles(r.monto) + ' de ' + esc(nomT(r.trabajadorId)) + '.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('movimientos', r.id, TIPOS_MOV[r.tipo].t + ' de ' + nomT(r.trabajadorId) + ': ' + soles(r.monto));
        if (r.liquidacionId) DB.eliminar('liquidaciones', r.liquidacionId, 'Pago anulado');
        cerrarTodas(); render();
      }
    },
    alGuardar: v => {
      const d = { trabajadorId: v.trabajadorId, tipo: esPago ? 'pago' : v.tipo, monto: v.monto, fecha: v.fecha, forma: v.forma || '', nota: v.nota || '' };
      const tx = TIPOS_MOV[d.tipo].t + ' de ' + nomT(d.trabajadorId) + ': ' + (nuevo || monto0 === d.monto ? '' : soles(monto0) + ' → ') + soles(d.monto);
      if (nuevo) DB.crear('movimientos', d, tx); else {
        DB.editar('movimientos', r.id, d, tx);
        if (r.liquidacionId) DB.editar('liquidaciones', r.liquidacionId, { pagado: d.monto }, '', true);
      }
      toast(nuevo ? TIPOS_MOV[d.tipo].t + ' registrado' : 'Corregido');
      render();
    },
  });
}
ACC.movNuevo = el => formMovimiento(null, { trabajadorId: el.dataset && el.dataset.t, tipo: el.dataset && el.dataset.tipo });

/* ==========================================================================
   CONTRATAS
   ========================================================================== */
VISTAS.contratas = () => {
  const m = DB.puede('montos');
  const cs = DB.deChacra('contratas').sort((a, b) => (a.estado === 'terminada') - (b.estado === 'terminada') || (b.inicio || '').localeCompare(a.inicio || ''));
  let h = '';
  if (!cs.length) h += vacio('contrata', 'No hay contratas', '<p class="small">Una contrata es un trabajo completo por un monto acordado con un contratista o cuadrilla.</p>');
  else h += '<div class="lista">' + cs.map(c => {
    const pag = DB.pagadoContrata(c);
    return '<a class="fila" href="#/contrata/' + c.id + '">' + ico('contrata') + '<div class="cuerpo-f"><div class="t">' + esc(c.contratista) + ' ' + (c.estado === 'terminada' ? pill('Terminada', 'ok') : '') + '</div>' +
      '<div class="d">' + esc(c.labor) + (c.parcelaId ? ' · ' + esc(nomP(c.parcelaId)) : '') + ' · ' + (c.avance || 0) + '%</div><div class="barra" style="margin-top:6px"><i style="width:' + (c.avance || 0) + '%"></i></div></div>' +
      (m ? '<div class="x"><div class="t">' + soles(c.monto - pag) + '</div><div class="d">de ' + soles(c.monto) + '</div></div>' : '') + '</a>';
  }).join('') + '</div>';
  return { titulo: 'Contratas', atras: true, html: h, fab: DB.puede('contratas') ? { t: 'Nueva contrata', icono: 'mas', act: 'contrataNueva' } : null };
};

function formContrata(c) {
  if (!puedeOToast('contratas')) return;
  const nuevo = !c;
  if (!nuevo) { const b = DB.bloqueo(c); if (b) { toast(b, 'error'); return; } }
  formulario({
    titulo: nuevo ? 'Nueva contrata' : 'Editar contrata',
    valores: nuevo ? { inicio: HOY(), avance: 0, estado: 'curso', unidadC: 'cuadras', labor: 'Deshierbo' } : Object.assign({}, c),
    campos: [
      { id: 'contratista', et: 'Contratista o cuadrilla', tipo: 'texto', req: true, foco: nuevo, ph: 'Nombre del responsable' },
      { id: 'celular', et: 'Celular', tipo: 'tel', par: true },
      { id: 'doc', et: 'DNI o RUC', tipo: 'texto', valida: v => /^(\d{8}|\d{11})$/.test(v) ? '' : 'DNI de 8 o RUC de 11 dígitos' },
      { id: 'labor', et: 'Labor', tipo: 'select', req: true, ops: laboresLista(), par: true },
      { id: 'parcelaId', et: 'Parcela', tipo: 'select', ops: opsParcelas() },
      { id: 'cantidad', et: 'Cantidad de trabajo', tipo: 'num', min: 0, par: true },
      { id: 'unidadC', et: 'Medida', tipo: 'select', ops: ['cuadras', 'tareas', 'plantas', 'metros', 'global'] },
      { id: 'monto', et: 'Monto acordado (S/)', tipo: 'num', req: true, min: 0.01 },
      { id: 'inicio', et: 'Inicio', tipo: 'fecha', req: true, par: true },
      { id: 'fin', et: 'Fin estimado', tipo: 'fecha', valida: (v, x) => v && x.inicio && v < x.inicio ? 'El fin no puede ser antes del inicio' : '' },
      { id: 'avance', et: 'Avance (%)', tipo: 'num', min: 0, max: 100 },
      { id: 'estado', et: 'Estado', tipo: 'seg', ops: [{ v: 'curso', t: 'En curso' }, { v: 'terminada', t: 'Terminada' }] },
      { id: 'nota', et: 'Detalle del acuerdo', tipo: 'area', ph: 'Qué incluye, condiciones, etc.' },
    ],
    eliminar: nuevo || !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar contrata', 'Se moverá a la papelera junto con su historial.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('contratas', c.id, 'Contrata de ' + c.contratista); cerrarTodas(); ir('contratas');
      }
    },
    alGuardar: v => {
      v.avance = Number(v.avance) || 0;
      if (v.estado === 'terminada' && v.avance < 100) v.avance = 100;
      if (nuevo) { const camp = DB.campaniaActiva(); v.campaniaId = camp ? camp.id : null; const r = DB.crear('contratas', v, 'Contrata: ' + v.contratista + ' · ' + v.labor + ' · ' + soles(v.monto)); ir('contrata/' + r.id); }
      else { DB.editar('contratas', c.id, v, 'Contrata de ' + v.contratista); render(); }
      toast('Contrata guardada');
    },
  });
}
ACC.contrataNueva = () => formContrata(null);
ACC.contrataEditar = el => formContrata(DB.get('contratas', el.dataset.id));

VISTAS.contrata = id => {
  const c = DB.get('contratas', id);
  if (!c || c.eliminado) return { titulo: 'Contrata', atras: true, html: vacio('contrata', 'No existe') };
  const m = DB.puede('montos');
  const movs = DB.deChacra('movimientos').filter(x => x.contrataId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pag = DB.pagadoContrata(c);
  let h = '<div class="card"><h2>' + esc(c.contratista) + '</h2><div class="muted small">' + esc(c.labor) + (c.parcelaId ? ' · ' + esc(nomP(c.parcelaId)) : '') +
    (c.cantidad ? ' · ' + cant(c.cantidad) + ' ' + esc(c.unidadC || '') : '') + '</div>' +
    '<div style="margin:12px 0 6px;display:flex;justify-content:space-between;font-size:14px"><span>Avance</span><b>' + (c.avance || 0) + '%</b></div><div class="barra"><i style="width:' + (c.avance || 0) + '%"></i></div>' +
    '<table class="tabla" style="margin-top:12px"><tr><td class="muted">Inicio</td><td class="m">' + fecha(c.inicio) + '</td></tr>' +
    (c.fin ? '<tr><td class="muted">Fin estimado</td><td class="m">' + fecha(c.fin) + '</td></tr>' : '') +
    (c.doc ? '<tr><td class="muted">DNI / RUC</td><td class="m">' + esc(c.doc) + '</td></tr>' : '') +
    (c.nota ? '<tr><td class="muted">Acuerdo</td><td class="m" style="white-space:normal">' + esc(c.nota) + '</td></tr>' : '') + '</table>' +
    (c.celular ? '<div class="btns" style="margin-top:12px"><button class="btn" data-act="llamar" data-cel="' + esc(c.celular) + '">' + ico('telefono') + 'Llamar</button><button class="btn tono-ok" data-act="whatsapp" data-cel="' + esc(c.celular) + '">' + ico('whatsapp') + 'WhatsApp</button></div>' : '') + '</div>';
  if (m) {
    h += '<div class="kpis"><div class="kpi"><div class="l">Acordado</div><div class="v">' + soles(c.monto) + '</div></div><div class="kpi"><div class="l">Pagado</div><div class="v">' + soles(pag) + '</div></div>' +
      '<div class="kpi ' + (c.monto - pag > 0 ? 'tono-warn' : 'tono-ok') + '"><div class="l">Saldo</div><div class="v">' + soles(c.monto - pag) + '</div></div></div>';
    if (DB.puede('adelantos')) h += '<div class="btns" style="margin-bottom:12px"><button class="btn" data-act="contrataMov" data-id="' + c.id + '" data-tipo="adelanto">+ Adelanto</button>' +
      (DB.puede('pagos') ? '<button class="btn pri" data-act="contrataMov" data-id="' + c.id + '" data-tipo="pago">Registrar pago</button>' : '') + '</div>';
    h += '<div class="grupo">Pagos a la contrata</div>' + (movs.length ? '<div class="lista">' + movs.map(x =>
      '<div class="fila" data-act="contrataMov" data-id="' + c.id + '" data-mov="' + x.id + '">' + ico('dinero') + '<div class="cuerpo-f"><div class="t">' + esc(TIPOS_MOV[x.tipo].t) + '</div><div class="d">' + fecha(x.fecha) + (x.forma ? ' · ' + esc(x.forma) : '') + (x.nota ? ' · ' + esc(x.nota) : '') + '</div></div>' +
      '<div class="x"><div class="t">' + soles(x.monto) + '</div></div></div>').join('') + '</div>' : vacio('dinero', 'Aún no hay pagos'));
  }
  return { titulo: 'Contrata', atras: true, html: h, acciones: DB.puede('contratas') ? '<button class="icon-btn" data-act="contrataEditar" data-id="' + c.id + '" aria-label="Editar">' + ico('editar') + '</button>' : '' };
};
ACC.contrataMov = el => {
  const c = DB.get('contratas', el.dataset.id);
  const r = el.dataset.mov ? DB.get('movimientos', el.dataset.mov) : null;
  const tipo = r ? r.tipo : el.dataset.tipo;
  if (!puedeOToast(tipo === 'pago' ? 'pagos' : 'adelantos')) return;
  if (r) { const b = DB.bloqueo(r); if (b) return toast(b, 'error'); }
  const saldo = r2(c.monto - DB.pagadoContrata(c));
  formulario({
    titulo: (r ? 'Corregir ' : '') + TIPOS_MOV[tipo].t + ' · ' + c.contratista,
    valores: r ? Object.assign({}, r) : { monto: tipo === 'pago' ? saldo : '', fecha: HOY(), forma: 'Efectivo' },
    campos: [
      { id: 'monto', et: 'Monto (S/)', tipo: 'num', req: true, min: 0.01, foco: !r, ayuda: 'Saldo de la contrata: ' + soles(saldo) },
      { id: 'fecha', et: 'Fecha', tipo: 'fecha', req: true },
      { id: 'forma', et: 'Forma', tipo: 'seg', ops: ['Efectivo', 'Yape', 'Plin', 'Transferencia'] },
      { id: 'nota', et: 'Nota', tipo: 'texto', ph: 'Opcional' },
    ],
    eliminar: r && DB.puede('eliminar') ? async () => {
      if (await confirmar('Eliminar pago', 'Se quitará ' + soles(r.monto) + ' de la contrata.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('movimientos', r.id, TIPOS_MOV[r.tipo].t + ' a contrata ' + c.contratista + ': ' + soles(r.monto)); cerrarTodas(); render();
      }
    } : null,
    alGuardar: v => {
      const d = { contrataId: c.id, tipo, monto: v.monto, fecha: v.fecha, forma: v.forma || '', nota: v.nota || '' };
      const tx = TIPOS_MOV[tipo].t + ' a contrata ' + c.contratista + ': ' + soles(v.monto);
      if (r) DB.editar('movimientos', r.id, d, tx); else DB.crear('movimientos', d, tx);
      toast('Guardado'); render();
    },
  });
};

/* ==========================================================================
   MÁS
   ========================================================================== */
VISTAS.mas = () => {
  const u = DB.usuario, rol = DB.rol();
  const fila = (ruta, icono, t, d) => '<a class="fila" href="#/' + ruta + '">' + ico(icono) + '<div class="cuerpo-f"><div class="t">' + t + '</div>' + (d ? '<div class="d">' + d + '</div>' : '') + '</div>' + ico('der', 's') + '</a>';
  let h = '<div class="card" style="display:flex;align-items:center;gap:12px"><span class="avatar">' + esc(iniciales(u.nombre)) + '</span><div style="flex:1"><b>' + esc(u.nombre) + '</b>' +
    '<div class="small muted">' + (u.dueno ? 'Dueño · ' : '') + esc((ROLES[rol] || {}).t || '') + '</div></div><button class="btn chico" data-act="salir">' + ico('cambiar', 's') + 'Cambiar</button></div>';
  h += '<div class="grupo">Gestión</div><div class="lista">' +
    fila('trabajadores', 'personas', 'Trabajadores', 'Registro, celular y ficha de cada uno') +
    (DB.puede('contratas') ? fila('contratas', 'contrata', 'Contratas', 'Trabajos por monto acordado') : '') +
    fila('parcelas', 'mapa', 'Parcelas', 'Lotes, cuadras y cultivos') +
    (DB.puede('campo') ? fila('abonos', 'hoja', 'Abonos y químicos', 'Aplicaciones, plan de abonamiento y carencia') +
      fila('inventario', 'canasta', 'Almacén', 'Stock de insumos, herramientas y combustible') : '') +
    (DB.rol() !== 'operario' ? fila('calendario', 'calendario', 'Calendario', 'Lo que toca hoy, esta semana y el mes') : '') +
    fila('campanias', 'bandera', 'Campañas', 'Abrir, cerrar y cambiar de campaña') +
    (DB.puede('reportes') ? fila('reportes', 'alerta', 'Reportes de trabajadores', (() => { const n = DB.deChacra('reportes').filter(r => r.estado === 'pendiente').length; return n ? n + ' pendiente(s)' : 'Errores que avisan los trabajadores'; })()) : '') + '</div>';
  if (DB.puede('finanzas')) {
    h += '<div class="grupo">Ventas y finanzas</div><div class="lista">' +
      fila('ganancia', 'bandera', 'Ganancia de la campaña', 'Ingresos − costos, por parcela y comparada') +
      fila('cuentas', 'billetera', 'Cuentas por cobrar y pagar', 'Quién te debe y a quién debes') +
      fila('caja', 'dinero', 'Flujo de caja', 'Dinero que entró y salió de verdad') +
      fila('ventas', 'dinero', 'Ventas de cosecha', 'Café seco por kilo, húmedo por lata…') +
      fila('clientes', 'personas', 'Clientes', 'Compradores y lo que te deben') +
      fila('gastos', 'boleta', 'Gastos', 'Abonos, químicos, flete, combustible…') +
      fila('inversiones', 'semilla', 'Inversiones', 'Plantones, riego, maquinaria') +
      fila('ingresos', 'dinero', 'Otros ingresos', 'Alquileres, subsidios…') + '</div>';
  }
  if (DB.puede('config') || DB.puede('usuarios')) {
    h += '<div class="grupo">Configuración</div><div class="lista">' +
      (DB.puede('config') ? fila('chacras', 'ubicacion', 'Chacras', 'Cada chacra con sus cuentas separadas') +
        fila('cultivos', 'hoja', 'Cultivos', 'Café, plátano y los que quieras agregar') +
        fila('labores', 'herramienta', 'Labores', 'Deshierbo, poda, abonamiento…') : '') +
      (DB.puede('usuarios') ? fila('usuarios', 'escudo', 'Usuarios y permisos', 'Quién entra y qué puede hacer') : '') +
      fila('ajustes', 'ajustes', 'Ajustes', 'Tema, semana de pago, PIN') + '</div>';
  }
  h += '<div class="grupo">Mercado</div><div class="lista">' + fila('tienda', 'tienda', 'Mercado', 'Tiendas de la zona: abonos, químicos, semillas y herramientas') +
    fila('mispedidos', 'boleta', 'Mis pedidos', (DB.d.misPedidos || []).filter(p => !['entregado', 'cancelado'].includes(p.estado)).length + ' en curso') +
    (rolTienda() ? '<div class="fila" data-act="modoTienda">' + ico('tienda') + '<div class="cuerpo-f"><div class="t">Modo tienda</div><div class="d">' +
      esc(nombreTienda()) + ': pedidos, productos y ofertas</div></div>' + ico('der', 's') + '</div>'
      : DB.puede('config') ? '<div class="fila" data-act="quieroVender">' + ico('tienda') + '<div class="cuerpo-f"><div class="t">Quiero vender</div><div class="d">Inscribe tu tienda en el mercado · 30 días gratis</div></div>' + ico('der', 's') + '</div>' : '') +
    (DB.d.esAdmin ? fila('admin', 'escudo', 'Administrar plataforma', 'Tiendas, pagos, denuncias y uso') : '') + '</div>';
  h += '<div class="grupo">Informes</div><div class="lista">' + fila('informes', 'excel', 'Informes en Excel y PDF', 'Planilla, productividad, cosecha, ventas, químicos…') + '</div>';
  h += '<div class="grupo">Seguridad</div><div class="lista">' +
    (DB.puede('config') ? fila('nube', 'nube_ok', 'Mi cuenta y nube', NUBE.activa() ? (NUBE.esV2() ? esc(CUENTA.email()) + ' · ' : 'Conectada · ') + (NUBE.pendientes() ? NUBE.pendientes() + ' por subir' : 'al día') : 'Entra con tu cuenta para guardar tus datos') : '') +
    (DB.puede('historial') ? fila('historial', 'historial', 'Historial de cambios', 'Quién registró o corrigió qué') : '') +
    (DB.puede('papelera') ? fila('papelera', 'borrar', 'Papelera', 'Recupera lo eliminado (' + DIAS_PAPELERA + ' días)') : '') +
    (DB.puede('config') ? fila('respaldo', 'descargar', 'Copia de seguridad', 'Guardar o recuperar todos los datos') : '') + '</div>';
  h += '<p class="center tiny faint" style="margin-top:20px">MI-CHACRA ' + esc(window.VERSION || '') + ' · Etapa 4<br>Hecho para CHINCARMAS S.A.C. · Villa Rica</p>';
  return { titulo: 'Más', html: h };
};

/* ---------- Chacras ---------- */
VISTAS.chacras = () => {
  const cs = DB.chacrasVisibles();
  let h = '<div class="lista">' + cs.map(c => {
    const n = DB.todos('trabajadores').filter(t => (t.chacras || []).includes(c.id) && t.activo !== false).length;
    const camp = DB.campaniaActiva(c.id);
    return '<div class="fila" data-act="chacraEditar" data-id="' + c.id + '">' + ico('ubicacion') + '<div class="cuerpo-f"><div class="t">' + esc(c.nombre) + (c.id === DB.chacraId ? ' ' + pill('Seleccionada', 'ok') : '') + '</div>' +
      '<div class="d">' + esc(c.ubicacion || '') + (c.cuadras ? ' · ' + cant(c.cuadras) + ' cuadras' : '') + ' · ' + n + ' trabajadores' + (camp ? ' · ' + esc(camp.nombre) : '') + '</div></div>' + ico('editar', 's') + '</div>';
  }).join('') + '</div>';
  h += '<p class="small muted">Cada chacra lleva sus cuentas totalmente separadas: trabajadores, cosecha, pagos y campañas.</p>';
  return { titulo: 'Chacras', atras: true, html: h, fab: DB.usuario.dueno ? { t: 'Nueva chacra', icono: 'mas', act: 'chacraNueva' } : null };
};
function formChacra(c) {
  if (!c && !DB.usuario.dueno) return toast('Solo el dueño puede crear chacras', 'error');
  const nuevo = !c;
  formulario({
    titulo: nuevo ? 'Nueva chacra' : 'Editar chacra',
    valores: nuevo ? { ubicacion: 'Villa Rica', campania: 'Campaña ' + new Date().getFullYear() } : Object.assign({}, c),
    campos: [
      { id: 'nombre', et: 'Nombre de la chacra', tipo: 'texto', req: true, foco: nuevo, ph: 'Chacra de Mamá' },
      { id: 'dueno', et: 'Dueño', tipo: 'texto', ph: 'Nombre del dueño' },
      { id: 'ubicacion', et: 'Ubicación / sector', tipo: 'texto', par: true },
      { id: 'cuadras', et: 'Área total (cuadras)', tipo: 'num', min: 0, ayuda: '1 cuadra = 10,000 m² (1 ha)' },
      nuevo ? { id: 'campania', et: 'Primera campaña', tipo: 'texto', req: true } : null,
      { id: 'nota', et: 'Notas', tipo: 'area' },
    ].filter(Boolean),
    eliminar: nuevo || !DB.usuario.dueno ? null : async () => {
      if (DB.todos('chacras').length < 2) return toast('Debe quedar al menos una chacra', 'error');
      if (await confirmar('Eliminar chacra', 'La chacra "' + esc(c.nombre) + '" y su acceso se moverán a la papelera. Sus registros se conservan y se recuperan si la restauras.', { si: 'Eliminar', peligro: true })) {
        DB.eliminar('chacras', c.id, c.nombre);
        if (DB.chacraId === c.id) seleccionarChacra(DB.chacrasVisibles()[0].id);
        cerrarTodas(); render();
      }
    },
    alGuardar: v => {
      const camp = v.campania; delete v.campania;
      if (nuevo) {
        const ch = DB.crear('chacras', v, 'Nueva chacra: ' + v.nombre);
        const cp = DB.crear('campanias', { chacraId: ch.id, nombre: camp, inicio: HOY(), cerrada: false }, 'Campaña ' + camp);
        DB.editar('chacras', ch.id, { campaniaActiva: cp.id }, '', true);
        seleccionarChacra(ch.id);
        toast('Chacra creada y seleccionada');
      } else { DB.editar('chacras', c.id, v, v.nombre); toast('Guardado'); }
      render();
    },
  });
}
ACC.chacraNueva = () => formChacra(null);
ACC.chacraEditar = el => { if (!puedeOToast('config')) return; formChacra(DB.get('chacras', el.dataset.id)); };

/* ---------- Parcelas ---------- */
VISTAS.parcelas = () => {
  const ps = DB.deChacra('parcelas').sort((a, b) => (a.activo === false) - (b.activo === false) || a.nombre.localeCompare(b.nombre));
  let h = ps.length ? '<div class="lista">' + ps.map(p => '<a class="fila" href="#/parcela/' + p.id + '">' + ico('mapa') + '<div class="cuerpo-f"><div class="t">' + esc(p.nombre) +
    (p.activo === false ? ' ' + pill('Inactiva', 'warn') : '') + '</div><div class="d">' + (p.cuadras ? cant(p.cuadras) + ' cuadras · ' : '') + esc((p.cultivos || []).map(nomC).filter(Boolean).join(', ') || 'Sin cultivo') +
    (p.variedad ? ' · ' + esc(p.variedad) : '') + '</div></div>' + ico('der', 's') + '</a>').join('') + '</div>'
    : vacio('mapa', 'Aún no hay parcelas', '<p class="small">Registra tus lotes para saber cuánto produce y cuesta cada uno.</p>');
  const tot = sumar(ps.filter(p => p.activo !== false), p => p.cuadras);
  if (tot) h += '<p class="small muted">Área en parcelas activas: ' + cant(tot) + ' cuadras (' + cant(tot) + ' ha)</p>';
  return { titulo: 'Parcelas', atras: true, html: h, fab: DB.puede('config') ? { t: 'Nueva parcela', icono: 'mas', act: 'parcelaNueva' } : null };
};
function formParcela(p) {
  if (!puedeOToast('config')) return;
  const nuevo = !p;
  formulario({
    titulo: nuevo ? 'Nueva parcela' : 'Editar parcela',
    valores: nuevo ? { activo: true, cultivos: cultivosActivos().slice(0, 1).map(c => c.id) } : Object.assign({}, p),
    campos: [
      { id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: nuevo, ph: 'Lote 1 / La Loma', valida: v => DB.deChacra('parcelas').some(x => x.nombre.toLowerCase() === v.toLowerCase() && (!p || x.id !== p.id)) ? 'Ya hay una parcela con ese nombre' : '' },
      { id: 'cuadras', et: 'Área (cuadras)', tipo: 'num', min: 0, par: true, ayuda: '1 cuadra = 1 ha' },
      { id: 'plantas', et: 'N° de plantas', tipo: 'num', min: 0 },
      { id: 'cultivos', et: 'Cultivos', tipo: 'multi', ops: cultivosActivos().map(c => ({ v: c.id, t: c.nombre })), ayuda: 'Puedes elegir varios (ej. café con plátano)' },
      { id: 'variedad', et: 'Variedad', tipo: 'texto', ph: 'Catimor, Geisha…', par: true },
      { id: 'siembra', et: 'Fecha de siembra', tipo: 'fecha' },
      { id: 'activo', et: 'Parcela activa', tipo: 'chk' },
      { id: 'nota', et: 'Notas', tipo: 'area' },
    ],
    eliminar: nuevo || !DB.puede('eliminar') ? null : async () => {
      if (await confirmar('Eliminar parcela', 'Los registros de cosecha y trabajo de esta parcela se conservan.', { si: 'Eliminar', peligro: true })) { DB.eliminar('parcelas', p.id, p.nombre); cerrarTodas(); render(); }
    },
    alGuardar: v => { if (nuevo) DB.crear('parcelas', v, 'Parcela ' + v.nombre); else DB.editar('parcelas', p.id, v, p.nombre); toast('Parcela guardada'); render(); },
  });
}
ACC.parcelaNueva = () => formParcela(null);
ACC.parcelaEditar = el => formParcela(DB.get('parcelas', el.dataset.id));

/* ---------- Campañas ---------- */
VISTAS.campanias = () => {
  const act = DB.campaniaActiva();
  const cs = DB.deChacra('campanias').sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  let h = cs.length ? '<div class="lista">' + cs.map(c => '<div class="fila" data-act="campaniaMenu" data-id="' + c.id + '">' + ico('bandera') + '<div class="cuerpo-f"><div class="t">' + esc(c.nombre) + ' ' +
    (c.cerrada ? pill('Cerrada', 'warn') : act && act.id === c.id ? pill('Activa', 'ok') : '') + '</div><div class="d">Desde ' + fecha(c.inicio) + (c.fin ? ' hasta ' + fecha(c.fin) : '') + '</div></div>' + ico('mas_menu', 's') + '</div>').join('') + '</div>'
    : vacio('bandera', 'No hay campañas');
  h += '<p class="small muted">Lo que registras se guarda en la campaña activa. Al <b>cerrar</b> una campaña nadie puede modificar sus registros, salvo que un administrador la reabra.</p>';
  return { titulo: 'Campañas', atras: true, html: h, fab: DB.puede('cerrar') ? { t: 'Nueva campaña', icono: 'mas', act: 'campaniaNueva' } : null };
};
ACC.campaniaNueva = () => {
  if (!puedeOToast('cerrar')) return;
  formulario({
    titulo: 'Nueva campaña', valores: { nombre: 'Campaña ' + new Date().getFullYear(), inicio: HOY() },
    campos: [{ id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: true }, { id: 'inicio', et: 'Inicio', tipo: 'fecha', req: true, par: true }, { id: 'fin', et: 'Fin (opcional)', tipo: 'fecha' }],
    alGuardar: v => {
      const c = DB.crear('campanias', Object.assign(v, { cerrada: false }), 'Nueva campaña: ' + v.nombre);
      DB.editar('chacras', DB.chacraId, { campaniaActiva: c.id }, 'Campaña activa: ' + v.nombre);
      toast('Campaña creada y activada'); render();
    },
  });
};
ACC.campaniaMenu = async el => {
  const c = DB.get('campanias', el.dataset.id);
  if (!DB.puede('cerrar')) return;
  const act = DB.campaniaActiva();
  const ops = [];
  if (!c.cerrada && (!act || act.id !== c.id)) ops.push({ v: 'activar', t: 'Usar como campaña activa', icono: 'check' });
  ops.push({ v: 'editar', t: 'Cambiar nombre o fechas', icono: 'editar' });
  ops.push(c.cerrada ? { v: 'reabrir', t: 'Reabrir campaña', icono: 'candado' } : { v: 'cerrar', t: 'Cerrar campaña', d: 'Nadie podrá modificar sus registros', icono: 'candado' });
  const op = await elegir(c.nombre, ops);
  if (op === 'activar') { DB.editar('chacras', DB.chacraId, { campaniaActiva: c.id }, 'Campaña activa: ' + c.nombre); render(); }
  if (op === 'editar') formulario({
    titulo: 'Editar campaña', valores: Object.assign({}, c),
    campos: [{ id: 'nombre', et: 'Nombre', tipo: 'texto', req: true }, { id: 'inicio', et: 'Inicio', tipo: 'fecha', req: true, par: true }, { id: 'fin', et: 'Fin', tipo: 'fecha' }],
    alGuardar: v => { DB.editar('campanias', c.id, v, c.nombre); render(); },
  });
  if (op === 'cerrar' && await confirmar('Cerrar ' + c.nombre, 'Ya no se podrán corregir ni eliminar sus registros. Podrás reabrirla si lo necesitas.', { si: 'Cerrar campaña' })) {
    DB.editar('campanias', c.id, { cerrada: true, fin: c.fin || HOY() }, 'Campaña cerrada: ' + c.nombre);
    const ch = DB.get('chacras', DB.chacraId);
    if (ch.campaniaActiva === c.id) DB.editar('chacras', ch.id, { campaniaActiva: null }, '', true);
    toast('Campaña cerrada'); render();
  }
  if (op === 'reabrir') { DB.editar('campanias', c.id, { cerrada: false }, 'Campaña reabierta: ' + c.nombre); toast('Campaña reabierta'); render(); }
};

/* ---------- Cultivos ---------- */
VISTAS.cultivos = () => {
  const cs = DB.todos('cultivos').sort((a, b) => b.activo - a.activo || a.nombre.localeCompare(b.nombre));
  let h = '<p class="small muted">Activa los cultivos que siembras. Puedes crear cualquier otro cultivo con sus propias unidades.</p><div class="lista">' + cs.map(c =>
    '<div class="fila" data-act="cultivoEditar" data-id="' + c.id + '">' + ico('hoja') + '<div class="cuerpo-f"><div class="t">' + esc(c.nombre) + ' ' + (c.activo ? pill('Activo', 'ok') : '') + '</div>' +
    '<div class="d">Cosecha en: ' + esc(c.unidadesCosecha.join(', ')) + ' · Venta: ' + esc((c.estados || []).map(e => e.nombre + ' (' + e.unidades.join('/') + ')').join(', ')) + '</div></div>' + ico('editar', 's') + '</div>').join('') + '</div>';
  return { titulo: 'Cultivos', atras: true, html: h, fab: { t: 'Nuevo cultivo', icono: 'mas', act: 'cultivoNuevo' } };
};
function formCultivo(c) {
  if (!puedeOToast('config')) return;
  const nuevo = !c;
  const val = nuevo ? { activo: true, unidades: 'kg', estadosTxt: 'Fresco: kg' } : {
    nombre: c.nombre, activo: c.activo, variedades: (c.variedades || []).join(', '), unidades: c.unidadesCosecha.join(', '),
    estadosTxt: (c.estados || []).map(e => e.nombre + ': ' + e.unidades.join(', ')).join('\n'),
  };
  const lista = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  formulario({
    titulo: nuevo ? 'Nuevo cultivo' : c.nombre, valores: val,
    campos: [
      { id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: nuevo, ph: 'Ej. Granadilla', valida: v => DB.todos('cultivos').some(x => x.nombre.toLowerCase() === v.toLowerCase() && (!c || x.id !== c.id)) ? 'Ese cultivo ya existe' : '' },
      { id: 'activo', et: 'Lo siembro (activo)', tipo: 'chk' },
      { id: 'unidades', et: 'Unidades de cosecha', tipo: 'texto', req: true, ayuda: 'Separadas por coma. Ej: lata, kg, saco, racimo, jaba' },
      { id: 'variedades', et: 'Variedades', tipo: 'texto', ayuda: 'Separadas por coma' },
      { id: 'estadosTxt', et: 'Estados y unidades de venta', tipo: 'area', ayuda: 'Una línea por estado. Ej: "Seco: kg" o "Húmedo / oreado: lata". Se usa en ventas (Etapa 2).' },
    ],
    alGuardar: v => {
      const d = {
        nombre: v.nombre, activo: !!v.activo, unidadesCosecha: lista(v.unidades), variedades: String(v.variedades || '').split(',').map(x => x.trim()).filter(Boolean),
        estados: String(v.estadosTxt || '').split('\n').map(l => l.split(':')).filter(p => p[0].trim()).map(p => ({ nombre: p[0].trim(), unidades: lista(p[1] || '') })),
      };
      if (!d.unidadesCosecha.length) return 'Escribe al menos una unidad de cosecha';
      if (nuevo) DB.crear('cultivos', d, 'Cultivo ' + d.nombre); else DB.editar('cultivos', c.id, d, c.nombre);
      toast('Cultivo guardado'); render();
    },
  });
}
ACC.cultivoNuevo = () => formCultivo(null);
ACC.cultivoEditar = el => formCultivo(DB.get('cultivos', el.dataset.id));

/* ---------- Labores ---------- */
VISTAS.labores = () => {
  const ls = DB.todos('labores');
  return {
    titulo: 'Labores', atras: true, fab: { t: 'Nueva labor', icono: 'mas', act: 'laborEditar' },
    html: '<div class="lista">' + ls.map(l => '<div class="fila" data-act="laborEditar" data-id="' + l.id + '">' + ico('herramienta') + '<div class="cuerpo-f"><div class="t">' + esc(l.nombre) + '</div></div>' + ico('editar', 's') + '</div>').join('') + '</div>',
  };
};
ACC.laborEditar = el => {
  if (!puedeOToast('config')) return;
  const l = el.dataset.id ? DB.get('labores', el.dataset.id) : null;
  formulario({
    titulo: l ? 'Editar labor' : 'Nueva labor', valores: l ? { nombre: l.nombre } : {},
    campos: [{ id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: true, valida: v => DB.todos('labores').some(x => x.nombre.toLowerCase() === v.toLowerCase() && (!l || x.id !== l.id)) ? 'Ya existe' : '' }],
    eliminar: l ? async () => { if (await confirmar('Eliminar labor', 'Los registros que ya la usan la conservan.', { si: 'Eliminar', peligro: true })) { DB.eliminar('labores', l.id, l.nombre); cerrarTodas(); render(); } } : null,
    alGuardar: v => { if (l) DB.editar('labores', l.id, v, l.nombre); else DB.crear('labores', v, 'Labor ' + v.nombre); render(); },
  });
};

/* ---------- Usuarios ---------- */
VISTAS.usuarios = () => {
  if (!DB.puede('usuarios')) return { titulo: 'Usuarios', atras: true, html: vacio('candado', 'Solo el dueño gestiona usuarios') };
  const us = DB.todos('usuarios');
  const conCuenta = NUBE.esV2() && NUBE.activa();
  if (conCuenta) cargarEquipo();
  const eq = EQUIPO.datos;
  const estadoNube = u => {
    if (!conCuenta || u.dueno) return '';
    const m = eq && eq.miembros.find(x => x.usuario_local === u.id && x.activo);
    const inv = eq && eq.invitaciones.find(x => x.usuario_local === u.id);
    const est = !eq ? '' : m ? pill('Conectado', 'ok') + ' <span class="small muted">' + esc(m.email || '') + '</span>'
      : inv ? pill('Invitación enviada', 'info') + ' <span class="small muted">vence ' + fecha(String(inv.vence).slice(0, 10)) + '</span>' : pill('Sin celular', 'warn');
    const btn = u.activo === false ? '' : m
      ? '<button class="btn chico peligro" data-act="quitarAccesoUsuario" data-id="' + u.id + '">' + ico('candado', 's') + 'Quitar acceso</button>'
      : '<button class="btn chico" data-act="invitarUsuario" data-id="' + u.id + '">' + ico('whatsapp', 's') + (inv ? 'Reenviar invitación' : 'Invitar a su celular') + '</button>';
    return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">' + est + btn + '</div>';
  };
  const h = (conCuenta ? '' : '<div class="aviso tono-info small">' + ico('info', 's') + '<div>Para que cada persona use la app en <b>su propio celular</b>, entra con tu cuenta en <b>Más → Mi cuenta y nube</b> y luego invítala desde aquí.</div></div>') +
    '<div class="lista">' + us.map(u => '<div class="fila" data-act="usuarioEditar" data-id="' + u.id + '"><span class="avatar">' + esc(iniciales(u.nombre)) + '</span><div class="cuerpo-f"><div class="t">' + esc(u.nombre) + ' ' +
    (u.dueno ? pill('Dueño', 'ok') : '') + (u.activo === false ? pill('Sin acceso', 'warn') : '') + '</div><div class="d">' +
    (u.dueno ? 'Acceso total' : esc((u.accesos || []).map(a => ((DB.get('chacras', a.chacraId) || {}).nombre || '?') + ': ' + ROLES[a.rol].t).join(' · ') || 'Sin chacras')) + '</div>' + estadoNube(u) + '</div>' + ico('editar', 's') + '</div>').join('') + '</div>' +
    '<div class="card tono-info small">' + Object.keys(ROLES).map(k => '<b>' + ROLES[k].t + ':</b> ' + ROLES[k].d).join('<br>') + '</div>';
  return { titulo: 'Usuarios y permisos', atras: true, html: h, fab: { t: 'Nuevo usuario', icono: 'mas', act: 'usuarioEditar' } };
};

/* ---------- Equipo en la nube (invitaciones y accesos) ---------- */
const EQUIPO = { datos: null, cargando: false, de: null };
async function cargarEquipo(forzar) {
  const n = NUBE.cfg();
  if (!n || n.v !== 2 || EQUIPO.cargando) return;
  if (!forzar && EQUIPO.de === n.espacio && EQUIPO.datos) return;
  EQUIPO.cargando = true;
  try { EQUIPO.datos = await CUENTA.rpc('mc2_equipo', { p_espacio: n.espacio }); EQUIPO.de = n.espacio; } catch (e) { EQUIPO.datos = null; }
  EQUIPO.cargando = false;
  if ((location.hash === '#/usuarios' || location.hash.startsWith('#/trabajador/')) && !PILA.length) render();
}

/* ---------- Celular del trabajador (Fase 3) ---------- */
function tarjetaCelularTrabajador(t) {
  if (!NUBE.esV2() || !NUBE.activa() || !DB.puede('trabajadores') || t.activo === false) return '';
  cargarEquipo();
  const eq = EQUIPO.datos;
  if (!eq) return '';
  const m = (eq.trabajadores || []).find(x => x.trabajador === t.id && x.activo);
  const inv = (eq.invitaciones || []).find(x => x.trabajador === t.id);
  const est = m ? pill('Conectado', 'ok') + ' <span class="small muted">' + esc(m.email || '') + '</span>'
    : inv ? pill('Invitación enviada', 'info') + ' <span class="small muted">vence ' + fecha(String(inv.vence).slice(0, 10)) + '</span>' : pill('Sin celular', 'warn');
  const btn = m
    ? '<button class="btn chico peligro" data-act="quitarAccesoTrab" data-id="' + t.id + '">' + ico('candado', 's') + 'Quitar acceso</button>'
    : '<button class="btn chico" data-act="invitarTrab" data-id="' + t.id + '">' + ico('whatsapp', 's') + (inv ? 'Reenviar invitación' : 'Invitar a su celular') + '</button>';
  return '<div class="card"><div style="font-weight:700;margin-bottom:4px">Su celular</div>' +
    '<p class="small muted" style="margin:0 0 8px">Con su propia cuenta ve sus días, latas, pagos y boletas, y puede reportar un error. No ve nada de los demás.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + est + btn + '</div></div>';
}
ACC.invitarTrab = async el => {
  const t = DB.get('trabajadores', el.dataset.id);
  if (!t) return;
  toast('Preparando la invitación…');
  await NUBE.sincronizar(true); // la ficha debe estar en la nube
  if (NUBE.estado === 'sinred') return toast('Necesitas internet para invitar', 'error');
  let r;
  try { r = await CUENTA.rpc('mc2_invitar_trabajador', { p_espacio: NUBE.cfg().espacio, p_trabajador: t.id }); } catch (e) { return toast(e.message, 'error'); }
  const ch = (DB.todos('chacras').find(c => (t.chacras || []).includes(c.id)) || {}).nombre || 'la chacra';
  const txt = 'Hola ' + t.nombre.split(' ')[0] + ', desde ahora puedes ver en tu celular tus días, latas, pagos y boletas de ' + ch + ' con MI-CHACRA.\n\n' +
    '1) Instala la app desde Play Store: https://play.google.com/apps/internaltest/4700642312873271512\n' +
    '   o úsala en el navegador: https://elarcastro.github.io/michacra/app/\n' +
    '2) Entra con tu correo o con Google.\n' +
    '3) Toca "Tengo una invitación" y escribe este código: ' + r.codigo + '\n\n(El código sirve una sola vez y vence en 7 días.)';
  const h = abrirHoja(cabHoja('Invitación para ' + t.nombre) +
    '<p class="muted small" style="margin:0 0 6px">Código de un solo uso, vence el ' + fecha(String(r.vence).slice(0, 10)) + ':</p>' +
    '<p style="font-size:30px;font-weight:700;letter-spacing:3px;text-align:center;margin:8px 0 14px">' + esc(r.codigo) + '</p>' +
    '<button class="btn pri bloque" data-x="wa">' + ico('whatsapp') + 'Enviar por WhatsApp</button>' +
    '<p class="small muted" style="margin-top:10px">Verá solo su propia información y podrá reportar errores. Puedes quitarle el acceso cuando quieras.</p>');
  h.querySelector('[data-x=wa]').onclick = () => t.celular ? abrirExterno(enlaceWhatsApp(t.celular, txt)) : compartirTexto(txt);
  cargarEquipo(true);
};
ACC.quitarAccesoTrab = async el => {
  const t = DB.get('trabajadores', el.dataset.id);
  if (!t || !(await confirmar('Quitar acceso a ' + t.nombre, 'Su celular dejará de recibir datos de inmediato y se borrará la copia que tiene. Puedes volver a invitarlo después.', { si: 'Quitar acceso', peligro: true }))) return;
  try { await CUENTA.rpc('mc2_quitar_trabajador', { p_espacio: NUBE.cfg().espacio, p_trabajador: t.id }); } catch (e) { return toast(e.message, 'error'); }
  toast('Acceso quitado'); cargarEquipo(true);
};
ACC.invitarUsuario = async el => {
  const u = DB.get('usuarios', el.dataset.id);
  if (!u) return;
  toast('Preparando la invitación…');
  await NUBE.sincronizar(true); // el usuario y sus permisos deben estar en la nube
  if (NUBE.estado === 'sinred') return toast('Necesitas internet para invitar', 'error');
  let r;
  try { r = await CUENTA.rpc('mc2_invitar', { p_espacio: NUBE.cfg().espacio, p_usuario_local: u.id }); } catch (e) { return toast(e.message, 'error'); }
  const ch = (DB.todos('chacras').find(c => (u.accesos || []).some(a => a.chacraId === c.id)) || {}).nombre || 'mi chacra';
  const rol = ({ admin: 'Administrador', supervisor: 'Supervisor', operario: 'Operario' })[r.rol] || r.rol;
  const txt = 'Hola ' + u.nombre.split(' ')[0] + ', te invito a MI-CHACRA (' + ch + ') como ' + rol + '.\n\n' +
    '1) Instala la app desde Play Store: https://play.google.com/apps/internaltest/4700642312873271512\n' +
    '   o úsala en el navegador: https://elarcastro.github.io/michacra/app/\n' +
    '2) Entra con tu correo o con Google.\n' +
    '3) Toca "Tengo una invitación" y escribe este código: ' + r.codigo + '\n\n(El código sirve una sola vez y vence en 7 días.)';
  const h = abrirHoja(cabHoja('Invitación para ' + u.nombre) +
    '<p class="muted small" style="margin:0 0 6px">Código de un solo uso, vence el ' + fecha(String(r.vence).slice(0, 10)) + ':</p>' +
    '<p style="font-size:30px;font-weight:700;letter-spacing:3px;text-align:center;margin:8px 0 14px">' + esc(r.codigo) + '</p>' +
    '<button class="btn pri bloque" data-x="wa">' + ico('whatsapp') + 'Enviar por WhatsApp</button>' +
    '<p class="small muted" style="margin-top:10px">Entrará como <b>' + esc(rol) + '</b> y verá solo lo que su rol permite. Puedes quitarle el acceso cuando quieras.</p>');
  h.querySelector('[data-x=wa]').onclick = () => compartirTexto(txt);
  cargarEquipo(true);
};
ACC.quitarAccesoUsuario = async el => {
  const u = DB.get('usuarios', el.dataset.id);
  if (!u || !(await confirmar('Quitar acceso a ' + u.nombre, 'Su celular dejará de recibir y enviar datos de inmediato, y se borrará la copia de tus datos que tiene. Puedes volver a invitarlo después.', { si: 'Quitar acceso', peligro: true }))) return;
  try { await CUENTA.rpc('mc2_quitar', { p_espacio: NUBE.cfg().espacio, p_usuario_local: u.id }); } catch (e) { return toast(e.message, 'error'); }
  toast('Acceso quitado'); cargarEquipo(true);
};
ACC.usuarioEditar = el => {
  const u = el.dataset.id ? DB.get('usuarios', el.dataset.id) : null;
  const chs = DB.todos('chacras');
  const val = u ? { nombre: u.nombre, activo: u.activo !== false, tienda: u.tienda || '' } : { activo: true, tienda: '' };
  if (u && !u.dueno) for (const c of chs) { const a = (u.accesos || []).find(x => x.chacraId === c.id); val['rol_' + c.id] = a ? a.rol : ''; val['fin_' + c.id] = !!(a && a.verFinanzas); }
  const rolOps = [{ v: '', t: 'Sin acceso' }].concat(Object.keys(ROLES).map(k => ({ v: k, t: ROLES[k].t })));
  formulario({
    titulo: u ? 'Editar usuario' : 'Nuevo usuario', valores: val,
    campos: [
      { id: 'nombre', et: 'Nombre', tipo: 'texto', req: true, foco: !u },
      { id: 'pin', et: u ? 'Nuevo PIN (déjalo vacío para no cambiarlo)' : 'PIN de 4 dígitos', tipo: 'pin', req: !u, valida: v => /^\d{4}$/.test(v) ? '' : 'El PIN debe tener 4 dígitos' },
      u && u.dueno ? null : { id: 'activo', et: 'Puede entrar a la app', tipo: 'chk' },
    ].concat(u && u.dueno ? [{ id: 'info', tipo: 'html', html: '<p class="small muted">El dueño tiene acceso total a todas las chacras.</p>' }]
      : [].concat(...chs.map(c => [{ id: 'rol_' + c.id, et: 'Rol en ' + c.nombre, tipo: 'select', ops: rolOps },
        { id: 'fin_' + c.id, et: 'También puede ver ventas, gastos y ganancia', tipo: 'chk', ver: v => v['rol_' + c.id] === 'supervisor' }]))
        .concat(tiendaActivaAqui() ? [{ id: 'tienda', et: 'En la tienda ' + nombreTienda(), tipo: 'select', ops: [{ v: '', t: 'Sin acceso' }, { v: 'vendedor', t: 'Vendedor (atiende pedidos)' }, { v: 'admin', t: 'Administrador de la tienda' }] }] : [])).filter(Boolean),
    alGuardar: async v => {
      const d = { nombre: v.nombre };
      if (!(u && u.dueno)) {
        d.activo = !!v.activo;
        d.accesos = chs.filter(c => v['rol_' + c.id]).map(c => ({ chacraId: c.id, rol: v['rol_' + c.id], verFinanzas: v['rol_' + c.id] === 'supervisor' && !!v['fin_' + c.id] }));
        d.tienda = v.tienda || '';
        if (!d.accesos.length && !d.tienda) return 'Dale acceso al menos a una chacra o a la tienda';
      }
      if (v.pin) { d.sal = uid(); d.pin = await huellaPin(v.pin, d.sal); }
      if (u) { DB.editar('usuarios', u.id, d, 'Usuario ' + d.nombre); if (DB.usuario.id === u.id) Object.assign(DB.usuario, d); }
      else DB.crear('usuarios', d, 'Nuevo usuario: ' + d.nombre);
      toast('Usuario guardado'); render();
    },
  });
};

/* ---------- Ajustes ---------- */
ACC.quitarSilencios = () => { DB.d.config.silenciadas = []; DB.guardar(); toast('Volverás a ver ofertas de todas las tiendas'); render(); };
VISTAS.ajustes = () => {
  const c = DB.d.config;
  const seg = (k, ops) => '<div class="seg" data-aj="' + k + '">' + ops.map(([v, t]) => '<button class="' + (String(c[k]) === String(v) ? 'on' : '') + '" data-v="' + v + '">' + t + '</button>').join('') + '</div>';
  const h = '<div class="card"><h3>Apariencia</h3>' + seg('tema', [['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']]) + '</div>' +
    '<div class="card"><h3>La semana de pago empieza el</h3>' + seg('inicioSemana', [[1, 'Lunes'], [0, 'Domingo'], [6, 'Sábado']]) +
    '<p class="small muted" style="margin:8px 0 0">Se usa en "Esta semana" de pagos y liquidaciones.</p></div>' +
    (DB.usuario.dueno ? '<div class="card"><h3>Seguridad</h3><label class="chk"><input type="checkbox" id="ajPin"' + (c.pedirPin ? ' checked' : '') + '><span>Pedir PIN al abrir la app</span></label></div>' : '') +
    (DB.usuario.dueno ? '<div class="card"><h3>Privacidad y datos</h3><p class="small muted" style="margin:0 0 10px">Lee cómo se usan tus datos o bórralos cuando quieras.</p>' +
      '<button class="btn chico bloque" data-act="verPrivacidad" style="margin-bottom:8px">' + ico('candado', 's') + 'Política de privacidad</button>' +
      (NUBE.activa() ? '<button class="btn chico bloque" data-act="ir" data-ruta="nube" style="margin-bottom:8px">' + ico('nube_off', 's') + 'Eliminar mi cuenta de la nube</button>' : '') +
      '<button class="btn chico bloque peligro" data-act="borrarCelular">' + ico('borrar', 's') + 'Borrar todos los datos de este celular</button></div>' : '') +
    '<div class="card"><h3>Ofertas del mercado</h3><label class="chk"><input type="checkbox" id="ajOfertas"' + (c.ofertas === true ? ' checked' : '') + '><span>Quiero recibir ofertas para mi cultivo</span></label>' +
    '<p class="small muted" style="margin:4px 0 0">Máximo 3 ofertas nuevas por semana. Se eligen dentro de tu celular: las tiendas no reciben datos de tu chacra.</p>' +
    ((c.silenciadas || []).length ? '<p class="small" style="margin:8px 0 4px">No ves ofertas de: ' + c.silenciadas.map(v => esc(nombreDe(v))).join(', ') + '</p><button class="btn chico" data-act="quitarSilencios">Volver a ver todas</button>' : '') + '</div>' +
    '<div class="card"><h3>Avisos en el celular</h3><p class="small muted" style="margin:0 0 10px">Cada mañana a las 6:00 te llega un aviso con los abonos que tocan, cobros, pagos y productos por vencer.</p>' +
    (NATIVO && Android.avisosPermitidos ? (Android.avisosPermitidos() ? '<div class="aviso tono-ok small">' + ico('check', 's') + '<div>Los avisos están permitidos.</div></div><button class="btn chico" data-act="probarAviso">' + ico('info', 's') + 'Enviar un aviso de prueba</button>'
      : '<div class="aviso tono-warn small">' + ico('alerta', 's') + '<div>El celular no permite avisos de MI-CHACRA.</div></div><button class="btn chico" data-act="permisoAvisos">Permitir avisos</button>')
      : '<p class="small faint" style="margin:0">Disponible en la app instalada en el celular.</p>') + '</div>';
  return {
    titulo: 'Ajustes', atras: true, html: h,
    despues: root => {
      $$('[data-aj] button', root).forEach(b => b.onclick = () => {
        const k = b.parentElement.dataset.aj;
        c[k] = k === 'inicioSemana' ? Number(b.dataset.v) : b.dataset.v;
        DB.guardar(); aplicarTema(); render();
      });
      const o = $('#ajOfertas', root);
      if (o) o.onchange = () => { c.ofertas = o.checked; DB.guardar(); toast(o.checked ? 'Recibirás ofertas para tu cultivo' : 'Ya no verás ofertas'); };
      const p = $('#ajPin', root);
      if (p) p.onchange = () => { c.pedirPin = p.checked; DB.guardar(); toast(p.checked ? 'Se pedirá el PIN' : 'Ya no se pedirá el PIN si hay un solo usuario'); };
    },
  };
};

ACC.probarAviso = () => { if (NATIVO) Android.probarAviso(); };
/** Muestra la política de privacidad incluida en la app (la misma que se publica en la web). */
ACC.verPrivacidad = async () => {
  let html = '';
  try {
    const m = new DOMParser().parseFromString(await (await fetch('privacidad.html')).text(), 'text/html').querySelector('main');
    m.querySelectorAll('a').forEach(a => a.removeAttribute('href')); // dentro de la app, los enlaces web no navegan
    html = m.innerHTML;
  }
  catch (e) { html = '<p>No se pudo abrir la política de privacidad.</p>'; }
  abrirHoja(cabHoja('Política de privacidad') + '<div class="card privacidad" style="font-size:14px;line-height:1.55">' + html + '</div>');
};
ACC.permisoAvisos = () => { if (NATIVO) { Android.pedirPermisoAvisos(); setTimeout(render, 2500); } };

/* ==========================================================================
   HISTORIAL, PAPELERA Y RESPALDO
   ========================================================================== */
const ETIQ = { cantidad: 'Cantidad', merma: 'Merma', precio: 'Precio', total: 'Total', fecha: 'Fecha', trabajadorId: 'Trabajador', parcelaId: 'Parcela', cultivoId: 'Cultivo',
  unidad: 'Unidad', labor: 'Labor', modalidad: 'Forma de pago', horasExtra: 'Horas extra', precioHora: 'Precio hora extra', monto: 'Monto', tipo: 'Tipo', nombre: 'Nombre',
  celular: 'Celular', dni: 'DNI', codigo: 'N°', activo: 'Activo', nota: 'Nota', forma: 'Forma', avance: 'Avance', estado: 'Estado', cuadras: 'Cuadras', pagarMerma: 'Pagar merma',
  contratista: 'Contratista', cerrada: 'Cerrada', campaniaActiva: 'Campaña activa', accesos: 'Permisos', pin: 'PIN', chacras: 'Chacras', cultivos: 'Cultivos',
  clienteId: 'Cliente', cobro: 'Cobro', cobradoInicial: 'Cobrado al vender', categoria: 'Categoría', descripcion: 'Descripción', concepto: 'Concepto',
  proveedor: 'Proveedor', pagado: 'Pagado', campanias: 'N° de campañas', campaniaId: 'Campaña', acceso: 'Acceso a la app', hecha: 'Hecha', respuesta: 'Respuesta',
  vence: 'Vence', fechaPago: 'Fecha de pago', producto: 'Producto', dosis: 'Dosis', carencia: 'Carencia (días)', costoUnit: 'Costo unitario', cadaDias: 'Cada (días)',
  inicio: 'Inicio', fin: 'Fin', minimo: 'Stock mínimo', costo: 'Costo', parcelas: 'Parcelas' };
function valorLegible(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'pin' || k === 'sal') return '••••';
  if (k === 'trabajadorId') return nomT(v);
  if (k === 'parcelaId') return nomP(v) || '—';
  if (k === 'cultivoId') return nomC(v);
  if (k === 'campaniaActiva' || k === 'campaniaId') return (DB.get('campanias', v) || {}).nombre || '—';
  if (k === 'clienteId') return nomCli(v);
  if (['precio', 'total', 'monto', 'precioHora', 'cobradoInicial', 'costoUnit', 'costo'].includes(k)) return soles(v);
  if (['fecha', 'vence', 'fechaPago', 'inicio', 'fin'].includes(k)) return fecha(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length + ' elementos';
  if (typeof v === 'object') return '…';
  return String(v);
}
let histTodo = false;
VISTAS.historial = () => {
  if (!DB.puede('historial')) return { titulo: 'Historial', atras: true, html: vacio('candado', 'Sin acceso') };
  let hs = DB.d.historial.filter(x => x.chacraId === DB.chacraId || (histTodo && DB.usuario.dueno) || !x.chacraId);
  const total = hs.length; hs = hs.slice(0, 300);
  const icA = { crear: 'mas', editar: 'editar', eliminar: 'borrar', restaurar: 'restaurar' };
  const txA = { crear: 'registró', editar: 'corrigió', eliminar: 'eliminó', restaurar: 'recuperó' };
  let h = DB.usuario.dueno ? '<div class="chips-h"><button class="' + (!histTodo ? 'on' : '') + '" data-act="histTodo" data-v="0">Esta chacra</button><button class="' + (histTodo ? 'on' : '') + '" data-act="histTodo" data-v="1">Todas</button></div>' : '';
  h += hs.length ? '<div class="lista">' + hs.map(x => '<div class="fila" data-act="histVer" data-id="' + x.id + '">' + ico(icA[x.accion] || 'info') + '<div class="cuerpo-f"><div class="t">' + esc(x.resumen || NOMBRES_COL[x.col]) + '</div>' +
    '<div class="d">' + esc(x.usuario) + ' ' + txA[x.accion] + ' · ' + esc(NOMBRES_COL[x.col] || x.col) + ' · ' + fechaHora(x.ts) + '</div></div></div>').join('') + '</div>' : vacio('historial', 'Aún no hay cambios registrados');
  if (total > 300) h += '<p class="small muted center">Mostrando los últimos 300 de ' + total + ' cambios.</p>';
  return { titulo: 'Historial de cambios', atras: true, html: h };
};
ACC.histTodo = el => { histTodo = el.dataset.v === '1'; render(); };
ACC.histVer = el => {
  const x = DB.d.historial.find(y => y.id === el.dataset.id);
  if (!x) return;
  const filas = (x.cambios || []).filter(c => !['editado', 'editadoPor', 'sal'].includes(c.campo)).map(c =>
    '<tr><td>' + esc(ETIQ[c.campo] || c.campo) + '</td><td class="m"><span class="faint" style="text-decoration:line-through">' + esc(valorLegible(c.campo, c.antes)) + '</span> → <b>' + esc(valorLegible(c.campo, c.despues)) + '</b></td></tr>').join('');
  abrirHoja(cabHoja('Detalle del cambio') + '<div class="card"><b>' + esc(x.resumen || '') + '</b><div class="small muted">' + esc(x.usuario) + ' · ' + fechaHora(x.ts) + ' · ' + esc(NOMBRES_COL[x.col] || '') + '</div>' +
    (filas ? '<table class="tabla" style="margin-top:10px">' + filas + '</table>' : '') + '</div>');
};

function describir(col, r) {
  switch (col) {
    case 'cosechas': return nomT(r.trabajadorId) + ' · ' + plural(r.cantidad, r.unidad) + ' · ' + fecha(r.fecha);
    case 'trabajos': return nomT(r.trabajadorId) + ' · ' + r.labor + ' · ' + fecha(r.fecha);
    case 'movimientos': return (TIPOS_MOV[r.tipo] || {}).t + ' · ' + (r.trabajadorId ? nomT(r.trabajadorId) : 'contrata') + ' · ' + soles(r.monto);
    case 'contratas': return r.contratista + ' · ' + r.labor;
    case 'liquidaciones': return 'Pago a ' + nomT(r.trabajadorId) + ' · ' + soles(r.pagado);
    case 'ventas': return 'Venta a ' + nomCli(r.clienteId) + ' · ' + plural(r.cantidad, r.unidad) + ' · ' + soles(r.total);
    case 'cobros': return 'Cobro · ' + soles(r.monto) + ' · ' + fecha(r.fecha);
    case 'gastos': return r.descripcion + ' · ' + soles(r.monto);
    case 'inversiones': return r.descripcion + ' · ' + soles(r.monto);
    case 'ingresos': return r.concepto + ' · ' + soles(r.monto);
    case 'actividades': return r.labor + ' en ' + nomP(r.parcelaId) + ' · ' + fecha(r.fecha);
    case 'reportes': return 'Reporte de ' + nomT(r.trabajadorId);
    case 'aplicaciones': return r.producto + ' en ' + nomP(r.parcelaId) + ' · ' + fecha(r.fecha);
    case 'planes': return 'Plan: ' + r.producto + ' cada ' + r.cadaDias + ' días';
    case 'inventario': { const p = DB.get('productos', r.productoId); return (r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'salida' ? 'Salida' : 'Ajuste') + ' de ' + (p ? p.nombre : '') + ': ' + cant(r.cantidad); }
    default: return r.nombre || r.id;
  }
}
VISTAS.papelera = () => {
  if (!DB.puede('papelera')) return { titulo: 'Papelera', atras: true, html: vacio('candado', 'Sin acceso') };
  const items = DB.papelera().filter(x => !COLS_CHACRA.includes(x.col) || x.reg.chacraId === DB.chacraId);
  const h = '<p class="small muted">Lo eliminado se guarda aquí ' + DIAS_PAPELERA + ' días. Después se borra para siempre.</p>' +
    (items.length ? '<div class="lista">' + items.map(x => {
      const dias = Math.max(0, DIAS_PAPELERA - Math.floor((Date.now() - x.reg.eliminado) / 864e5));
      return '<div class="fila">' + ico('borrar') + '<div class="cuerpo-f"><div class="t">' + esc(describir(x.col, x.reg)) + '</div><div class="d">' + esc(NOMBRES_COL[x.col]) + ' · se borra en ' + dias + ' días</div></div>' +
        '<button class="btn chico" data-act="restaurar" data-col="' + x.col + '" data-id="' + x.reg.id + '">' + ico('restaurar', 's') + 'Recuperar</button></div>';
    }).join('') + '</div>' : vacio('borrar', 'La papelera está vacía'));
  return { titulo: 'Papelera', atras: true, html: h };
};
ACC.restaurar = el => {
  const col = el.dataset.col, id = el.dataset.id;
  DB.restaurar(col, id);
  const r = DB.get(col, id);
  if (col === 'movimientos' && r.liquidacionId) DB.restaurar('liquidaciones', r.liquidacionId);
  toast('Recuperado'); render();
};

VISTAS.respaldo = () => {
  const n = k => DB.todos(k).length;
  const h = '<div class="card"><h3>Guardar copia</h3><p class="small muted" style="margin:0 0 12px">Descarga un archivo con todos los datos (' + n('trabajadores') + ' trabajadores, ' + n('cosechas') + ' cosechas, ' + n('trabajos') + ' trabajos). Guárdalo en Google Drive o envíatelo por WhatsApp.</p>' +
    '<button class="btn pri bloque" data-act="exportar">' + ico('descargar') + 'Guardar copia de seguridad</button></div>' +
    '<div class="card"><h3>Recuperar copia</h3><p class="small muted" style="margin:0 0 12px">Reemplaza todos los datos de este celular por los del archivo.</p>' +
    '<button class="btn bloque" data-act="importar">' + ico('subir') + 'Recuperar desde archivo</button><input type="file" id="archivoImp" accept=".json,application/json" class="hidden"></div>' +
    '<div class="aviso tono-info">' + ico('info', 's') + '<div>La app guarda sola una copia cada día dentro del celular (últimos 7 días). ' +
    (NUBE.activa() ? 'Además, todo está respaldado en la <a href="#/nube">nube</a>.' : 'Para tener copia fuera del celular, conecta la <a href="#/nube">nube</a>.') + '</div></div>';
  return {
    titulo: 'Copia de seguridad', atras: true, html: h,
    despues: root => { const f = $('#archivoImp', root); f.onchange = () => { const a = f.files[0]; if (!a) return; const rd = new FileReader(); rd.onload = () => window.alImportar(rd.result); rd.readAsText(a); }; },
  };
};
ACC.exportar = () => {
  DB.guardarYa();
  const nombre = 'michacra-respaldo-' + HOY().replace(/-/g, '') + '.json';
  const txt = JSON.stringify(Object.assign({}, DB.d, { nube: null })); // la clave de la nube no viaja en el respaldo
  if (NATIVO) Android.exportar(txt, nombre);
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = nombre; a.click(); }
};
ACC.importar = () => { if (NATIVO) Android.importar(); else $('#archivoImp').click(); };
window.alImportar = async txt => {
  let d;
  try { d = JSON.parse(txt); } catch (e) { return toast('El archivo no es una copia válida', 'error'); }
  if (!d || d.app !== 'MI-CHACRA') return toast('El archivo no es una copia de MI-CHACRA', 'error');
  const n = (d.trabajadores || []).filter(x => !x.eliminado).length;
  if (!(await confirmar('Recuperar copia', 'La copia tiene ' + n + ' trabajadores y ' + (d.cosechas || []).length + ' cosechas. <b>Se reemplazarán todos los datos actuales.</b>', { si: 'Reemplazar', peligro: true }))) return;
  const nube = DB.d.nube;
  DB.d = d; DB.completar();
  if (nube && nube.activa) { DB.d.nube = nube; NUBE.marcarTodo(); }
  DB.errorCarga = false;
  DB.guardarYa();
  toast('Datos recuperados. Vuelve a ingresar.');
  setTimeout(() => location.reload(), 900);
};
