'use strict';
/* ==========================================================================
   MI-CHACRA · Cuentas personales (Etapa 6 · Fase 1)
   - Cada persona entra con su propia cuenta: correo con código o Google.
   - La sesión se guarda aparte de los datos (no viaja en las copias de seguridad).
   - Un "espacio" = los datos de un dueño. La sincronización v2 va por espacio.
   ========================================================================== */

const CLAVE_SESION = 'michacra_sesion';
const CLAVE_PKCE = 'michacra_pkce';
const RETORNO_APP = 'pe.michacra.app://auth';

const CUENTA = {
  _ses: undefined,
  _ajustes: null,

  ses() {
    if (this._ses === undefined) { try { this._ses = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); } catch (e) { this._ses = null; } }
    return this._ses;
  },
  guardarSes(s) {
    this._ses = s ? { access: s.access_token, refresh: s.refresh_token, vence: Date.now() + (Number(s.expires_in) || 3600) * 1000, email: (s.user && s.user.email) || '', uid: (s.user && s.user.id) || '' } : null;
    try { if (this._ses) localStorage.setItem(CLAVE_SESION, JSON.stringify(this._ses)); else localStorage.removeItem(CLAVE_SESION); } catch (e) { }
  },
  activa() { return !!(this.ses() && this.ses().refresh); },
  email() { return (this.ses() && this.ses().email) || ''; },

  async pedir(ruta, cuerpo, token, metodo) {
    let r;
    try {
      r = await fetch(NUBE_URL + '/auth/v1/' + ruta, {
        method: metodo || 'POST',
        headers: Object.assign({ apikey: NUBE_KEY, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
    } catch (e) { const err = new Error('Sin conexión a internet'); err.red = true; throw err; }
    const t = await r.text();
    let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
    if (!r.ok) {
      const m = (j && (j.msg || j.error_description || j.message || j.error)) || ('Error ' + r.status);
      const err = new Error(traducirError(m)); err.status = r.status; throw err;
    }
    return j;
  },

  /** Devuelve un token vigente; lo renueva si está por vencer. */
  async token() {
    const s = this.ses();
    if (!s) throw new Error('Inicia sesión con tu cuenta');
    if (s.access && s.vence - Date.now() > 60000) return s.access;
    try {
      const j = await this.pedir('token?grant_type=refresh_token', { refresh_token: s.refresh });
      this.guardarSes(j);
      return this._ses.access;
    } catch (e) {
      if (e.red) throw e;
      this.guardarSes(null);
      const err = new Error('Tu sesión venció. Vuelve a entrar con tu cuenta.'); err.sesion = true; throw err;
    }
  },

  async rpc(fn, args) {
    const tk = await this.token();
    let r;
    try {
      r = await fetch(NUBE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: NUBE_KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    } catch (e) { const err = new Error('Sin conexión a internet'); err.red = true; throw err; }
    const t = await r.text();
    if (!r.ok) {
      let m = t; try { const j = JSON.parse(t); m = j.message || j.hint || t; } catch (e) { }
      if (r.status === 404) m = 'Falta preparar la nube nueva (nube-v2-fase1.sql).';
      if (r.status === 401) { this.guardarSes(null); m = 'Tu sesión venció. Vuelve a entrar con tu cuenta.'; }
      throw new Error(m);
    }
    return t ? JSON.parse(t) : null;
  },

  /** Métodos de ingreso disponibles en el servidor (para saber si Google está activo). */
  async ajustes() {
    if (this._ajustes) return this._ajustes;
    try { this._ajustes = await this.pedir('settings', null, null, 'GET'); } catch (e) { this._ajustes = null; }
    return this._ajustes;
  },

  /* ---------- Correo: enlace para tocar (y código, si la plantilla lo incluye) ---------- */
  async retoPkce() {
    const verificador = aleatorio(64);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
    try { localStorage.setItem(CLAVE_PKCE, verificador); } catch (e) { }
    return aBase64(hash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  retorno() { return NATIVO ? RETORNO_APP : location.origin + location.pathname.replace(/index\.html$/, ''); },
  async pedirCodigo(email) {
    const reto = await this.retoPkce();
    return this.pedir('otp?redirect_to=' + encodeURIComponent(this.retorno()),
      { email, create_user: true, code_challenge: reto, code_challenge_method: 's256' });
  },
  async verificarCodigo(email, codigo) {
    const j = await this.pedir('verify', { type: 'email', email, token: codigo });
    this.guardarSes(j);
  },

  /* ---------- Google (flujo PKCE, sin librerías) ---------- */
  async google() {
    const reto = await this.retoPkce();
    const url = NUBE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(this.retorno()) +
      '&code_challenge=' + reto + '&code_challenge_method=s256';
    if (NATIVO) Android.abrir(url); else location.href = url;
  },
  /** Termina el ingreso con Google cuando el navegador vuelve con ?code=… */
  async terminarGoogle(enlace) {
    const u = new URL(enlace.replace(/^pe\.michacra\.app:\/\//, 'https://retorno/'));
    const p = new URLSearchParams(u.search + '&' + u.hash.replace(/^#/, ''));
    if (p.get('error')) throw new Error(traducirError(p.get('error_description') || p.get('error')));
    const codigo = p.get('code');
    if (!codigo) return false;
    let verificador = null; try { verificador = localStorage.getItem(CLAVE_PKCE); localStorage.removeItem(CLAVE_PKCE); } catch (e) { }
    if (!verificador) throw new Error('Abre el enlace en el mismo celular donde pediste entrar, o vuelve a intentarlo.');
    const j = await this.pedir('token?grant_type=pkce', { auth_code: codigo, code_verifier: verificador });
    this.guardarSes(j);
    return true;
  },

  async salir() {
    const s = this.ses();
    if (s && s.access) { try { await this.pedir('logout', null, s.access); } catch (e) { } }
    this.guardarSes(null);
  },
};

function traducirError(m) {
  const t = String(m || '');
  if (/rate limit|too many|security purposes/i.test(t)) return 'Espera un momento antes de pedir otro código.';
  if (/expired|invalid.*(otp|token)|token has expired/i.test(t)) return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (/provider is not enabled|Unsupported provider/i.test(t)) return 'El ingreso con Google aún no está activado. Usa tu correo.';
  if (/invalid.*email|email.*invalid/i.test(t)) return 'Revisa el correo: no parece válido.';
  if (/Signups not allowed/i.test(t)) return 'Por ahora no se aceptan cuentas nuevas.';
  return t;
}

/* ---------- Ingreso con correo ---------- */
ACC.entrarCorreo = () => {
  formulario({
    titulo: 'Entrar con mi correo', valores: {},
    aviso: 'Te enviaremos un correo para entrar. No necesitas contraseña.',
    campos: [{ id: 'email', et: 'Tu correo', tipo: 'correo', req: true, foco: true, ph: 'nombre@gmail.com',
      valida: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Escribe un correo válido' }],
    guardar: 'Enviarme el correo',
    alGuardar: async x => {
      const email = x.email.trim().toLowerCase();
      try { await CUENTA.pedirCodigo(email); } catch (e) { return e.message; }
      cerrarTodas(); pedirCodigoCorreo(email);
      return false;
    },
  });
};
function pedirCodigoCorreo(email) {
  formulario({
    titulo: 'Revisa tu correo', valores: {},
    aviso: 'Te enviamos un correo a <b>' + esc(email) + '</b>.<br>• <b>Toca el enlace</b> del correo <b>en este mismo ' + (NATIVO ? 'celular' : 'navegador') + '</b> y entrarás solo.<br>• Si el correo trae un <b>código</b>, escríbelo aquí.<br>Si no aparece, revisa spam o promociones.',
    campos: [{ id: 'codigo', et: 'Código (si el correo lo trae)', tipo: 'codigo', req: true, foco: false, ph: '123456',
      valida: v => /^\d{6,10}$/.test(String(v).trim()) ? '' : 'El código tiene 6 dígitos' }],
    guardar: 'Entrar',
    alGuardar: async x => {
      try { await CUENTA.verificarCodigo(email, String(x.codigo).trim()); } catch (e) { return e.message; }
      cerrarTodas(); toast('Entraste como ' + email);
      await trasEntrar();
      return false;
    },
  });
}

ACC.entrarGoogle = async () => {
  const a = await CUENTA.ajustes();
  if (a && a.external && a.external.google === false) return toast('El ingreso con Google aún no está activado. Usa tu correo.', 'error');
  try { await CUENTA.google(); } catch (e) { toast(e.message, 'error'); }
};

/** Android llama esto al volver de Google; en la web se revisa la dirección al abrir. */
window.alVolverAuth = async () => {
  let enlace = null;
  if (NATIVO && Android.enlacePendiente) enlace = Android.enlacePendiente();
  else if (/[?&#](code|error)=/.test(location.search + location.hash) && (function () { try { return !!localStorage.getItem(CLAVE_PKCE); } catch (e) { return false; } })()) enlace = location.href;
  if (!enlace) return;
  if (!NATIVO) history.replaceState(null, '', location.pathname + '#/');
  try {
    if (await CUENTA.terminarGoogle(enlace)) { toast('Entraste como ' + CUENTA.email()); await trasEntrar(); }
  } catch (e) { toast(e.message, 'error'); }
};

/* ---------- Después de entrar: elegir, crear o unir un espacio ---------- */
async function trasEntrar() {
  let espacios;
  try { espacios = await CUENTA.rpc('mc2_mis_espacios') || []; } catch (e) { return toast(e.message, 'error'); }
  const n = DB.d.nube;
  if (n && n.v === 2 && n.activa) { await NUBE.sincronizar(); return render(); }
  const tengoDatos = DB.todos('usuarios').length > 0;
  if (!tengoDatos) {
    if (!espacios.length) { toast('Ahora crea tu chacra'); return ACC.configurar(); }
    if (espacios.length === 1) return conectarEspacio(espacios[0], false);
    return elegirEspacio(espacios, false);
  }
  return elegirEspacio(espacios, true);
}

/** Muestra los espacios de la cuenta. conDatos: este celular ya tiene datos que se subirán. */
function elegirEspacio(espacios, conDatos) {
  const v1 = DB.d.nube && DB.d.nube.activa && DB.d.nube.v !== 2;
  const h = abrirHoja(cabHoja(conDatos ? 'Guardar mis datos en mi cuenta' : 'Elige tu espacio') +
    (conDatos ? '<p class="muted small" style="margin:0 0 10px">Los datos de este celular se subirán a tu cuenta (' + esc(CUENTA.email()) + ').</p>' : '') +
    (v1 ? '<div class="aviso tono-warn small">' + ico('alerta', 's') + '<div>Este celular usaba la nube antigua con código. Los otros celulares conectados con ese código dejarán de recibir tus cambios hasta que los invites (próxima versión).</div></div>' : '') +
    espacios.map((e, i) => '<button class="fila card" style="margin:0 0 8px;text-align:left;width:100%" data-i="' + i + '"><span class="avatar">' + esc(iniciales(e.nombre)) + '</span>' +
      '<div class="cuerpo-f"><div class="t">' + esc(e.nombre) + '</div><div class="d">' + (e.dueno ? 'Dueño' : esc(e.rol)) + ' · ' + cant(e.registros) + ' registros' + (conDatos ? ' · se juntarán con los de este celular' : '') + '</div></div>' + ico('der') + '</button>').join('') +
    (conDatos ? '<button class="btn pri bloque" data-nuevo="1" style="margin-top:6px">' + ico('mas') + 'Crear un espacio nuevo con estos datos</button>' : '') +
    '<button class="btn ghost bloque" data-x="no" style="margin-top:6px">Ahora no</button>');
  h.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-i],[data-nuevo],[data-x]');
    if (!b) return;
    cerrarTodas();
    if (b.dataset.x) return;
    if (b.dataset.nuevo) return crearEspacioConDatos();
    await conectarEspacio(espacios[Number(b.dataset.i)], conDatos);
  });
}

async function crearEspacioConDatos(nombre) {
  const ch = DB.todos('chacras')[0];
  nombre = nombre || (ch ? ch.nombre : 'Mi chacra');
  let e;
  try { e = await CUENTA.rpc('mc2_crear_espacio', { p_nombre: nombre }); } catch (err) { return toast(err.message, 'error'); }
  await conectarEspacio({ id: e.id, nombre }, true);
}

async function conectarEspacio(e, subirLocal) {
  // Si venía de la nube antigua, primero traer lo último de allá.
  if (DB.d.nube && DB.d.nube.activa && DB.d.nube.v !== 2) { try { await NUBE.sincronizar(true); } catch (x) { } }
  if (window.guardarCredTienda) window.guardarCredTienda(); // la tienda sigue funcionando después del cambio
  DB.d.nube ={ v: 2, activa: true, espacio: e.id, nombre: e.nombre, version: 0, pend: {} };
  if (subirLocal) NUBE.marcarTodo();
  DB.guardarYa();
  toast(subirLocal ? 'Subiendo tus datos a tu cuenta…' : 'Descargando tus datos…');
  await NUBE.sincronizar();
  if (NUBE.estado === 'error') toast(NUBE.error, 'error');
  else toast(subirLocal ? 'Listo: tus datos están en tu cuenta' : 'Listo. Entra con tu usuario y PIN.');
  if (!DB.usuario) ING.uid = null;
  render();
}

/** Lo llama el asistente inicial: si hay sesión, crea el espacio y sube la chacra nueva. */
window.trasCrearChacra = async nombreChacra => {
  if (!CUENTA.activa() || (DB.d.nube && DB.d.nube.activa)) return;
  await crearEspacioConDatos(nombreChacra);
};

ACC.cuentaSalir = async () => {
  const pend = NUBE.pendientes();
  if (!(await confirmar('Cerrar sesión en este celular', 'Tus datos se quedan en este celular, pero ya no se sincronizarán hasta que vuelvas a entrar.' + (pend ? ' <b>Hay ' + pend + ' cambios sin subir.</b>' : ''), { si: 'Cerrar sesión', peligro: !!pend }))) return;
  await CUENTA.salir();
  if (DB.d.nube && DB.d.nube.v === 2) { DB.d.nube = null; NUBE.estado = 'apagada'; DB.guardarYa(); }
  render(); toast('Sesión cerrada');
};

ACC.cuentaEspacios = async () => {
  let espacios;
  try { espacios = await CUENTA.rpc('mc2_mis_espacios') || []; } catch (e) { return toast(e.message, 'error'); }
  elegirEspacio(espacios, DB.todos('usuarios').length > 0);
};
