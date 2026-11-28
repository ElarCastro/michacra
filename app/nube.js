'use strict';
/* ==========================================================================
   MI-CHACRA · Nube (Etapa 4)
   Sincroniza los datos entre celulares usando Supabase (gratis para empezar).
   - Cada registro viaja completo con su marca "mod" (milisegundos del último cambio).
   - Gana el cambio más reciente de cada registro (no se mezclan campos).
   - Funciona sin señal: los cambios quedan pendientes y se suben cuando vuelve internet.
   - La clave de la cuenta nunca se guarda en el servidor: allá solo queda su huella (bcrypt).
   ========================================================================== */

const SYNC_COLS = Object.keys(NOMBRES_COL).concat(['historial']);
const SYNC_DOCS = ['precios', 'cliente']; // documentos sueltos que también viajan
const LOTE_SUBIDA = 250, LOTE_BAJADA = 800;
/* Servidor de MI-CHACRA (Supabase de CHINCARMAS). La clave pública puede ir en la app. */
const NUBE_URL = 'https://tucjyenxczngmrtorzkp.supabase.co';
const NUBE_KEY = 'sb_publishable_XVmiFHu_Zqa9CMShsP2NhQ_fgJEBhD1';

const NUBE = {
  estado: 'apagada', // apagada | ok | pendiente | sincronizando | error | sinred
  error: '',
  ocupado: false,
  _t: null,

  cfg() { return DB.d.nube || null; },
  /** v2 = cuenta personal + espacio (Etapa 6). v1 = nube antigua con código compartido. */
  esV2() { const n = this.cfg(); return !!(n && n.v === 2); },
  activa() {
    const n = this.cfg();
    if (!n || !n.activa) return false;
    if (n.v === 2) return !!(n.espacio && CUENTA.activa());
    return !!(n.url && n.key && n.cuenta && n.clave);
  },
  /** Sube un lote: v2 con la sesión de la persona; v1 con código y clave. */
  subirLote(envio) {
    const n = this.cfg();
    return n.v === 2 ? CUENTA.rpc('mc2_subir', { p_espacio: n.espacio, p_registros: envio })
      : this.rpc('mc_subir', { p_cuenta: n.cuenta, p_clave: n.clave, p_registros: envio });
  },
  bajarLote() {
    const n = this.cfg();
    return n.v === 2 ? CUENTA.rpc('mc2_bajar', { p_espacio: n.espacio, p_desde: n.version || 0, p_limite: LOTE_BAJADA })
      : this.rpc('mc_bajar', { p_cuenta: n.cuenta, p_clave: n.clave, p_desde: n.version || 0, p_limite: LOTE_BAJADA });
  },
  pendientes() { const n = this.cfg(); return n && n.pend ? Object.keys(n.pend).length : 0; },

  async rpc(fn, args, cfg) {
    const n = cfg || this.cfg();
    const url = n.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn;
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { apikey: n.key, Authorization: 'Bearer ' + n.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    } catch (e) { const err = new Error('Sin conexión a internet'); err.red = true; throw err; }
    const t = await r.text();
    if (!r.ok) {
      let m = t; try { const j = JSON.parse(t); m = j.message || j.hint || t; } catch (e) { }
      if (r.status === 404) m = 'No se encontró la base de datos de MI-CHACRA. ¿Ejecutaste el archivo nube.sql en Supabase?';
      if (r.status === 401) m = 'La clave pública (anon key) no es válida';
      throw new Error(m);
    }
    return t ? JSON.parse(t) : null;
  },

  /** Programa una sincronización pronto (se llama después de cada guardado). */
  programar(ms) {
    if (!this.activa()) return;
    if (!this.ocupado) this.estado = this.pendientes() ? 'pendiente' : this.estado;
    pintarIndicador();
    clearTimeout(this._t);
    this._t = setTimeout(() => this.sincronizar(), ms === undefined ? 4000 : ms);
  },

  /* ---------- Cifrado de extremo a extremo (AES-GCM con llave derivada de la clave de la cuenta) ---------- */
  async llave() {
    const n = this.cfg(), id = n.cuenta + '|' + n.clave;
    if (this._llave && this._llaveDe === id) return this._llave;
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(n.clave), 'PBKDF2', false, ['deriveKey']);
    this._llave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('michacra|' + n.cuenta), iterations: 120000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    this._llaveDe = id;
    return this._llave;
  },
  async cifrar(obj) {
    if (!this.cfg().cifrado) return obj;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.llave(), new TextEncoder().encode(JSON.stringify(obj))));
    const b = new Uint8Array(12 + ct.length); b.set(iv); b.set(ct, 12);
    return { e: aBase64(b) };
  },
  async descifrar(data) {
    if (!data || typeof data.e !== 'string') return data;
    try {
      const b = Uint8Array.from(atob(data.e), c => c.charCodeAt(0));
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await this.llave(), b.slice(12));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { throw new Error('No se pudieron leer los datos de la nube (el código de conexión no coincide)'); }
  },

  registroDe(col, id) {
    if (SYNC_DOCS.includes(col)) return DB.d[col] ? { col, id, data: DB.d[col], mod: DB.d[col]._mod || 0 } : null;
    const r = (DB.d[col] || []).find(x => x.id === id);
    return r ? { col, id, data: r, mod: r.mod || r.ts || r.creado || 0 } : null;
  },

  async sincronizar(silencioso) {
    if (!this.activa() || this.ocupado) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.estado = 'sinred'; pintarIndicador(); return; }
    this.ocupado = true; this.estado = 'sincronizando'; pintarIndicador();
    const n = this.cfg();
    let bajados = 0;
    let rehacer = false;
    try {
      // v2: revisar mis permisos. Si el dueño los cambió, se vuelve a descargar todo con los nuevos.
      if (n.v === 2) {
        const acc = await CUENTA.rpc('mc2_mi_acceso', { p_espacio: n.espacio });
        const huella = JSON.stringify(acc);
        if (n.permisos && n.permisos !== huella) rehacer = true;
        n.permisos = huella;
      }
      // 1) Subir lo pendiente
      const claves = Object.keys(n.pend || {});
      for (let i = 0; i < claves.length; i += LOTE_SUBIDA) {
        const lote = claves.slice(i, i + LOTE_SUBIDA).map(k => { const [col, ...resto] = k.split('|'); return this.registroDe(col, resto.join('|')); }).filter(Boolean);
        const envio = [];
        for (const reg of lote) envio.push({ col: reg.col, id: reg.id, mod: reg.mod, data: await this.cifrar(reg.data) });
        if (envio.length) await this.subirLote(envio);
        for (const reg of lote) { const k = reg.col + '|' + reg.id; const act = this.registroDe(reg.col, reg.id); if (!act || act.mod === reg.mod) delete n.pend[k]; }
        for (const k of claves.slice(i, i + LOTE_SUBIDA)) if (!lote.find(r => r.col + '|' + r.id === k)) delete n.pend[k];
      }
      // Permisos cambiados: empezar de cero con lo que ahora me corresponde (lo pendiente ya se subió).
      if (rehacer) {
        const yo = DB.usuario && DB.usuario.id;
        DB.d = DB.nuevo(); DB.d.nube = n; n.version = 0; n.pend = {};
        this._rehecho = yo || true;
      }
      // 2) Bajar lo nuevo de otros celulares
      for (let vueltas = 0; vueltas < 200; vueltas++) {
        const filas = await this.bajarLote() || [];
        if (!filas.length) break;
        for (const f of filas) { f.data = await this.descifrar(f.data); if (this.aplicar(f)) bajados++; n.version = Math.max(n.version || 0, Number(f.version) || 0); }
        if (filas.length < LOTE_BAJADA) break;
      }
      if (bajados) this.despuesDeBajar();
      n.ultima = Date.now();
      this.error = '';
      this.estado = this.pendientes() ? 'pendiente' : 'ok';
    } catch (e) {
      this.error = e.message;
      this.estado = e.red ? 'sinred' : 'error';
      if (/^ACCESO_QUITADO/.test(e.message)) this._quitado = true;
      if (!silencioso && !e.red) console.warn('Nube:', e.message);
    } finally {
      this.ocupado = false;
      if (this._quitado) { this._quitado = false; if (window.accesoQuitado) window.accesoQuitado(); return 0; }
      if (this._rehecho) {
        const yo = this._rehecho; this._rehecho = null;
        DB.completar();
        DB.usuario = typeof yo === 'string' ? DB.get('usuarios', yo) : null;
        if (DB.usuario) { const vis = DB.chacrasVisibles(); if (!vis.find(c => c.id === DB.chacraId)) DB.chacraId = vis[0] ? vis[0].id : null; }
        toast('Tus permisos cambiaron: la información se actualizó');
        bajados = bajados || 1;
      }
      DB.guardarYa();
      pintarIndicador();
      if (bajados && !PILA.length && DB.usuario) { const y = window.scrollY; render(); window.scrollTo(0, y); }
      if (this.pendientes() && this.estado === 'pendiente') this.programar(15000);
    }
    return bajados;
  },

  /** Mezcla un registro que llegó de la nube. Devuelve true si cambió algo aquí. */
  aplicar(f) {
    const n = this.cfg(), k = f.col + '|' + f.id, mod = Number(f.mod) || 0;
    if (SYNC_DOCS.includes(f.col)) {
      if (n.pend && n.pend[k] && ((DB.d[f.col] || {})._mod || 0) > mod) return false;
      DB.d[f.col] = f.data || {}; if (n.pend) delete n.pend[k]; return true;
    }
    if (!SYNC_COLS.includes(f.col) || !DB.d[f.col]) return false;
    const arr = DB.d[f.col], i = arr.findIndex(x => x.id === f.id);
    if (i < 0) {
      if (f.data && f.data.eliminado && f.data.eliminado < Date.now() - DIAS_PAPELERA * 864e5) return false;
      arr.push(f.data); return true;
    }
    const loc = arr[i], locMod = loc.mod || loc.ts || loc.creado || 0;
    if (locMod > mod) return false; // lo de aquí es más nuevo: se subirá
    if (locMod === mod && JSON.stringify(loc) === JSON.stringify(f.data)) { if (n.pend) delete n.pend[k]; return false; }
    arr[i] = f.data;
    if (n.pend) delete n.pend[k];
    return true;
  },

  despuesDeBajar() {
    DB.d.historial.sort((a, b) => b.ts - a.ts);
    if (DB.usuario && !DB.usuario.esTrabajador) {
      const u = DB.get('usuarios', DB.usuario.id);
      if (u && !u.eliminado && u.activo !== false) DB.usuario = u;
    }
    DB.completar();
  },

  /** Marca todo como pendiente (primera subida o al unirse con datos propios). */
  marcarTodo() {
    const n = this.cfg(); n.pend = n.pend || {};
    for (const col of SYNC_COLS) for (const r of DB.d[col] || []) { if (!r.mod) r.mod = r.ts || r.editado || r.creado || Date.now(); n.pend[col + '|' + r.id] = 1; }
    for (const doc of SYNC_DOCS) {
      if (!DB.d[doc]) continue;
      if (!DB.d[doc]._mod) DB.d[doc]._mod = Date.now();
      n.pend[doc + '|' + doc] = 1;
    }
  },

  codigoConexion() {
    const n = this.cfg();
    return 'MICHACRA1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: n.url, k: n.key, c: n.cuenta, s: n.clave, n: n.nombre || '', x: n.cifrado ? 1 : 0 }))));
  },
  leerCodigo(txt) {
    const m = String(txt || '').trim().match(/MICHACRA1:([A-Za-z0-9+/=]+)/);
    if (!m) throw new Error('El código no es válido. Debe empezar con MICHACRA1:');
    const j = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (!j.u || !j.k || !j.c || !j.s) throw new Error('El código está incompleto');
    return { url: j.u, key: j.k, cuenta: j.c, clave: j.s, nombre: j.n || '', cifrado: !!j.x };
  },
};

const aleatorio = n => { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };

/* ---------- Indicador en la barra superior ---------- */
function htmlIndicador() {
  if (!NUBE.activa()) return '';
  const p = NUBE.pendientes();
  const ic = { ok: 'nube_ok', pendiente: 'nube_subir', sincronizando: 'restaurar', error: 'nube_off', sinred: 'nube_off', apagada: 'nube_off' }[NUBE.estado] || 'nube_ok';
  const color = { ok: 'var(--green)', pendiente: 'var(--amber-text)', sincronizando: 'var(--muted)', error: 'var(--red)', sinred: 'var(--faint)' }[NUBE.estado] || 'var(--muted)';
  return '<button class="icon-btn nube-ind' + (NUBE.estado === 'sincronizando' ? ' girando' : '') + '" data-act="ir" data-ruta="nube" aria-label="Nube" style="color:' + color + '">' + ico(ic) +
    (p && NUBE.estado !== 'sincronizando' ? '<span class="num-p">' + (p > 99 ? '99+' : p) + '</span>' : '') + '</button>';
}
function pintarIndicador() { const el = $('#indNube'); if (el) el.innerHTML = htmlIndicador(); }

/* ---------- Pantalla de la nube ---------- */
VISTAS.nube = () => {
  const n = NUBE.cfg();
  const esDueno = DB.usuario && DB.usuario.dueno;
  const v2 = NUBE.esV2();
  let h = '';
  const estado = () => {
    const tot = SYNC_COLS.reduce((s, c) => s + (DB.d[c] || []).length, 0);
    const tono = { ok: 'tono-ok', pendiente: 'tono-warn', error: 'tono-err', sinred: 'tono-info', sincronizando: 'tono-info' }[NUBE.estado] || 'tono-info';
    const txt = { ok: 'Todo está sincronizado', pendiente: NUBE.pendientes() + ' cambio(s) por subir', sincronizando: 'Sincronizando…', error: 'Error: ' + NUBE.error, sinred: 'Sin internet. Los cambios se subirán cuando vuelva la señal.' }[NUBE.estado] || 'Lista';
    return '<div class="aviso ' + tono + '">' + ico(NUBE.estado === 'ok' ? 'check' : 'info', 's') + '<div><b>' + esc(txt) + '</b><div class="small">' +
      (v2 ? 'Espacio: ' + esc(n.nombre || '') : 'Cuenta: ' + esc(n.nombre || n.cuenta)) + (n.ultima ? ' · última vez ' + fechaHora(n.ultima) : '') + '</div></div></div>' +
      '<div class="kpis"><div class="kpi"><div class="l">Registros en este celular</div><div class="v">' + cant(tot) + '</div></div><div class="kpi"><div class="l">Por subir</div><div class="v">' + NUBE.pendientes() + '</div></div></div>' +
      '<button class="btn pri bloque" data-act="nubeSync" style="margin-bottom:10px">' + ico('restaurar') + 'Sincronizar ahora</button>';
  };
  const botonesEntrar = CUENTA.googleActivo()
    ? '<div class="btns" style="margin-bottom:8px"><button class="btn pri" data-act="entrarGoogle">' + ico('google') + 'Entrar con Google</button></div>' +
      '<div class="btns"><button class="btn" data-act="entrarCorreo">' + ico('correo') + 'Entrar con mi correo</button></div>'
    : '<div class="btns"><button class="btn pri" data-act="entrarCorreo">' + ico('correo') + 'Entrar con mi correo</button></div>';

  /* ----- Nube nueva: cuenta personal + espacio ----- */
  if (v2 && NUBE.activa()) {
    h += estado();
    h += '<div class="card"><h3>Mi cuenta</h3><p class="small muted" style="margin:0 0 10px">' + ico('usuario', 's') + ' ' + esc(CUENTA.email()) + '</p>' +
      '<p class="small muted" style="margin:0 0 10px">En otro celular tuyo: instala MI-CHACRA y entra con esta misma cuenta. Tus datos bajan solos, sin códigos.</p>' +
      '<button class="btn chico bloque" data-act="cuentaEspacios" style="margin-bottom:8px">' + ico('cambiar', 's') + 'Cambiar de espacio</button>' +
      '<button class="btn chico bloque" data-act="nubeTodo" style="margin-bottom:8px">Volver a descargar todo de la nube</button>' +
      '<button class="btn chico bloque" data-act="cuentaSalir" style="margin-bottom:8px">' + ico('salir', 's') + 'Cerrar sesión en este celular</button>' +
      (esDueno ? '<button class="btn chico bloque peligro" data-act="nubeEliminar">' + ico('borrar', 's') + 'Eliminar mi cuenta y mis datos de la nube</button>' : '') + '</div>';
    h += esDueno ? '<div class="card"><h3>Tu equipo</h3><p class="small muted" style="margin:0 0 10px">Invita a tu encargado, supervisor u operario para que use la app en <b>su propio celular</b>, con su cuenta y solo con los permisos de su rol.</p>' +
      '<button class="btn bloque" data-act="ir" data-ruta="usuarios">' + ico('personas') + 'Usuarios e invitaciones</button></div>' : '';
    return { titulo: 'Mi cuenta y nube', atras: true, html: h };
  }

  if (!esDueno && !NUBE.activa()) {
    return { titulo: 'Nube', atras: true, html: vacio('candado', 'Solo el dueño puede conectar la nube') };
  }

  /* ----- Sin nube nueva: invitar a entrar con su cuenta ----- */
  if (esDueno) {
    h += '<div class="card"><h3>Mi cuenta</h3>';
    if (v2 && !CUENTA.activa()) h += '<div class="aviso tono-warn small">' + ico('alerta', 's') + '<div>Tu sesión venció. Vuelve a entrar para seguir sincronizando.</div></div>';
    if (CUENTA.activa()) {
      h += '<p class="small muted" style="margin:0 0 10px">' + ico('usuario', 's') + ' ' + esc(CUENTA.email()) + '</p>' +
        '<button class="btn pri bloque" data-act="cuentaEspacios" style="margin-bottom:8px">' + ico('nube_subir') + 'Guardar mis datos en mi cuenta</button>' +
        '<button class="btn chico bloque" data-act="cuentaSalir">' + ico('salir', 's') + 'Cerrar sesión</button>';
    } else {
      h += '<ul class="small" style="margin:0 0 12px;padding-left:18px;color:var(--muted)">' +
        '<li>Tus datos quedan guardados en <b>tu cuenta</b>: si cambias o pierdes el celular, entras y todo vuelve.</li>' +
        '<li>Usa la app en <b>varios celulares</b> con la misma cuenta.</li>' +
        '<li>Sigue funcionando sin señal. Es <b>gratis</b>.</li></ul>' + botonesEntrar;
    }
    h += '</div>';
  }

  /* ----- Nube antigua (con código compartido) ----- */
  if (!v2 && NUBE.activa()) {
    h += '<div class="card"><h3>Nube antigua (con código)</h3><p class="small muted" style="margin:0 0 10px">Este celular sigue conectado con el código compartido. ' +
      (esDueno ? 'Te recomendamos pasar tus datos a tu cuenta personal (arriba) y luego invitar a tu equipo.' : 'Si el dueño ya pasó a su cuenta personal, este celular dejará de recibir cambios: <b>pídele una invitación</b> y toca "Tengo una invitación".') + '</p>' + estado() +
      (!esDueno ? '<button class="btn chico bloque" data-act="tengoInvitacion" style="margin-bottom:8px">' + ico('personas', 's') + 'Tengo una invitación</button>' : '');
    if (esDueno) h += '<button class="btn chico bloque" data-act="nubeCompartir" style="margin-bottom:8px">' + ico('whatsapp', 's') + 'Compartir código de conexión</button>' +
      '<button class="btn chico bloque" data-act="nubeDesconectar" style="margin-bottom:8px">Desconectar este celular</button>' +
      '<button class="btn chico bloque peligro" data-act="nubeEliminar">' + ico('borrar', 's') + 'Eliminar la cuenta antigua de la nube</button>';
    h += '</div>';
  } else if (esDueno && !CUENTA.activa()) {
    h += '<div class="btns"><button class="btn ghost" data-act="nubeUnirse">' + ico('cambiar') + 'Tengo un código de conexión (nube antigua)</button></div>';
  }
  return { titulo: 'Mi cuenta y nube', atras: true, html: h };
};

ACC.nubeSync = async () => { await NUBE.sincronizar(); render(); toast(NUBE.estado === 'ok' ? 'Sincronizado' : NUBE.error || 'Pendiente', NUBE.estado === 'error' ? 'error' : null); };
ACC.nubeCrear = () => {
  formulario({
    titulo: 'Activar la nube', valores: { nombre: (DB.get('chacras', DB.chacraId) || {}).nombre || 'Mi chacra', url: NUBE_URL, key: NUBE_KEY, propio: false },
    campos: [
      { id: 'nombre', et: 'Nombre de tu cuenta', tipo: 'texto', req: true, ayuda: 'Ej. el nombre de tu chacra o tu familia' },
      { id: 'propio', et: 'Usar mi propio servidor Supabase (avanzado)', tipo: 'chk' },
      { id: 'url', et: 'Project URL de Supabase', tipo: 'texto', req: true, ver: x => x.propio, ph: 'https://xxxxxxxx.supabase.co', valida: v => /^https:\/\/\S+$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?\/?$/.test(v) ? '' : 'Debe empezar con https://' },
      { id: 'key', et: 'Clave pública (Publishable key)', tipo: 'area', req: true, ver: x => x.propio, ph: 'sb_publishable_…', valida: v => /^sb_secret_/.test(v.trim()) ? 'Esa es la clave SECRETA. Usa la Publishable key.' : v.trim().length > 30 ? '' : 'La clave es muy corta' },
    ],
    guardar: 'Activar',
    alGuardar: async x => {
      const cfg = { url: (x.propio ? x.url : NUBE_URL).trim(), key: (x.propio ? x.key : NUBE_KEY).replace(/\s+/g, ''), cuenta: 'mc' + aleatorio(10), clave: aleatorio(24), nombre: x.nombre.trim(), cifrado: true };
      try { await NUBE.rpc('mc_crear', { p_cuenta: cfg.cuenta, p_clave: cfg.clave, p_nombre: cfg.nombre }, cfg); }
      catch (e) { return 'No se pudo conectar: ' + e.message; }
      DB.d.nube = Object.assign(cfg, { activa: true, version: 0, pend: {} });
      NUBE.marcarTodo(); DB.guardarYa();
      cerrarTodas(); toast('Conectado. Subiendo tus datos…');
      await NUBE.sincronizar(); render();
      return false;
    },
  });
};
/** Unirse con un código. desdeIngreso: en un celular nuevo, antes de tener usuario. */
ACC.nubeUnirse = el => {
  const desdeIngreso = !!(el && el.dataset && el.dataset.ingreso);
  formulario({
    titulo: 'Unirme a una cuenta', valores: {},
    campos: [{ id: 'codigo', et: 'Código de conexión', tipo: 'area', req: true, ph: 'MICHACRA1:…', ayuda: 'Pídeselo al dueño. Lo envía desde Más → Nube.' }],
    guardar: 'Unirme',
    alGuardar: async x => {
      let cfg;
      try { cfg = NUBE.leerCodigo(x.codigo); } catch (e) { return e.message; }
      try { await NUBE.rpc('mc_bajar', { p_cuenta: cfg.cuenta, p_clave: cfg.clave, p_desde: 0, p_limite: 1 }, cfg); }
      catch (e) { return 'No se pudo conectar: ' + e.message; }
      const teniaDatos = DB.todos('usuarios').length > 0;
      if (teniaDatos && !(await confirmar('Este celular ya tiene datos', 'Los datos de este celular se <b>sumarán</b> a los de la cuenta en la nube. ¿Continuar?', { si: 'Sí, unir' }))) return false;
      DB.d.nube = Object.assign(cfg, { activa: true, version: 0, pend: {} });
      if (teniaDatos) NUBE.marcarTodo();
      DB.guardarYa();
      cerrarTodas(); toast('Conectado. Descargando datos…');
      await NUBE.sincronizar();
      if (NUBE.estado === 'error') toast(NUBE.error, 'error'); else toast('Listo. Ya puedes ingresar con tu usuario y PIN.');
      if (desdeIngreso) { ING.uid = null; } render();
      return false;
    },
  });
};
ACC.nubeCompartir = () => {
  const txt = 'Código para conectar MI-CHACRA (' + (NUBE.cfg().nombre || '') + '):\n\n' + NUBE.codigoConexion() + '\n\nEn la app: "Unirme a una cuenta en la nube" y pega este código.';
  compartirTexto(txt);
};
ACC.nubeTodo = async () => {
  if (!(await confirmar('Volver a descargar todo', 'Se revisarán todos los registros de la nube. Lo que tengas pendiente aquí no se pierde.', { si: 'Descargar' }))) return;
  NUBE.cfg().version = 0; await NUBE.sincronizar(); render(); toast('Revisión completa');
};
ACC.nubeDesconectar = async () => {
  if (!(await confirmar('Desconectar este celular', 'Los datos se quedan en este celular, pero ya no se sincronizarán.' + (NUBE.pendientes() ? ' <b>Hay ' + NUBE.pendientes() + ' cambios sin subir que no llegarán a la nube.</b>' : ''), { si: 'Desconectar', peligro: true }))) return;
  DB.d.nube = null; NUBE.estado = 'apagada'; DB.guardarYa(); render(); toast('Desconectado');
};

/* ---------- Eliminar cuenta (requisito de Google Play) ---------- */
ACC.nubeEliminar = () => {
  formulario({
    titulo: NUBE.esV2() ? 'Eliminar mi cuenta' : 'Eliminar cuenta de la nube',
    aviso: NUBE.esV2()
      ? 'Se borrarán <b>para siempre</b> tu cuenta (' + esc(CUENTA.email()) + ') y todos tus espacios de la nube (chacras, trabajadores, cosecha, pagos, ventas…). Si tienes pedidos en la tienda, se quitarán tu nombre y celular.'
      : 'Se borrarán <b>para siempre</b> de la nube todos los datos de esta cuenta (chacras, trabajadores, cosecha, pagos, ventas…). Los otros celulares conectados dejarán de sincronizar. Si tienes pedidos en la tienda, se quitarán tu nombre y celular.',
    valores: { borrarLocal: false },
    campos: [
      { id: 'confirma', et: 'Para confirmar, escribe ELIMINAR', tipo: 'texto', req: true, valida: v => v.trim().toUpperCase() === 'ELIMINAR' ? '' : 'Escribe ELIMINAR' },
      { id: 'borrarLocal', et: 'Borrar también los datos de este celular', tipo: 'chk', ayuda: 'Si no lo marcas, tus datos se quedan solo en este celular.' },
    ],
    guardar: 'Eliminar para siempre',
    alGuardar: async x => {
      const n = NUBE.cfg();
      try {
        if (n.v === 2) { await CUENTA.rpc('mc2_borrar_cuenta'); CUENTA.guardarSes(null); }
        else await NUBE.rpc('mc_cuenta_borrar', { p_cuenta: n.cuenta, p_clave: n.clave });
        if (DB.d.cliente) await NUBE.rpc('mc_cliente_borrar', { p_tienda: 'chincarmas', p_cliente: DB.d.cliente.id, p_clave: DB.d.cliente.clave }, { url: NUBE_URL, key: NUBE_KEY });
      } catch (e) { return e.red ? 'Necesitas internet para eliminar la cuenta de la nube.' : e.message; }
      clearTimeout(NUBE._t); DB.d.nube = null; DB.d.cliente = null; DB.d.misPedidos = []; NUBE.estado = 'apagada';
      if (x.borrarLocal) { borrarDatosLocales(); return false; }
      DB.guardarYa(); cerrarTodas(); toast('Cuenta eliminada de la nube'); render();
      return false;
    },
  });
};
/** Borra todo lo guardado en este celular y vuelve a la pantalla de bienvenida. */
function borrarDatosLocales() {
  clearTimeout(NUBE._t); clearTimeout(DB._t);
  DB.d = DB.nuevo(); DB.guardarYa();
  if (NATIVO && Android.programarAvisos) Android.programarAvisos('[]');
  try { localStorage.clear(); } catch (e) { }
  location.replace(location.pathname + '#/'); location.reload();
}
ACC.borrarCelular = async () => {
  if (NUBE.activa() && NUBE.pendientes() && !(await confirmar('Hay cambios sin subir', 'Hay ' + NUBE.pendientes() + ' cambios que aún no llegan a la nube y se perderán.', { si: 'Borrar igual', peligro: true }))) return;
  formulario({
    titulo: 'Borrar los datos de este celular',
    aviso: 'Se borrará <b>todo</b> lo guardado en este celular. ' + (NUBE.activa() ? 'Tu cuenta en la nube <b>no</b> se borra: podrás recuperar los datos ' + (NUBE.esV2() ? 'entrando otra vez con tu cuenta.' : 'uniéndote con el código de conexión.') : '<b>No tienes la nube activa: los datos se perderán para siempre.</b> Guarda antes una copia de seguridad.'),
    campos: [{ id: 'confirma', et: 'Para confirmar, escribe BORRAR', tipo: 'texto', req: true, valida: v => v.trim().toUpperCase() === 'BORRAR' ? '' : 'Escribe BORRAR' }],
    guardar: 'Borrar este celular',
    alGuardar: () => { borrarDatosLocales(); return false; },
  });
};

/* ---------- Disparadores ---------- */
window.alGuardarDatos = () => { if (window.programarAvisos) programarAvisos(); NUBE.programar(); };
window.addEventListener('online', () => NUBE.programar(1000));
setInterval(() => { if (DB.usuario && NUBE.activa() && !document.hidden) NUBE.sincronizar(true); }, 120000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && DB.usuario && NUBE.activa()) NUBE.programar(500); });
