'use strict';
/* ==========================================================================
   MI-CHACRA · Componentes de interfaz
   ========================================================================== */

const ACC = {};     // acciones de botones: data-act="nombre"
const VISTAS = {};  // pantallas: #/nombre/parametro
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soles = n => 'S/ ' + (Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = n => (Number(n) || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function fecha(iso) { if (!iso) return ''; const [a, m, d] = iso.split('-'); return d + '/' + m + '/' + a; }
function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const hoy = HOY();
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, -1)) return 'Ayer';
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}
function fechaHora(ts) { const d = new Date(ts); return fecha(fechaISO(d)) + ' ' + z2(d.getHours()) + ':' + z2(d.getMinutes()); }
const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const plural = (n, u, us) => cant(n) + ' ' + (Number(n) === 1 ? u : (us || pluralU(u)));
function pluralU(u) {
  const m = { L: 'L', g: 'g', ml: 'ml', 'galón': 'galones', lata: 'latas', kg: 'kg', arroba: 'arrobas', racimo: 'racimos', saco: 'sacos', jaba: 'jabas', caja: 'cajas', ciento: 'cientos', unidad: 'unidades', día: 'días', cuadra: 'cuadras', tarea: 'tareas', hora: 'horas' };
  return m[u] || (/[aeiou]$/.test(u) ? u + 's' : u + 'es');
}
const num = v => { if (v === '' || v === null || v === undefined) return ''; const n = Number(String(v).replace(',', '.')); return isNaN(n) ? NaN : n; };

/* ---------- Avisos ---------- */
function toast(txt, tipo) {
  const el = document.createElement('div');
  el.className = 'toast' + (tipo === 'error' ? ' error' : '');
  el.textContent = txt;
  $('#avisos').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 4500 : 2400);
}
function vibrar(ms) { try { navigator.vibrate && navigator.vibrate(ms || 15); } catch (e) { } }

/* ---------- Hojas (ventanas que suben desde abajo) ---------- */
const PILA = [];
function abrirHoja(html, opts) {
  opts = opts || {};
  const focoPrevio = document.activeElement;
  const idTitulo = 'titulo-dialogo-' + uid();
  const velo = document.createElement('div');
  velo.className = 'velo';
  velo.innerHTML = '<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="' + idTitulo + '"><div class="asa"></div>' + html + '</div>';
  const titulo = velo.querySelector('.cab h2');
  if (titulo) titulo.id = idTitulo;
  else velo.querySelector('.hoja').setAttribute('aria-label', 'Diálogo');
  velo.addEventListener('click', e => { if (e.target === velo && !opts.fija && !opts.sinFondoCerrar) cerrarHoja(); });
  velo.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !opts.fija) {
      e.preventDefault(); e.stopPropagation(); cerrarHoja(); return;
    }
    if (e.key !== 'Tab') return;
    const focables = Array.from(velo.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'))
      .filter(x => x.getClientRects().length && !x.closest('.hidden'));
    if (!focables.length) { e.preventDefault(); return; }
    const primero = focables[0], ultimo = focables[focables.length - 1];
    if (e.shiftKey && (document.activeElement === primero || !velo.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (document.activeElement === ultimo || !velo.contains(document.activeElement))) { e.preventDefault(); primero.focus(); }
  });
  $('#capas').appendChild(velo);
  PILA.push({ velo, alCerrar: opts.alCerrar, focoPrevio });
  const h = velo.querySelector('.hoja');
  const f = velo.querySelector('[autofocus]') || velo.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]');
  if (f) setTimeout(() => f.focus(), 0);
  return h;
}
function cerrarHoja() {
  const h = PILA.pop();
  if (!h) return false;
  h.velo.remove();
  if (h.alCerrar) h.alCerrar();
  if (h.focoPrevio && h.focoPrevio.isConnected) h.focoPrevio.focus();
  return true;
}
function cerrarTodas() { while (PILA.length) cerrarHoja(); }
const cabHoja = t => '<div class="cab"><h2>' + esc(t) + '</h2><button class="icon-btn" data-act="cerrarHoja" aria-label="Cerrar">' + ico('cerrar') + '</button></div>';

function confirmar(titulo, texto, opts) {
  opts = opts || {};
  return new Promise(res => {
    let ok = false;
    const h = abrirHoja(cabHoja(titulo) + '<p class="muted" style="margin:0 0 8px">' + texto + '</p>' +
      '<div class="pie"><button class="btn" data-x="no">Cancelar</button><button class="btn ' + (opts.peligro ? 'peligro' : 'pri') + '" data-x="si">' + esc(opts.si || 'Aceptar') + '</button></div>',
      { alCerrar: () => res(ok) });
    h.querySelector('[data-x=no]').onclick = () => cerrarHoja();
    h.querySelector('[data-x=si]').onclick = () => { ok = true; cerrarHoja(); };
  });
}

function elegir(titulo, opciones, actual) {
  return new Promise(res => {
    let val = null;
    const h = abrirHoja(cabHoja(titulo) + '<div class="lista">' + opciones.map((o, i) =>
      '<button type="button" class="fila" data-i="' + i + '">' + (o.icono ? ico(o.icono) : '') + '<div class="cuerpo-f"><div class="t">' + esc(o.t) + '</div>' +
      (o.d ? '<div class="d">' + esc(o.d) + '</div>' : '') + '</div>' + (o.v === actual ? '<span style="color:var(--green)">' + ico('check') + '</span>' : '') + '</button>').join('') + '</div>',
      { alCerrar: () => res(val) });
    h.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { val = opciones[+el.dataset.i].v; cerrarHoja(); });
  });
}

/* ---------- Formularios ----------
   campos: [{ id, et, tipo, req, ops (array o función(vals)), ayuda, ph, min, max, valida(v, vals) => 'error'|'',
              ver(vals) => bool, calc(vals) => html, paso, sufijo }]
   tipos: texto, num, tel, dni, fecha, select, area, seg, chk, multi, pin, calc, html */
function formulario(cfg) {
  const vals = Object.assign({}, cfg.valores || {});
  const campos = cfg.campos;
  const opsDe = c => (typeof c.ops === 'function' ? c.ops(vals) : c.ops) || [];
  const normOp = o => (typeof o === 'object' ? o : { v: o, t: o });

  function htmlCampo(c) {
    const v = vals[c.id] === undefined || vals[c.id] === null ? '' : vals[c.id];
    let inner = '';
    const req = c.req ? ' *' : '';
    const descr = ' aria-describedby="' + (c.ayuda ? 'ayuda-' + esc(c.id) + ' ' : '') + 'error-' + esc(c.id) + '"';
    switch (c.tipo) {
      case 'select':
        inner = '<select class="inp" id="campo-' + esc(c.id) + '" data-c="' + esc(c.id) + '"' + descr + (c.req ? ' aria-required="true"' : '') + '>' + (c.ph ? '<option value="">' + esc(c.ph) + '</option>' : '') +
          opsDe(c).map(normOp).map(o => '<option value="' + esc(o.v) + '"' + (String(o.v) === String(v) ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select>';
        break;
      case 'seg':
        inner = '<div class="seg" id="campo-' + esc(c.id) + '" data-c="' + esc(c.id) + '" role="group" aria-labelledby="etiqueta-' + esc(c.id) + '"' + descr + '>' + opsDe(c).map(normOp).map(o =>
          '<button type="button" data-v="' + esc(o.v) + '" aria-pressed="' + (String(o.v) === String(v) ? 'true' : 'false') + '" class="' + (String(o.v) === String(v) ? 'on' : '') + '">' + esc(o.t) + '</button>').join('') + '</div>';
        break;
      case 'multi': {
        const sel = Array.isArray(v) ? v : [];
        inner = '<div class="seg" id="campo-' + esc(c.id) + '" data-c="' + esc(c.id) + '" data-multi="1" role="group" aria-labelledby="etiqueta-' + esc(c.id) + '"' + descr + '>' + opsDe(c).map(normOp).map(o =>
          '<button type="button" data-v="' + esc(o.v) + '" aria-pressed="' + (sel.includes(o.v) ? 'true' : 'false') + '" class="' + (sel.includes(o.v) ? 'on' : '') + '">' + esc(o.t) + '</button>').join('') + '</div>';
        break;
      }
      case 'chk':
        return '<div class="campo" data-campo="' + esc(c.id) + '"><label class="chk"><input id="campo-' + esc(c.id) + '" type="checkbox" data-c="' + esc(c.id) + '"' + descr + (c.req ? ' aria-required="true"' : '') + (v ? ' checked' : '') + '><span>' + esc(c.et) + '</span></label>' +
          (c.ayuda ? '<div class="ayuda" id="ayuda-' + esc(c.id) + '">' + esc(c.ayuda) + '</div>' : '') + '<div class="err" id="error-' + esc(c.id) + '" aria-live="polite"></div></div>';
      case 'area':
        inner = '<textarea class="inp" id="campo-' + esc(c.id) + '" data-c="' + esc(c.id) + '"' + descr + (c.req ? ' aria-required="true"' : '') + ' placeholder="' + esc(c.ph || '') + '">' + esc(v) + '</textarea>';
        break;
      case 'calc':
        return '<div class="campo" data-campo="' + c.id + '"><div class="calc" data-calc="' + c.id + '"></div></div>';
      case 'html':
        return '<div class="campo" data-campo="' + c.id + '">' + (typeof c.html === 'function' ? c.html(vals) : c.html) + '</div>';
      default: {
        const t = { num: 'text', tel: 'tel', dni: 'tel', pin: 'password', fecha: 'date', texto: 'text', codigo: 'text', correo: 'email' }[c.tipo] || 'text';
        const im = { num: ' inputmode="decimal"', tel: ' inputmode="numeric" maxlength="9"', dni: ' inputmode="numeric" maxlength="8"', pin: ' inputmode="numeric" maxlength="4"',
          codigo: ' inputmode="numeric" maxlength="10" autocomplete="one-time-code"', correo: ' inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"' }[c.tipo] || '';
        inner = '<input class="inp" id="campo-' + esc(c.id) + '" type="' + t + '"' + im + ' data-c="' + esc(c.id) + '"' + descr + (c.req ? ' aria-required="true"' : '') + ' value="' + esc(v) + '" placeholder="' + esc(c.ph || '') + '"' +
          (c.foco ? ' autofocus' : '') + ' autocomplete="off">';
      }
    }
    const etiqueta = c.tipo === 'seg' || c.tipo === 'multi' ? '<div class="et" id="etiqueta-' + esc(c.id) + '">' + esc(c.et) + req + '</div>' : '<label class="et" id="etiqueta-' + esc(c.id) + '" for="campo-' + esc(c.id) + '">' + esc(c.et) + req + '</label>';
    return '<div class="campo" data-campo="' + esc(c.id) + '">' + etiqueta + inner +
      (c.ayuda ? '<div class="ayuda" id="ayuda-' + esc(c.id) + '">' + esc(c.ayuda) + '</div>' : '') + '<div class="err" id="error-' + esc(c.id) + '" aria-live="polite"></div></div>';
  }

  // Agrupa campos marcados con "par" en filas de dos columnas.
  let cuerpo = '';
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    if (c.par && campos[i + 1]) { cuerpo += '<div class="fila2">' + htmlCampo(c) + htmlCampo(campos[i + 1]) + '</div>'; i++; }
    else cuerpo += htmlCampo(c);
  }

  const h = abrirHoja(cabHoja(cfg.titulo) + (cfg.aviso ? '<div class="aviso tono-warn">' + ico('alerta', 's') + '<div>' + cfg.aviso + '</div></div>' : '') +
    '<form novalidate>' + cuerpo + '<div class="pie">' +
    (cfg.eliminar ? '<button type="button" class="btn peligro" data-x="del" style="flex:0 0 auto">' + ico('borrar') + '</button>' : '') +
    '<button type="button" class="btn" data-x="cancel">Cancelar</button><button type="submit" class="btn pri">' + esc(cfg.guardar || 'Guardar') + '</button></div></form>',
    { sinFondoCerrar: true });

  function leer(c) {
    const el = h.querySelector('[data-c="' + c.id + '"]');
    if (!el) return vals[c.id];
    if (c.tipo === 'chk') return el.checked;
    if (c.tipo === 'seg') { const b = el.querySelector('.on'); return b ? b.dataset.v : ''; }
    if (c.tipo === 'multi') return $$('.on', el).map(b => b.dataset.v);
    const v = el.value.trim();
    if (c.tipo === 'num') return num(v);
    return v;
  }
  function refrescar(origen) {
    for (const c of campos) if (!['calc', 'html'].includes(c.tipo)) vals[c.id] = leer(c);
    for (const c of campos) {
      const box = h.querySelector('[data-campo="' + c.id + '"]');
      if (!box) continue;
      if (c.ver) box.classList.toggle('hidden', !c.ver(vals));
      if (typeof c.ops === 'function' && c.id !== origen && (c.tipo === 'select' || c.tipo === 'seg')) {
        const ops = opsDe(c).map(normOp);
        if (!ops.some(o => String(o.v) === String(vals[c.id]))) vals[c.id] = ops.length && !c.ph ? ops[0].v : '';
        const nuevo = document.createElement('div');
        nuevo.innerHTML = htmlCampo(c);
        const viejoCtl = box.querySelector('[data-c]'), nuevoCtl = nuevo.querySelector('[data-c]');
        if (viejoCtl && nuevoCtl && viejoCtl.outerHTML !== nuevoCtl.outerHTML) viejoCtl.replaceWith(nuevoCtl);
      }
      if (c.tipo === 'calc') box.querySelector('.calc').innerHTML = c.calc(vals);
      if (c.tipo === 'html' && typeof c.html === 'function') box.innerHTML = c.html(vals);
    }
    if (cfg.alCambiar) cfg.alCambiar(vals, origen, h);
  }
  h.addEventListener('input', e => { if (e.target.dataset.c) refrescar(e.target.dataset.c); });
  h.addEventListener('change', e => { if (e.target.dataset.c) refrescar(e.target.dataset.c); });
  h.addEventListener('click', e => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    const g = b.parentElement;
    if (g.dataset.multi) b.classList.toggle('on');
    else { $$('button', g).forEach(x => x.classList.remove('on')); b.classList.add('on'); }
    $$('button', g).forEach(x => x.setAttribute('aria-pressed', x.classList.contains('on') ? 'true' : 'false'));
    refrescar(g.dataset.c);
  });
  h.querySelector('[data-x=cancel]').onclick = () => cerrarHoja();
  if (cfg.eliminar) h.querySelector('[data-x=del]').onclick = () => cfg.eliminar();

  h.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    refrescar();
    let primero = null;
    for (const c of campos) {
      const box = h.querySelector('[data-campo="' + c.id + '"]');
      if (!box || box.classList.contains('hidden') || ['calc', 'html'].includes(c.tipo)) continue;
      const v = vals[c.id];
      let err = '';
      const vacio = v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length) || (c.tipo === 'chk' && c.req && !v);
      if (c.req && vacio) err = c.tipo === 'select' || c.tipo === 'seg' || c.tipo === 'multi' ? 'Elige una opción' : 'Este dato es obligatorio';
      else if (!vacio) {
        if (c.tipo === 'num') {
          if (isNaN(v)) err = 'Escribe un número válido';
          else if (c.min !== undefined && v < c.min) err = 'Debe ser ' + c.min + ' o más';
          else if (c.max !== undefined && v > c.max) err = 'Debe ser ' + c.max + ' o menos';
        }
        if (c.tipo === 'tel' && !/^9\d{8}$/.test(v)) err = 'El celular debe tener 9 dígitos y empezar con 9';
        if (c.tipo === 'dni' && !/^\d{8}$/.test(v)) err = 'El DNI debe tener 8 dígitos';
        if (!err && c.valida) err = c.valida(v, vals) || '';
      }
      box.querySelector('.err').textContent = err;
      const ctl = box.querySelector('.inp');
      const accesible = ctl || box.querySelector('[data-c]');
      if (ctl) ctl.classList.toggle('mal', !!err);
      if (accesible) {
        if (err) accesible.setAttribute('aria-invalid', 'true');
        else accesible.removeAttribute('aria-invalid');
      }
      if (err && !primero) primero = box;
    }
    if (primero) {
      primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const campo = primero.querySelector('.inp, [data-c] button, [data-c]');
      if (campo) campo.focus({ preventScroll: true });
      vibrar(40); return;
    }
    const salida = Object.assign({}, vals);
    for (const c of campos) {
      const box = h.querySelector('[data-campo="' + c.id + '"]');
      if (box && box.classList.contains('hidden')) delete salida[c.id];
      if (['calc', 'html'].includes(c.tipo)) delete salida[c.id];
    }
    if (h._guardando) return; // evita doble toque mientras se guarda (p. ej. esperando internet)
    h._guardando = true;
    const btn = h.querySelector('button[type=submit]');
    const txtBtn = btn.textContent; btn.textContent = 'Guardando…'; btn.style.opacity = '.7';
    let r;
    try { r = await cfg.alGuardar(salida); }
    catch (e) { console.error('No se pudo guardar el formulario', e); toast('No se pudo guardar. Inténtalo de nuevo.', 'error'); return; }
    finally { h._guardando = false; btn.textContent = txtBtn; btn.style.opacity = ''; }
    if (r === false) return;
    if (typeof r === 'string') { toast(r, 'error'); return; }
    cerrarHoja();
  });
  refrescar();
  if (cfg.alAbrir) cfg.alAbrir(h, refrescar);
  return h;
}

/* ---------- Piezas ---------- */
const vacio = (icono, texto, extra) => '<div class="vacio">' + ico(icono) + '<div>' + texto + '</div>' + (extra || '') + '</div>';
const pill = (txt, tono) => '<span class="pill tono-' + (tono || 'info') + '">' + esc(txt) + '</span>';
function enlaceWhatsApp(cel, texto) {
  const n = String(cel || '').replace(/\D/g, '');
  return 'https://wa.me/' + (n.length === 9 ? '51' + n : n) + (texto ? '?text=' + encodeURIComponent(texto) : '');
}
function abrirExterno(url) { if (NATIVO) Android.abrir(url); else window.open(url, '_blank'); }
function compartirTexto(txt) {
  if (NATIVO) Android.compartir(txt);
  else if (navigator.share) navigator.share({ text: txt }).catch(() => { });
  else { navigator.clipboard && navigator.clipboard.writeText(txt); toast('Texto copiado'); }
}
