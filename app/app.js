'use strict';
/* ==========================================================================
   MI-CHACRA · Arranque, ingreso, menú y navegación
   ========================================================================== */
window.VERSION = '1.7.0';

function aplicarTema() {
  const t = DB.d.config.tema;
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.dataset.tema = t;
}
function seleccionarChacra(id) { DB.chacraId = id; DB.d.ultimaChacra = id; EC._cargado = null; DB.guardar(); }
const ir = r => { location.hash = '#/' + r; };
ACC.ir = el => ir(el.dataset.ruta);
ACC.cerrarHoja = () => cerrarHoja();

/* ---------- Ingreso ---------- */
const ING = { uid: null, pin: '', fallos: 0, esperaHasta: 0 };

function ponerModo(m) { DB.modo = m; if (m === 'tienda') document.documentElement.dataset.modo = 'tienda'; else delete document.documentElement.dataset.modo; }
function iniciarSesion(u) {
  DB.usuario = u;
  ponerModo('chacra');
  const vis = DB.chacrasVisibles();
  const pref = vis.find(c => c.id === DB.d.ultimaChacra) || vis[0];
  if (!pref && !u.esTrabajador && u.tienda) {
    // Vendedor de la tienda sin chacras: entra directo al modo tienda
    DB.chacraId = null; DB.d.ultimoUsuario = u.id; DB.guardar();
    Object.assign(ING, { uid: null, pin: '', fallos: 0 });
    ponerModo('tienda'); location.replace('#/t_panel'); render(); NUBE.programar(600);
    return;
  }
  if (!pref) { DB.usuario = null; toast('No tienes acceso a ninguna chacra. Habla con el dueño.', 'error'); ING.uid = null; return render(); }
  seleccionarChacra(pref.id);
  if (!u.esTrabajador) DB.d.ultimoUsuario = u.id;
  DB.guardar();
  Object.assign(ING, { uid: null, pin: '', fallos: 0 });
  if (u.esTrabajador) location.replace('#/portal');
  else if (!location.hash || location.hash === '#/' || location.hash === '#' || location.hash === '#/portal') location.replace('#/inicio');
  render();
  setTimeout(programarAvisos, 800);
  NUBE.programar(600);
  if (!u.esTrabajador) setTimeout(() => actualizarTienda().then(() => { if (DB.usuario && DB.modo !== 'tienda') { if (location.hash === '#/inicio' && !PILA.length) render(); pedirConsentimiento(); } }), 1500);
}
/** Sesión del portal para un trabajador (o null si su ficha no está o está inactiva). */
function sesionTrabajador(id) {
  const t = DB.get('trabajadores', id);
  return t && !t.eliminado && t.activo !== false ? { id: 't:' + t.id, nombre: t.nombre, esTrabajador: true, trabajadorId: t.id } : null;
}
/** En el celular de un trabajador invitado (Fase 3), id de su ficha. */
function miTrabajador() {
  const n = DB.d.nube;
  return n && n.v === 2 && n.trabajador ? DB.get('trabajadores', n.trabajador) : null;
}
ACC.soyTrabajador = () => {
  if (Date.now() < ING.esperaHasta) return toast('Demasiados intentos. Espera un momento.', 'error');
  formulario({
    titulo: 'Ingreso de trabajador', valores: {},
    campos: [
      { id: 'dni', et: 'Tu DNI', tipo: 'dni', req: true, foco: true },
      { id: 'pin', et: 'Tu PIN', tipo: 'pin', req: true, valida: v => /^\d{4}$/.test(v) ? '' : 'El PIN tiene 4 dígitos' },
    ],
    guardar: 'Entrar',
    alGuardar: async x => {
      const t = DB.todos('trabajadores').find(t => t.dni === x.dni && t.acceso && t.activo !== false);
      if (t && t.pin === await huellaPin(x.pin, t.sal)) {
        cerrarTodas();
        iniciarSesion({ id: 't:' + t.id, nombre: t.nombre, esTrabajador: true, trabajadorId: t.id });
        return false;
      }
      ING.fallos++;
      if (ING.fallos >= 5) { ING.esperaHasta = Date.now() + 30000; ING.fallos = 0; cerrarTodas(); }
      vibrar(120);
      return 'DNI o PIN incorrecto, o no tienes acceso. Pídelo al encargado.';
    },
  });
};
ACC.salir = () => { DB.guardarYa(); DB.usuario = null; ponerModo('chacra'); ING.uid = null; ING.pin = ''; cerrarTodas(); history.replaceState(null, '', '#/'); render(); };

function renderIngreso() {
  const us = DB.todos('usuarios').filter(u => u.activo !== false);
  const logo = '<div class="logo">' + ico('marca') + '</div><div class="marca-t">MI-CHACRA</div>';
  let h;
  const miT = miTrabajador();
  if (miT && (!ING.uid || !String(ING.uid).startsWith('t:'))) { ING.uid = 't:' + miT.id; ING.pin = ''; }
  if (miT && !miT.pin) {
    h = '<div class="ingreso">' + logo + '<p class="center">Hola, <b>' + esc(miT.nombre.split(' ')[0]) + '</b>. Crea tu PIN para ver tus latas y pagos.</p>' +
      '<button class="btn pri bloque" style="margin-top:16px" data-act="trabCrearPin">' + ico('candado') + 'Crear mi PIN</button></div>';
  } else if (miT) {
    const espera = Math.ceil((ING.esperaHasta - Date.now()) / 1000);
    h = '<div class="ingreso"><span class="avatar xl">' + esc(iniciales(miT.nombre)) + '</span><h2 style="margin-top:10px">' + esc(miT.nombre) + '</h2>' +
      '<p class="muted small" id="pinMsg">' + (espera > 0 ? 'Demasiados intentos. Espera ' + espera + ' s.' : 'Escribe tu PIN') + '</p>' +
      '<div class="pin-pts">' + [0, 1, 2, 3].map(i => '<i class="' + (i < ING.pin.length ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="teclado">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '0', '<'].map(k =>
        k === 'x' ? '<span></span>' : '<button data-act="pinTecla" data-k="' + k + '">' + (k === '<' ? ico('izq') : k) + '</button>').join('') + '</div>' +
      '<button class="btn ghost bloque chico" style="margin-top:12px" data-act="trabCrearPin" data-olvide="1">Olvidé mi PIN</button>' +
      '<button class="btn ghost bloque chico" style="margin-top:4px" data-act="trabCerrarSesion">' + ico('salir', 's') + 'Cerrar sesión en este celular</button></div>';
  } else if (!us.length) {
    h = DB.errorCarga
      ? '<div class="ingreso">' + logo + '<p class="center">No se pudieron leer los datos guardados. Para protegerlos, no crees una chacra nueva todavía.</p>' +
        '<div class="aviso tono-warn">' + ico('alerta', 's') + '<div>Recupera una copia de seguridad de MI-CHACRA. Los datos actuales no se han sobrescrito.</div></div>' +
        '<button class="btn pri bloque" data-act="importar">' + ico('subir') + 'Recuperar copia de seguridad</button>' +
        '<input type="file" id="archivoImp" accept=".json,application/json" class="hidden"></div>'
      : CUENTA.activa()
      ? '<div class="ingreso">' + logo + '<p class="center muted">Entraste como <b>' + esc(CUENTA.email()) + '</b>.</p>' +
        '<button class="btn pri bloque" style="margin-top:16px" data-act="cuentaContinuar">' + ico('nube_ok') + 'Continuar</button>' +
        '<button class="btn bloque" style="margin-top:8px" data-act="tengoInvitacion">' + ico('personas') + 'Tengo una invitación</button>' +
        '<button class="btn ghost bloque" style="margin-top:8px" data-act="cuentaSalir">' + ico('salir') + 'Usar otra cuenta</button></div>'
      : '<div class="ingreso">' + logo + '<p class="center muted">Controla tus trabajadores, la cosecha y los pagos de tu chacra, aunque no haya señal.</p>' +
      (CUENTA.googleActivo()
        ? '<button class="btn pri bloque" style="margin-top:16px" data-act="entrarGoogle">' + ico('google') + 'Entrar con Google</button>' +
          '<button class="btn bloque" style="margin-top:8px" data-act="entrarCorreo">' + ico('correo') + 'Entrar con mi correo</button>'
        : '<button class="btn pri bloque" style="margin-top:16px" data-act="entrarCorreo">' + ico('correo') + 'Entrar con mi correo</button>') +
      '<button class="btn bloque" style="margin-top:8px" data-act="tengoInvitacion">' + ico('personas') + 'Tengo una invitación</button>' +
      '<p class="center small muted" style="margin:14px 0 4px">Tu cuenta guarda tus datos y te deja usar la app en varios celulares. Es gratis.</p>' +
      '<button class="btn ghost bloque" style="margin-top:4px" data-act="configurar">Usar sin cuenta (solo en este celular)</button>' +
      '<button class="btn ghost bloque" style="margin-top:4px" data-act="importar">' + ico('subir') + 'Tengo una copia de seguridad</button>' +
      '<button class="btn ghost bloque chico" style="margin-top:4px" data-act="nubeUnirse" data-ingreso="1">' + ico('cambiar') + 'Tengo un código de conexión (nube antigua)</button>' +
      '<input type="file" id="archivoImp" accept=".json,application/json" class="hidden"></div>';
  } else if (!ING.uid) {
    h = '<div class="ingreso">' + logo + '<p class="muted">¿Quién eres?</p><div class="usuarios-g">' + us.map(u =>
      '<button class="fila card" style="margin:0;text-align:left" data-act="elegirUsuario" data-id="' + u.id + '"><span class="avatar">' + esc(iniciales(u.nombre)) + '</span>' +
      '<div class="cuerpo-f"><div class="t">' + esc(u.nombre) + '</div><div class="d">' + (u.dueno ? 'Dueño' : (u.accesos || [])[0] ? esc(ROLES[u.accesos[0].rol].t) : u.tienda ? 'Tienda' : '') + '</div></div>' + ico('der') + '</button>').join('') + '</div>' +
      (DB.todos('trabajadores').some(t => t.acceso) ? '<button class="btn ghost bloque" style="margin-top:14px" data-act="soyTrabajador">' + ico('usuario') + 'Soy trabajador: ver mis latas y pagos</button>' : '') + '</div>';
  } else {
    const u = DB.get('usuarios', ING.uid);
    const espera = Math.ceil((ING.esperaHasta - Date.now()) / 1000);
    h = '<div class="ingreso"><span class="avatar xl">' + esc(iniciales(u.nombre)) + '</span><h2 style="margin-top:10px">' + esc(u.nombre) + '</h2>' +
      '<p class="muted small" id="pinMsg">' + (espera > 0 ? 'Demasiados intentos. Espera ' + espera + ' s.' : 'Escribe tu PIN') + '</p>' +
      '<div class="pin-pts">' + [0, 1, 2, 3].map(i => '<i class="' + (i < ING.pin.length ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="teclado">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '0', '<'].map(k =>
        k === 'x' ? '<button data-act="pinOtro" style="font-size:14px">Otro</button>'
          : '<button data-act="pinTecla" data-k="' + k + '">' + (k === '<' ? ico('izq') : k) + '</button>').join('') + '</div></div>';
  }
  $('#app').innerHTML = h;
  const f = $('#archivoImp');
  if (f) f.onchange = () => { const a = f.files[0]; if (!a) return; const rd = new FileReader(); rd.onload = () => window.alImportar(rd.result); rd.readAsText(a); };
}
/** Crear (u olvidar) el PIN en el celular del trabajador: su cuenta ya prueba quién es. */
ACC.trabCrearPin = el => {
  const t = miTrabajador();
  if (!t) return render();
  if (el && el.dataset.olvide && !CUENTA.activa()) return toast('Vuelve a entrar con tu correo o Google en Más → Mi cuenta y nube, o pide ayuda al encargado.', 'error');
  formulario({
    titulo: t.pin ? 'Nuevo PIN' : 'Hola, ' + t.nombre.split(' ')[0], valores: {}, fija: !t.pin,
    aviso: 'Lo usarás para abrir la app en este celular y ver tus latas, días y pagos.',
    campos: [
      { id: 'pin', et: 'Crea tu PIN de 4 dígitos', tipo: 'pin', req: true, par: true, foco: true, valida: v => /^\d{4}$/.test(v) ? '' : 'Deben ser 4 dígitos' },
      { id: 'pin2', et: 'Repite el PIN', tipo: 'pin', req: true, valida: (v, x) => v !== x.pin ? 'Los PIN no coinciden' : '' },
    ],
    guardar: 'Entrar',
    alGuardar: async v => {
      const sal = uid();
      DB.usuario = sesionTrabajador(t.id);
      DB.editar('trabajadores', t.id, { sal, pin: await huellaPin(v.pin, sal) }, 'Cambió su PIN', true);
      DB.guardarYa();
      cerrarTodas(); iniciarSesion(sesionTrabajador(t.id));
    },
  });
};
ACC.trabCerrarSesion = async () => {
  if (!(await confirmar('Cerrar sesión', 'Se borrará de este celular la información de la chacra. Podrás volver a entrar con tu correo o con una nueva invitación.', { si: 'Cerrar sesión', peligro: true }))) return;
  clearTimeout(NUBE._t);
  await NUBE.sincronizar(true).catch(() => { }); // sube un reporte pendiente, si hay
  await CUENTA.salir();
  DB.d = DB.nuevo(); DB.usuario = null; NUBE.estado = 'apagada'; ING.uid = null; DB.guardarYa();
  history.replaceState(null, '', location.pathname + '#/'); render(); toast('Sesión cerrada');
};
ACC.elegirUsuario = el => { ING.uid = el.dataset.id; ING.pin = ''; render(); };
ACC.pinOtro = () => { ING.uid = null; ING.pin = ''; render(); };
ACC.pinTecla = async el => {
  if (Date.now() < ING.esperaHasta) return;
  const k = el.dataset.k;
  if (k === '<') ING.pin = ING.pin.slice(0, -1);
  else if (ING.pin.length < 4) ING.pin += k;
  vibrar(8);
  renderIngreso();
  if (ING.pin.length === 4) {
    const esT = String(ING.uid).startsWith('t:');
    const u = esT ? DB.get('trabajadores', ING.uid.slice(2)) : DB.get('usuarios', ING.uid);
    if (!u) { ING.uid = null; ING.pin = ''; return render(); }
    const h = await huellaPin(ING.pin, u.sal);
    if (h === u.pin) { const s = esT ? sesionTrabajador(u.id) : u; if (s) { iniciarSesion(s); return; } }
    ING.fallos++; ING.pin = '';
    if (ING.fallos >= 5) { ING.esperaHasta = Date.now() + 30000; ING.fallos = 0; setTimeout(renderIngreso, 30500); }
    vibrar(120);
    renderIngreso();
    const m = $('#pinMsg'); if (m && Date.now() >= ING.esperaHasta) { m.textContent = 'PIN incorrecto'; m.style.color = 'var(--red-text)'; }
  }
};

/* ---------- Asistente inicial ---------- */
ACC.configurar = () => {
  if (DB.errorCarga) return toast('Primero recupera una copia de seguridad para proteger tus datos.', 'error');
  formulario({
    titulo: 'Configura tu chacra',
    valores: { chacra: 'Mi chacra', ubicacion: 'Villa Rica', campania: 'Campaña ' + new Date().getFullYear(), cultivos: ['Café', 'Plátano'] },
    campos: [
      { id: 'nombre', et: 'Tu nombre', tipo: 'texto', req: true, foco: true, ph: 'Ej. Elar Castro' },
      { id: 'pin', et: 'Crea un PIN de 4 dígitos', tipo: 'pin', req: true, par: true, valida: v => /^\d{4}$/.test(v) ? '' : 'Deben ser 4 dígitos' },
      { id: 'pin2', et: 'Repite el PIN', tipo: 'pin', req: true, valida: (v, x) => v !== x.pin ? 'Los PIN no coinciden' : '' },
      { id: 'chacra', et: 'Nombre de tu chacra', tipo: 'texto', req: true },
      { id: 'ubicacion', et: 'Ubicación / sector', tipo: 'texto', par: true },
      { id: 'cuadras', et: 'Área (cuadras)', tipo: 'num', min: 0 },
      { id: 'campania', et: 'Campaña actual', tipo: 'texto', req: true },
      { id: 'cultivos', et: '¿Qué siembras?', tipo: 'multi', req: true, ops: CATALOGO_CULTIVOS.map(c => c.nombre), ayuda: 'Luego puedes agregar cualquier otro cultivo.' },
      { id: 'ofertas', et: 'Quiero recibir ofertas de la tienda CHINCARMAS para mi cultivo (opcional)', tipo: 'chk',
        ayuda: 'Las ofertas se eligen dentro de tu celular: la tienda no recibe datos de tu chacra. Puedes cambiarlo en Ajustes.' },
    ],
    guardar: 'Crear mi chacra',
    alGuardar: async v => {
      const sal = uid();
      const u = DB.crear('usuarios', { nombre: v.nombre.trim(), dueno: true, sal, pin: await huellaPin(v.pin, sal), accesos: [], activo: true }, 'Usuario dueño: ' + v.nombre);
      DB.usuario = u;
      const ch = DB.crear('chacras', { nombre: v.chacra, ubicacion: v.ubicacion, cuadras: v.cuadras, dueno: v.nombre }, 'Chacra ' + v.chacra);
      DB.chacraId = ch.id;
      const cp = DB.crear('campanias', { chacraId: ch.id, nombre: v.campania, inicio: HOY(), cerrada: false }, 'Campaña ' + v.campania);
      DB.editar('chacras', ch.id, { campaniaActiva: cp.id }, '', true);
      for (const c of CATALOGO_CULTIVOS) DB.crear('cultivos', Object.assign(JSON.parse(JSON.stringify(c)), { activo: v.cultivos.includes(c.nombre) }), 'Cultivo ' + c.nombre);
      for (const l of LABORES_BASE) DB.crear('labores', { nombre: l }, 'Labor ' + l);
      DB.d.config.ofertas = !!v.ofertas;
      DB.guardarYa();
      iniciarSesion(u);
      toast('¡Listo! Tu chacra está creada');
      if (window.trasCrearChacra) window.trasCrearChacra(v.chacra);
    },
  });
};

/* ---------- Menú y estructura ---------- */
const NAV = [
  { r: 'inicio', i: 'inicio', t: 'Inicio' },
  { r: 'tareo', i: 'asistencia', t: 'Asistencia' },
  { r: 'cosecha', i: 'canasta', t: 'Cosecha' },
  { r: 'pagos', i: 'billetera', t: 'Pagos', p: 'montos' },
  { r: 'mas', i: 'mas_menu', t: 'Más' },
];
const LATERAL = [
  { r: 'inicio', i: 'inicio', t: 'Inicio' },
  { r: 'trabajadores', i: 'personas', t: 'Trabajadores' },
  { r: 'tareo', i: 'asistencia', t: 'Asistencia' },
  { r: 'cosecha', i: 'canasta', t: 'Cosecha' },
  { r: 'pagos', i: 'billetera', t: 'Pagos', p: 'montos' },
  { r: 'contratas', i: 'contrata', t: 'Contratas', p: 'contratas' },
  { r: 'parcelas', i: 'mapa', t: 'Parcelas' },
  { r: 'campanias', i: 'bandera', t: 'Campañas' },
  { r: 'abonos', i: 'hoja', t: 'Abonos y químicos', p: 'campo' },
  { r: 'inventario', i: 'canasta', t: 'Almacén', p: 'campo' },
  { r: 'calendario', i: 'calendario', t: 'Calendario', p: 'campo' },
  null,
  { r: 'ventas', i: 'dinero', t: 'Ventas', p: 'finanzas' },
  { r: 'gastos', i: 'boleta', t: 'Gastos', p: 'finanzas' },
  { r: 'cuentas', i: 'billetera', t: 'Cuentas', p: 'finanzas' },
  { r: 'caja', i: 'dinero', t: 'Flujo de caja', p: 'finanzas' },
  { r: 'ganancia', i: 'bandera', t: 'Ganancia', p: 'finanzas' },
  { r: 'tienda', i: 'tienda', t: 'Tienda CHINCARMAS' },
  { r: 't_panel', i: 'tienda', t: 'Modo tienda', p: '_tienda' },
  { r: 'informes', i: 'excel', t: 'Informes' },
  { r: 'reportes', i: 'alerta', t: 'Reportes de trabajadores', p: 'reportes' },
  { r: 'nube', i: 'nube_ok', t: 'Mi cuenta y nube', p: 'config' },
  null,
  { r: 'chacras', i: 'ubicacion', t: 'Chacras', p: 'config' },
  { r: 'cultivos', i: 'hoja', t: 'Cultivos', p: 'config' },
  { r: 'usuarios', i: 'escudo', t: 'Usuarios', p: 'usuarios' },
  { r: 'historial', i: 'historial', t: 'Historial', p: 'historial' },
  { r: 'mas', i: 'ajustes', t: 'Más opciones' },
];
const PADRE = { trabajador: 'trabajadores', liquidacion: 'pagos', contrata: 'contratas', contratas: 'pagos', trabajadores: 'mas', parcelas: 'mas', campanias: 'mas',
  chacras: 'mas', cultivos: 'mas', labores: 'mas', usuarios: 'mas', ajustes: 'mas', historial: 'mas', papelera: 'mas', respaldo: 'mas',
  venta: 'ventas', clientes: 'ventas', cliente: 'clientes', ingresos: 'ventas', ventas: 'mas', gastos: 'mas', inversiones: 'gastos', ganancia: 'mas',
  parcela: 'parcelas', reportes: 'mas', abonos: 'mas', inventario: 'mas', producto: 'inventario', calendario: 'mas', cuentas: 'mas', caja: 'mas', informes: 'mas', nube: 'mas', tienda: 'mas', carrito: 'tienda', mispedidos: 'tienda', mipedido: 'mispedidos' };

let rutaAnterior = null;
function render() {
  if (!DB.usuario) return renderIngreso();
  const pr = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (pr.startsWith('t_') && DB.modo !== 'tienda' && rolTienda()) ponerModo('tienda');
  if (DB.modo === 'tienda') return renderTienda();
  const ch = DB.get('chacras', DB.chacraId);
  if (!ch || ch.eliminado || !DB.rol()) {
    const vis = DB.chacrasVisibles();
    if (!vis.length) return ACC.salir();
    seleccionarChacra(vis[0].id);
  }
  if (DB.usuario.esTrabajador) return renderPortal();
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const ruta = VISTAS[partes[0]] && partes[0] !== 'portal' ? partes[0] : 'inicio';
  let v;
  try { v = VISTAS[ruta](partes[1]); }
  catch (e) { console.error(e); v = { titulo: 'Error', html: vacio('alerta', 'Algo salió mal al mostrar esta pantalla.', '<p class="small faint">' + esc(e.message) + '</p>') }; }
  const chacra = DB.get('chacras', DB.chacraId);
  const navOn = r => r === ruta || PADRE[ruta] === r || PADRE[PADRE[ruta]] === r;
  const latOn = r => r === ruta || PADRE[ruta] === r;
  const visible = x => !x.p || (x.p === '_tienda' ? !!rolTienda() : DB.puede(x.p));

  const lateral = '<nav class="lateral" aria-label="Navegación principal"><div class="marca">' + ico('marca') + 'MI-CHACRA</div>' +
    LATERAL.map(x => x === null ? '<div class="sep"></div>' : visible(x) ? '<a href="#/' + x.r + '" class="' + (latOn(x.r) ? 'on' : '') + '"' + (latOn(x.r) ? ' aria-current="page"' : '') + '>' + ico(x.i) + x.t + '</a>' : '').join('') + '</nav>';
  const top = '<header class="top">' +
    (v.atras ? '<button class="icon-btn" data-act="volver" aria-label="Atrás">' + ico('atras') + '</button>' : '') +
    '<div class="titulo">' + (v.atras ? '' : '<button class="chacra-sel" data-act="cambiarChacra">' + ico('ubicacion', 's') + '<span>' + esc(chacra.nombre) + '</span>' + ico('abajo', 's') + '</button>') +
    '<h1' + (v.atras ? '' : ' style="margin-top:6px"') + '>' + esc(v.titulo) + '</h1></div>' + (v.acciones || '') + '<span id="indNube">' + htmlIndicador() + '</span>' +
    (v.atras ? '' : '<button class="icon-btn nube-ind" data-act="ir" data-ruta="tienda" aria-label="Tienda" style="color:var(--blue-text)">' + ico('tienda') +
      (carrito().length ? '<span class="num-p" style="background:var(--blue-text)">' + carrito().reduce((s, x) => s + x.cantidad, 0) + '</span>' : '') + '</button>') +
    (v.atras ? '' : '<button class="avatar" data-act="menuUsuario" aria-label="Usuario">' + esc(iniciales(DB.usuario.nombre)) + '</button>') + '</header>';
  const nav = '<nav class="nav" aria-label="Navegación principal">' + NAV.filter(visible).map(x => '<a href="#/' + x.r + '" class="' + (navOn(x.r) ? 'on' : '') + '"' + (navOn(x.r) ? ' aria-current="page"' : '') + '>' + ico(x.i) + x.t + '</a>').join('') + '</nav>';
  const fab = v.fab ? '<button class="fab" data-act="' + v.fab.act + '">' + ico(v.fab.icono) + esc(v.fab.t) + '</button>' : '';
  $('#app').innerHTML = '<div class="shell">' + lateral + '<div class="cuerpo">' + top + '<main class="main">' + v.html + '</main></div></div>' + nav + fab;
  if (rutaAnterior !== location.hash) { window.scrollTo(0, 0); rutaAnterior = location.hash; }
  if (v.despues) v.despues($('#app'));
}
/** Estructura del modo tienda (dueño y vendedor). */
const NAV_T = [
  { r: 't_panel', i: 'inicio', t: 'Panel' },
  { r: 't_pedidos', i: 'boleta', t: 'Pedidos' },
  { r: 't_productos', i: 'canasta', t: 'Productos' },
  { r: 't_ofertas', i: 'dinero', t: 'Ofertas', admin: true },
  { r: 't_mas', i: 'mas_menu', t: 'Más' },
];
function renderTienda() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const ruta = VISTAS[partes[0]] && (partes[0].startsWith('t_') || partes[0] === 'nube' || partes[0] === 'tienda') ? partes[0] : 't_panel';
  let v;
  try { v = VISTAS[ruta](partes[1]); }
  catch (e) { console.error(e); v = { titulo: 'Error', html: vacio('alerta', 'Algo salió mal.', '<p class="small faint">' + esc(e.message) + '</p>') }; }
  const rol = rolTienda();
  const navs = NAV_T.filter(x => !x.admin || rol === 'admin');
  const on = r => r === ruta || (ruta === 't_pedido' && r === 't_pedidos');
  const lateral = '<nav class="lateral" aria-label="Navegación de la tienda"><div class="marca">' + ico('tienda') + 'MODO TIENDA</div>' + navs.map(x => '<a href="#/' + x.r + '" class="' + (on(x.r) ? 'on' : '') + '"' + (on(x.r) ? ' aria-current="page"' : '') + '>' + ico(x.i) + x.t + '</a>').join('') + '</nav>';
  const top = '<header class="top">' + (v.atras ? '<button class="icon-btn" data-act="volver" aria-label="Atrás">' + ico('atras') + '</button>' : '') +
    '<div class="titulo">' + (v.atras ? '' : '<button class="chacra-sel" data-act="menuUsuario">' + ico('tienda', 's') + '<span>Modo tienda</span>' + ico('abajo', 's') + '</button>') +
    '<h1' + (v.atras ? '' : ' style="margin-top:6px"') + '>' + esc(v.titulo) + '</h1></div>' + (v.acciones || '') + '<span id="indNube">' + htmlIndicador() + '</span>' +
    (v.atras ? '' : '<button class="avatar" data-act="menuUsuario" aria-label="Usuario">' + esc(iniciales(DB.usuario.nombre)) + '</button>') + '</header>';
  const nav = '<nav class="nav" aria-label="Navegación de la tienda">' + navs.map(x => '<a href="#/' + x.r + '" class="' + (on(x.r) ? 'on' : '') + '"' + (on(x.r) ? ' aria-current="page"' : '') + '>' + ico(x.i) + x.t + '</a>').join('') + '</nav>';
  const fab = v.fab ? '<button class="fab" data-act="' + v.fab.act + '">' + ico(v.fab.icono) + esc(v.fab.t) + '</button>' : '';
  $('#app').innerHTML = '<div class="shell">' + lateral + '<div class="cuerpo">' + top + '<main class="main">' + v.html + '</main></div></div>' + nav + fab;
  if (rutaAnterior !== location.hash) { window.scrollTo(0, 0); rutaAnterior = location.hash; }
  if (v.despues) v.despues($('#app'));
}
/** Pantalla simple para el trabajador: solo su información, sin menú. */
function renderPortal() {
  const v = VISTAS.portal();
  const vis = DB.chacrasVisibles();
  const ch = DB.get('chacras', DB.chacraId);
  $('#app').innerHTML = '<div class="cuerpo"><header class="top"><div class="titulo">' +
    (vis.length > 1 ? '<button class="chacra-sel" data-act="cambiarChacra">' + ico('ubicacion', 's') + '<span>' + esc(ch.nombre) + '</span>' + ico('abajo', 's') + '</button>' : '<span class="chacra-sel">' + ico('ubicacion', 's') + '<span>' + esc(ch.nombre) + '</span></span>') +
    '<h1 style="margin-top:6px">' + esc(v.titulo) + '</h1></div><span id="indNube">' + htmlIndicador() + '</span><button class="btn chico" data-act="salir">' + ico('salir', 's') + 'Salir</button></header>' +
    '<main class="main" style="padding-bottom:32px">' + v.html + '</main></div>';
}
ACC.volver = () => { if (history.length > 1) history.back(); else ir('inicio'); };
ACC.cambiarChacra = async () => {
  const vis = DB.chacrasVisibles();
  const ops = vis.map(c => ({ v: c.id, t: c.nombre, d: (c.ubicacion || '') + ((ROLES[DB.rol(c.id)] || {}).t ? ' · ' + ROLES[DB.rol(c.id)].t : ''), icono: 'ubicacion' }));
  if (DB.puede('config')) ops.push({ v: '_admin', t: 'Administrar chacras', icono: 'ajustes' });
  const r = await elegir('Elige la chacra', ops, DB.chacraId);
  if (r === '_admin') return ir('chacras');
  if (r && r !== DB.chacraId) { seleccionarChacra(r); toast('Ahora estás en ' + DB.get('chacras', r).nombre); render(); }
};
ACC.menuUsuario = async () => {
  const ops = [];
  if (DB.modo === 'tienda' && DB.chacraId) ops.push({ v: 'chacra', t: 'Cambiar a modo chacra', d: 'Trabajadores, cosecha, pagos…', icono: 'hoja' });
  if (DB.modo !== 'tienda' && rolTienda()) ops.push({ v: 'tienda', t: 'Cambiar a modo tienda', d: 'Pedidos, productos y ofertas de ' + nombreTienda(), icono: 'tienda' });
  ops.push({ v: 'salir', t: 'Cambiar de usuario', d: 'Volver a la pantalla de ingreso', icono: 'cambiar' });
  if (DB.modo !== 'tienda') ops.push({ v: 'ajustes', t: 'Ajustes', icono: 'ajustes' });
  const r = await elegir(DB.usuario.nombre, ops);
  if (r === 'chacra') ACC.modoChacra();
  if (r === 'tienda') ACC.modoTienda();
  if (r === 'salir') ACC.salir();
  if (r === 'ajustes') ir('ajustes');
};

/* ---------- Eventos globales ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = ACC[el.dataset.act];
  if (f) { e.preventDefault(); f(el, e); }
});
window.addEventListener('hashchange', () => { cerrarTodas(); render(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && DB.pendiente()) DB.guardarYa(); });
window.addEventListener('pagehide', () => { if (DB.pendiente()) DB.guardarYa(); });
window.addEventListener('error', e => { try { toast('Error: ' + e.message, 'error'); } catch (x) { } });
/** Botón Atrás de Android: true si la app lo manejó. */
window.atras = () => {
  if (cerrarHoja()) return true;
  if (!DB.usuario) { if (ING.uid) { ING.uid = null; render(); return true; } return false; }
  if (DB.usuario.esTrabajador) return false;
  const r = location.hash.replace(/^#\/?/, '');
  if (DB.modo === 'tienda' && (!r || r === 't_panel')) return false;
  if (r && r !== 'inicio') { history.back(); return true; }
  return false;
};

/* ---------- Arranque ---------- */
DB.cargar();
aplicarTema();
(() => {
  const us = DB.todos('usuarios').filter(u => u.activo !== false);
  if (us.length === 1 && !DB.d.config.pedirPin) { iniciarSesion(us[0]); return; }
  if (us.length && DB.d.ultimoUsuario && us.find(u => u.id === DB.d.ultimoUsuario)) ING.uid = DB.d.ultimoUsuario;
  render();
})();
/* Volver de Google (web) o de un enlace pendiente (Android). */
setTimeout(() => window.alVolverAuth && window.alVolverAuth(), 300);
/* Si cambia lo que el servidor permite (por ejemplo, se activa Google), volver a dibujar la bienvenida. */
setTimeout(async () => {
  const antes = CUENTA.googleActivo();
  await CUENTA.ajustes();
  if (CUENTA.googleActivo() !== antes && !DB.usuario && !PILA.length) render();
}, 600);
ACC.cuentaContinuar = () => trasEntrar();
