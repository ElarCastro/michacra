'use strict';
/* ==========================================================================
   MI-CHACRA · Datos, permisos y cálculos
   Todo se guarda en el celular (Android: archivo interno; navegador: localStorage).
   ========================================================================== */

const NATIVO = typeof window.Android !== 'undefined';
const z2 = n => String(n).padStart(2, '0');
const fechaISO = d => d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate());
const HOY = () => fechaISO(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const sumar = (arr, f) => r2(arr.reduce((a, x) => a + (Number(f(x)) || 0), 0));
function sumarDias(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return fechaISO(d); }

/* Cultivos de la zona listos para activar. Cada uno define sus unidades. */
const CATALOGO_CULTIVOS = [
  { nombre: 'Café', variedades: ['Catimor', 'Caturra', 'Geisha', 'Típica', 'Bourbon', 'Pache', 'Costa Rica 95'],
    unidadesCosecha: ['lata'], estados: [{ nombre: 'Húmedo / oreado', unidades: ['lata'] }, { nombre: 'Seco', unidades: ['kg'] }] },
  { nombre: 'Plátano', variedades: ['Isla', 'Bellaco', 'Seda', 'Moquicho', 'Palillo'],
    unidadesCosecha: ['racimo', 'arroba', 'kg'], estados: [{ nombre: 'Primera', unidades: ['arroba', 'kg'] }, { nombre: 'Segunda', unidades: ['arroba', 'kg'] }] },
  { nombre: 'Maíz', variedades: ['Amarillo duro', 'Amiláceo', 'Morado'],
    unidadesCosecha: ['saco', 'kg'], estados: [{ nombre: 'Choclo', unidades: ['saco', 'ciento'] }, { nombre: 'Grano seco', unidades: ['kg', 'saco'] }] },
  { nombre: 'Palta', variedades: ['Hass', 'Fuerte', 'Criolla'],
    unidadesCosecha: ['jaba', 'kg'], estados: [{ nombre: 'Primera', unidades: ['kg', 'caja'] }, { nombre: 'Segunda', unidades: ['kg', 'caja'] }] },
  { nombre: 'Frijol', variedades: ['Canario', 'Panamito', 'Huasca'],
    unidadesCosecha: ['kg', 'arroba'], estados: [{ nombre: 'Verde', unidades: ['kg', 'saco'] }, { nombre: 'Seco', unidades: ['kg', 'arroba'] }] },
  { nombre: 'Cacao', variedades: ['CCN-51', 'Criollo', 'Trinitario'],
    unidadesCosecha: ['lata', 'kg'], estados: [{ nombre: 'En baba', unidades: ['kg', 'lata'] }, { nombre: 'Seco', unidades: ['kg'] }] },
  { nombre: 'Yuca', variedades: ['Blanca', 'Amarilla'], unidadesCosecha: ['saco', 'kg'], estados: [{ nombre: 'Fresca', unidades: ['kg', 'saco'] }] },
  { nombre: 'Granadilla', variedades: ['Común'], unidadesCosecha: ['jaba', 'caja'], estados: [{ nombre: 'Primera', unidades: ['caja', 'kg'] }] },
  { nombre: 'Naranja', variedades: ['Valencia', 'Huando'], unidadesCosecha: ['saco', 'ciento'], estados: [{ nombre: 'Fresca', unidades: ['ciento', 'saco', 'kg'] }] },
  { nombre: 'Rocoto', variedades: ['Común'], unidadesCosecha: ['saco', 'kg'], estados: [{ nombre: 'Fresco', unidades: ['kg', 'saco'] }] },
  { nombre: 'Kion', variedades: ['Común'], unidadesCosecha: ['saco', 'kg'], estados: [{ nombre: 'Fresco', unidades: ['kg', 'saco'] }] },
  { nombre: 'Pitahaya', variedades: ['Roja', 'Amarilla'], unidadesCosecha: ['jaba', 'kg'], estados: [{ nombre: 'Primera', unidades: ['kg', 'caja'] }] },
];
const LABORES_BASE = ['Cosecha', 'Deshierbo', 'Poda', 'Abonamiento', 'Fumigación', 'Siembra', 'Recalce',
  'Limpieza de canales', 'Deshoje', 'Despunte', 'Riego', 'Mantenimiento', 'Otra'];

const MODALIDADES = {
  jornal: { t: 'Jornal', u: 'día', us: 'días' },
  cuadra: { t: 'Por cuadra', u: 'cuadra', us: 'cuadras' },
  tarea: { t: 'Por tarea', u: 'tarea', us: 'tareas' },
};
const TIPOS_MOV = {
  adelanto: { t: 'Adelanto', signo: -1 },
  descuento: { t: 'Descuento', signo: -1 },
  bono: { t: 'Bono / extra', signo: 1 },
  pago: { t: 'Pago', signo: -1 },
};
const ROLES = {
  admin: { t: 'Administrador', d: 'Controla todo de la chacra' },
  supervisor: { t: 'Supervisor', d: 'Registra asistencia, cosecha y adelantos' },
  operario: { t: 'Operario', d: 'Solo registra asistencia y cosecha, sin montos' },
};
const NOMBRES_COL = {
  usuarios: 'Usuario', chacras: 'Chacra', campanias: 'Campaña', cultivos: 'Cultivo', parcelas: 'Parcela',
  labores: 'Labor', trabajadores: 'Trabajador', trabajos: 'Asistencia / trabajo', cosechas: 'Cosecha',
  contratas: 'Contrata', movimientos: 'Movimiento', liquidaciones: 'Liquidación',
  clientes: 'Cliente', ventas: 'Venta', cobros: 'Cobro', ingresos: 'Otro ingreso', gastos: 'Gasto',
  inversiones: 'Inversión', actividades: 'Actividad programada', reportes: 'Reporte de trabajador',
  productos: 'Producto de almacén', inventario: 'Movimiento de almacén', aplicaciones: 'Aplicación de abono/químico', planes: 'Plan de abonamiento',
};
const COLS_CHACRA = ['campanias', 'parcelas', 'trabajos', 'cosechas', 'contratas', 'movimientos', 'liquidaciones',
  'ventas', 'cobros', 'ingresos', 'gastos', 'inversiones', 'actividades', 'reportes', 'productos', 'inventario', 'aplicaciones', 'planes'];
const TIPOS_PRODUCTO = {
  abono: { t: 'Abono / fertilizante', cat: 'Abonos y fertilizantes', aplica: true },
  foliar: { t: 'Foliar', cat: 'Abonos y fertilizantes', aplica: true },
  enmienda: { t: 'Enmienda (cal, guano…)', cat: 'Abonos y fertilizantes', aplica: true },
  insecticida: { t: 'Insecticida', cat: 'Químicos (fumigación)', aplica: true },
  fungicida: { t: 'Fungicida', cat: 'Químicos (fumigación)', aplica: true },
  herbicida: { t: 'Herbicida', cat: 'Químicos (fumigación)', aplica: true },
  combustible: { t: 'Combustible', cat: 'Combustible' },
  herramienta: { t: 'Herramienta', cat: 'Herramientas y materiales' },
  equipo: { t: 'Equipo (mochila, latas…)', cat: 'Herramientas y materiales' },
  envase: { t: 'Envases y sacos', cat: 'Envases y sacos' },
  otro: { t: 'Otro', cat: 'Otros' },
};
const UNIDADES_PRODUCTO = ['kg', 'saco', 'L', 'galón', 'ml', 'g', 'unidad'];
const FORMAS_APLICACION = ['Al suelo', 'Foliar', 'Por riego', 'Drench', 'Otra'];
const CATEGORIAS_GASTO = ['Abonos y fertilizantes', 'Químicos (fumigación)', 'Transporte / flete', 'Combustible', 'Maquinaria y alquiler',
  'Herramientas y materiales', 'Agua y riego', 'Alimentación', 'Envases y sacos', 'Servicios y trámites', 'Otros'];
const CATEGORIAS_INVERSION = ['Plantones / semilla', 'Sistema de riego', 'Maquinaria y equipos', 'Instalación del cultivo', 'Infraestructura (almacén, secadero)', 'Terreno', 'Otro'];
const FORMAS_PAGO = ['Efectivo', 'Yape', 'Plin', 'Transferencia'];
const DIAS_PAPELERA = 30;

const DB = {
  d: null,
  usuario: null,   // usuario con sesión iniciada
  chacraId: null,  // chacra seleccionada
  _t: null,
  errorCarga: false,

  nuevo() {
    return {
      app: 'MI-CHACRA', version: 1, creado: new Date().toISOString(),
      config: { tema: 'auto', inicioSemana: 1, pedirPin: true },
      usuarios: [], chacras: [], campanias: [], cultivos: [], parcelas: [], labores: [],
      trabajadores: [], trabajos: [], cosechas: [], contratas: [], movimientos: [], liquidaciones: [],
      clientes: [], ventas: [], cobros: [], ingresos: [], gastos: [], inversiones: [], actividades: [], reportes: [],
      productos: [], inventario: [], aplicaciones: [], planes: [],
      precios: {}, historial: [], ultimaChacra: null,
    };
  },

  cargar() {
    let txt = '';
    let errorLectura = false;
    try { txt = NATIVO ? Android.cargar() : (localStorage.getItem('michacra') || ''); } catch (e) { txt = ''; errorLectura = true; }
    let d = null;
    if (txt) { try { d = JSON.parse(txt); } catch (e) { d = null; } }
    const estructuraValida = d && typeof d === 'object' && !Array.isArray(d) && d.app === 'MI-CHACRA' &&
      Object.keys(NOMBRES_COL).every(k => d[k] === undefined || Array.isArray(d[k])) &&
      (d.config === undefined || (d.config && typeof d.config === 'object' && !Array.isArray(d.config))) &&
      (d.precios === undefined || (d.precios && typeof d.precios === 'object' && !Array.isArray(d.precios)));
    this.errorCarga = errorLectura || (!!txt && !estructuraValida);
    this.d = this.errorCarga ? this.nuevo() : (estructuraValida ? d : this.nuevo());
    if (this.errorCarga) return;
    this.completar();
    this.limpiarPapelera();
  },

  completar() {
    const base = this.nuevo();
    for (const k in base) if (this.d[k] === undefined) this.d[k] = base[k];
    for (const k in base.config) if (this.d.config[k] === undefined) this.d.config[k] = base.config[k];
  },

  guardarYa() {
    clearTimeout(this._t); this._t = null;
    if (this.errorCarga) {
      if (window.toast) toast('No se guardó: recupera una copia de seguridad antes de continuar.', 'error');
      return false;
    }
    const txt = JSON.stringify(this.d);
    let ok = false;
    try { ok = NATIVO ? Android.guardar(txt) : (localStorage.setItem('michacra', txt), true); } catch (e) { ok = false; }
    if (!ok && window.toast) toast('No se pudo guardar. Revisa el espacio del celular.', 'error');
    return ok;
  },
  guardar() { clearTimeout(this._t); this._t = setTimeout(() => { this.guardarYa(); if (window.alGuardarDatos) window.alGuardarDatos(); }, 250); },
  pendiente() { return !!this._t; },

  /* ---------- Lectura ---------- */
  todos(col) { return this.d[col].filter(x => !x.eliminado); },
  deChacra(col, cid) { cid = cid || this.chacraId; return this.d[col].filter(x => !x.eliminado && x.chacraId === cid); },
  get(col, id) { return this.d[col].find(x => x.id === id) || null; },

  /* ---------- Cambios pendientes de subir a la nube ---------- */
  marcar(col, id) {
    const n = this.d.nube;
    if (n && n.activa) { (n.pend = n.pend || {})[col + '|' + id] = 1; }
  },
  tocar(col, reg) { reg.mod = Math.max(Date.now(), (reg.mod || 0) + 1); this.marcar(col, reg.id); },

  /* ---------- Escritura con historial ---------- */
  anotar(accion, col, reg, resumen, cambios) {
    const h = {
      id: uid(), ts: Date.now(), usuarioId: this.usuario ? this.usuario.id : null,
      usuario: this.usuario ? this.usuario.nombre : 'Sistema', chacraId: reg.chacraId || this.chacraId || null,
      col, regId: reg.id, accion, resumen: resumen || '', cambios: cambios || null,
    };
    h.mod = h.ts;
    this.d.historial.unshift(h);
    this.marcar('historial', h.id);
    if (this.d.historial.length > 20000) this.d.historial.length = 20000;
  },

  crear(col, obj, resumen) {
    const reg = Object.assign({ id: uid(), creado: Date.now(), creadoPor: this.usuario ? this.usuario.id : null }, obj);
    if (COLS_CHACRA.includes(col) && !reg.chacraId) reg.chacraId = this.chacraId;
    this.tocar(col, reg);
    this.d[col].push(reg);
    this.anotar('crear', col, reg, resumen);
    this.guardar();
    return reg;
  },

  editar(col, id, nuevos, resumen, silencioso) {
    const reg = this.get(col, id);
    if (!reg) return null;
    const cambios = [];
    for (const k in nuevos) {
      const a = reg[k], b = nuevos[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) cambios.push({ campo: k, antes: a === undefined ? null : a, despues: b });
    }
    if (!cambios.length) return reg;
    Object.assign(reg, nuevos, { editado: Date.now(), editadoPor: this.usuario ? this.usuario.id : null });
    this.tocar(col, reg);
    if (!silencioso) this.anotar('editar', col, reg, resumen, cambios);
    this.guardar();
    return reg;
  },

  eliminar(col, id, resumen) {
    const reg = this.get(col, id);
    if (!reg || reg.eliminado) return;
    reg.eliminado = Date.now();
    reg.eliminadoPor = this.usuario ? this.usuario.id : null;
    this.tocar(col, reg);
    this.anotar('eliminar', col, reg, resumen);
    this.guardar();
  },

  restaurar(col, id) {
    const reg = this.get(col, id);
    if (!reg || !reg.eliminado) return;
    delete reg.eliminado; delete reg.eliminadoPor;
    this.tocar(col, reg);
    this.anotar('restaurar', col, reg, 'Recuperado de la papelera');
    this.guardar();
  },

  papelera() {
    const out = [];
    for (const col of Object.keys(NOMBRES_COL)) {
      for (const r of this.d[col]) if (r.eliminado) out.push({ col, reg: r });
    }
    return out.sort((a, b) => b.reg.eliminado - a.reg.eliminado);
  },

  limpiarPapelera() {
    const lim = Date.now() - DIAS_PAPELERA * 864e5;
    let n = 0;
    for (const col of Object.keys(NOMBRES_COL)) {
      const antes = this.d[col].length;
      this.d[col] = this.d[col].filter(r => !r.eliminado || r.eliminado > lim);
      n += antes - this.d[col].length;
    }
    if (n) this.guardar();
  },

  /* ---------- Sesión y permisos ---------- */
  rol(cid) {
    const u = this.usuario;
    if (!u) return null;
    if (u.esTrabajador) { const t = this.get('trabajadores', u.trabajadorId); return t && (t.chacras || []).includes(cid || this.chacraId) ? 'trabajador' : null; }
    if (u.dueno) return 'admin';
    const a = (u.accesos || []).find(x => x.chacraId === (cid || this.chacraId));
    return a ? a.rol : null;
  },
  puede(accion) {
    const r = this.rol();
    if (!r) return false;
    if (accion === 'usuarios') return !!(this.usuario && this.usuario.dueno);
    const P = {
      admin: ['montos', 'trabajadores', 'tareo', 'cosecha', 'adelantos', 'pagos', 'contratas', 'config', 'historial', 'papelera', 'editar_otros', 'eliminar', 'cerrar', 'finanzas', 'reportes', 'campo'],
      supervisor: ['montos', 'trabajadores', 'tareo', 'cosecha', 'adelantos', 'contratas', 'historial', 'editar_otros', 'eliminar', 'reportes', 'campo'],
      operario: ['tareo', 'cosecha'],
      trabajador: [],
    };
    if (r === 'supervisor' && accion === 'finanzas') {
      const a = (this.usuario.accesos || []).find(x => x.chacraId === this.chacraId);
      return !!(a && a.verFinanzas);
    }
    return (P[r] || []).includes(accion);
  },
  chacrasVisibles() {
    const u = this.usuario;
    const cs = this.todos('chacras');
    if (!u) return [];
    if (u.esTrabajador) { const t = this.get('trabajadores', u.trabajadorId); return cs.filter(c => t && (t.chacras || []).includes(c.id)); }
    if (u.dueno) return cs;
    const ids = (u.accesos || []).map(a => a.chacraId);
    return cs.filter(c => ids.includes(c.id));
  },
  /** ¿Puede el usuario actual modificar este registro? Devuelve '' si sí, o el motivo si no. */
  bloqueo(reg, contador) {
    if (!reg) return 'No existe';
    const camp = reg.campaniaId ? this.get('campanias', reg.campaniaId) : null;
    if (camp && camp.cerrada) return 'La campaña "' + camp.nombre + '" está cerrada. Un administrador debe reabrirla.';
    // En el contador de cosecha del día, varias personas pueden sumar latas al mismo trabajador.
    if (contador && reg.fecha === HOY()) return '';
    if (!this.puede('editar_otros')) {
      if (reg.creadoPor !== (this.usuario && this.usuario.id)) return 'Solo puedes corregir lo que tú registraste.';
      if (reg.fecha && reg.fecha !== HOY()) return 'Solo puedes corregir registros de hoy.';
    }
    return '';
  },

  /* ---------- Campañas y precios ---------- */
  campaniaActiva(cid) {
    cid = cid || this.chacraId;
    const ch = this.get('chacras', cid);
    let c = ch && ch.campaniaActiva ? this.get('campanias', ch.campaniaActiva) : null;
    if (c && c.eliminado) c = null;
    if (!c) c = this.deChacra('campanias', cid).filter(x => !x.cerrada).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))[0] || null;
    return c;
  },
  precio(clave) { const p = (this.d.precios[this.chacraId] || {})[clave]; return p === undefined ? '' : p; },
  recordarPrecio(clave, valor) {
    if (valor === '' || valor === null || isNaN(valor)) return;
    (this.d.precios[this.chacraId] = this.d.precios[this.chacraId] || {})[clave] = Number(valor);
    this.d.precios._mod = Date.now();
    this.marcar('precios', 'precios');
    const h = (this.d.precios._hist = this.d.precios._hist || []);
    const ult = h.find(x => x.chacraId === this.chacraId && x.clave === clave);
    if (!ult || ult.valor !== Number(valor)) h.unshift({ chacraId: this.chacraId, clave, valor: Number(valor), fecha: HOY() });
    if (h.length > 2000) h.length = 2000;
  },

  /* ---------- Cálculos ---------- */
  totalCosecha(r) {
    const pagable = Math.max(0, (Number(r.cantidad) || 0) - (r.pagarMerma ? 0 : (Number(r.merma) || 0)));
    return r2(pagable * (Number(r.precio) || 0));
  },
  totalTrabajo(r) {
    return r2((Number(r.cantidad) || 0) * (Number(r.precio) || 0) + (Number(r.horasExtra) || 0) * (Number(r.precioHora) || 0));
  },

  /** Registros que generan pago (trabajos y cosechas) de un trabajador en un rango. */
  ganancias(tid, cid, desde, hasta) {
    const dentro = r => r.trabajadorId === tid && (!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta);
    return {
      trabajos: this.deChacra('trabajos', cid).filter(dentro),
      cosechas: this.deChacra('cosechas', cid).filter(dentro),
    };
  },
  movs(tid, cid, desde, hasta) {
    return this.deChacra('movimientos', cid).filter(m => m.trabajadorId === tid && (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta));
  },
  saldo(tid, cid, hasta) {
    const g = this.ganancias(tid, cid, null, hasta);
    const ganado = sumar(g.trabajos, r => r.total) + sumar(g.cosechas, r => r.total);
    const m = this.movs(tid, cid, null, hasta);
    const mov = sumar(m, x => (TIPOS_MOV[x.tipo] ? TIPOS_MOV[x.tipo].signo : 0) * x.monto);
    return r2(ganado + mov);
  },
  liquidacion(tid, cid, desde, hasta) {
    const g = this.ganancias(tid, cid, desde, hasta);
    const m = this.movs(tid, cid, desde, hasta);
    const porTipo = t => sumar(m.filter(x => x.tipo === t), x => x.monto);
    const anterior = this.saldo(tid, cid, sumarDias(desde, -1));
    const ganado = r2(sumar(g.trabajos, r => r.total) + sumar(g.cosechas, r => r.total));
    const res = {
      desde, hasta, trabajos: g.trabajos, cosechas: g.cosechas, movs: m, anterior, ganado,
      adelantos: porTipo('adelanto'), descuentos: porTipo('descuento'), bonos: porTipo('bono'), pagos: porTipo('pago'),
    };
    res.saldo = r2(anterior + ganado + res.bonos - res.adelantos - res.descuentos - res.pagos);
    return res;
  },
  /** Liquidación ya pagada que incluye esa fecha (para avisar al corregir). */
  periodoPagado(tid, cid, fecha) {
    return this.deChacra('liquidaciones', cid).find(l => l.trabajadorId === tid && fecha >= l.desde && fecha <= l.hasta) || null;
  },
  pagadoContrata(c) {
    return sumar(this.deChacra('movimientos', c.chacraId).filter(m => m.contrataId === c.id), m => m.monto);
  },
  diasTrabajados(tid, cid, desde, hasta) {
    const g = this.ganancias(tid, cid, desde, hasta);
    return new Set([...g.trabajos, ...g.cosechas].map(r => r.fecha)).size;
  },
  semana(fecha) {
    const d = new Date((fecha || HOY()) + 'T12:00:00');
    const ini = this.d.config.inicioSemana;
    const dif = (d.getDay() - ini + 7) % 7;
    const desde = sumarDias(fechaISO(d), -dif);
    return { desde, hasta: sumarDias(desde, 6) };
  },
  siguienteCodigo() {
    const n = this.d.trabajadores.reduce((m, t) => Math.max(m, parseInt(t.codigo, 10) || 0), 0);
    return String(n + 1).padStart(3, '0');
  },

  /* ---------- Ventas y finanzas (Etapa 2) ---------- */
  cobradoVenta(v) { return r2((Number(v.cobradoInicial) || 0) + sumar(this.deChacra('cobros', v.chacraId).filter(c => c.ventaId === v.id), c => c.monto)); },
  saldoVenta(v) { return r2((Number(v.total) || 0) - this.cobradoVenta(v)); },
  campaniasOrdenadas(cid) { return this.deChacra('campanias', cid).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || '') || a.creado - b.creado); },
  /** Parte de una inversión que le toca a una campaña (se reparte en partes iguales entre N campañas). */
  parteInversion(inv, campaniaId) {
    const cs = this.campaniasOrdenadas(inv.chacraId).map(c => c.id);
    const ini = cs.indexOf(inv.campaniaId), i = cs.indexOf(campaniaId);
    const n = Math.max(1, Number(inv.campanias) || 1);
    if (ini < 0 || i < 0 || i < ini || i >= ini + n) return 0;
    return r2((Number(inv.monto) || 0) / n);
  },
  /** Resultado económico de una campaña (opcionalmente de una sola parcela). */
  resultado(campaniaId, parcelaId) {
    const cid = this.chacraId;
    const f = r => r.campaniaId === campaniaId && (!parcelaId || r.parcelaId === parcelaId);
    const ventas = this.deChacra('ventas', cid).filter(f);
    const otros = this.deChacra('ingresos', cid).filter(f);
    const trabajos = this.deChacra('trabajos', cid).filter(f);
    const cosechas = this.deChacra('cosechas', cid).filter(f);
    const contratas = this.deChacra('contratas', cid).filter(f);
    const gastos = this.deChacra('gastos', cid).filter(f);
    const invs = this.deChacra('inversiones', cid).filter(i => !parcelaId || i.parcelaId === parcelaId);
    const R = {
      ventas: sumar(ventas, v => v.total), otros: sumar(otros, x => x.monto),
      jornales: sumar(trabajos, r => r.total), cosechaPago: sumar(cosechas, r => r.total), contratas: sumar(contratas, c => c.monto),
      gastos: sumar(gastos, g => g.monto), inversion: sumar(invs, i => this.parteInversion(i, campaniaId)),
      porCobrar: sumar(ventas, v => this.saldoVenta(v)),
      listas: { ventas, otros, trabajos, cosechas, contratas, gastos, invs },
    };
    R.ingresos = r2(R.ventas + R.otros);
    R.manoObra = r2(R.jornales + R.cosechaPago + R.contratas);
    R.costos = r2(R.manoObra + R.gastos + R.inversion);
    R.ganancia = r2(R.ingresos - R.costos);
    R.rentabilidad = R.costos > 0 ? Math.round(R.ganancia / R.costos * 1000) / 10 : null;
    return R;
  },

  /* ---------- Almacén, abonos y químicos (Etapa 3) ---------- */
  movsProducto(pid) { const p = this.get('productos', pid); return p ? this.deChacra('inventario', p.chacraId).filter(m => m.productoId === pid) : []; },
  stock(pid) { return sumar(this.movsProducto(pid), m => (m.tipo === 'salida' ? -1 : 1) * m.cantidad); },
  costoPromedio(pid) {
    const e = this.movsProducto(pid).filter(m => m.tipo === 'entrada' && m.costoUnit > 0);
    const q = sumar(e, m => m.cantidad);
    return q ? r2(sumar(e, m => m.cantidad * m.costoUnit) / q) : 0;
  },
  /** Periodo de carencia vigente de una parcela: { hasta, aplicacion } o null. */
  carencia(parcelaId, cid) {
    const hoy = HOY();
    let mejor = null;
    for (const a of this.deChacra('aplicaciones', cid)) {
      if (a.parcelaId !== parcelaId || !(Number(a.carencia) > 0)) continue;
      const hasta = sumarDias(a.fecha, Number(a.carencia));
      if (hasta > hoy && (!mejor || hasta > mejor.hasta)) mejor = { hasta, aplicacion: a };
    }
    return mejor;
  },
  /** Fecha de la próxima aplicación de un plan en una parcela (o null si ya terminó). */
  proximaPlan(plan, parcelaId) {
    const hechas = this.deChacra('aplicaciones', plan.chacraId).filter(a => a.planId === plan.id && a.parcelaId === parcelaId).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const sig = hechas.length ? sumarDias(hechas[0].fecha, Math.max(1, Number(plan.cadaDias) || 30)) : plan.inicio;
    if (plan.fin && sig > plan.fin) return null;
    return sig;
  },
  /** Todo lo que hay que atender en los próximos días en una chacra. */
  alertas(cid, dias) {
    cid = cid || this.chacraId; dias = dias === undefined ? 7 : dias;
    const hoy = HOY(), lim = sumarDias(hoy, dias), out = [];
    const nomPar = id => (this.get('parcelas', id) || {}).nombre || '';
    for (const pl of this.deChacra('planes', cid).filter(p => p.activo !== false)) {
      for (const pid of pl.parcelas || []) {
        const f = this.proximaPlan(pl, pid);
        if (f && f <= lim) out.push({ tipo: 'abono', fecha: f, titulo: pl.producto + ' en ' + nomPar(pid), texto: pl.dosis || '', planId: pl.id, parcelaId: pid, atrasada: f < hoy });
      }
    }
    for (const a of this.deChacra('actividades', cid).filter(a => !a.hecha && a.fecha <= lim))
      out.push({ tipo: 'actividad', fecha: a.fecha, titulo: a.labor + ' en ' + nomPar(a.parcelaId), texto: a.nota || '', ruta: 'parcela/' + a.parcelaId, atrasada: a.fecha < hoy });
    for (const p of this.deChacra('parcelas', cid).filter(p => p.activo !== false)) {
      const c = this.carencia(p.id, cid);
      if (c) out.push({ tipo: 'carencia', fecha: hoy, hasta: c.hasta, titulo: p.nombre + ': no cosechar hasta el ' + c.hasta.split('-').reverse().join('/'), texto: 'Se aplicó ' + c.aplicacion.producto, ruta: 'parcela/' + p.id });
    }
    for (const pr of this.deChacra('productos', cid)) {
      const s = this.stock(pr.id);
      if (Number(pr.minimo) > 0 && s <= Number(pr.minimo)) out.push({ tipo: 'stock', fecha: hoy, titulo: 'Stock bajo: ' + pr.nombre, texto: 'Quedan ' + r2(s) + ' ' + pr.unidad, ruta: 'producto/' + pr.id });
      if (pr.vence && s > 0 && pr.vence <= sumarDias(hoy, 30)) out.push({ tipo: 'vence', fecha: pr.vence, titulo: (pr.vence < hoy ? 'Vencido: ' : 'Por vencer: ') + pr.nombre, texto: 'Vence el ' + pr.vence.split('-').reverse().join('/'), ruta: 'producto/' + pr.id, atrasada: pr.vence < hoy });
    }
    for (const v of this.deChacra('ventas', cid)) {
      if (v.vence && v.vence <= lim && this.saldoVenta(v) > 0.004) out.push({ tipo: 'cobro', fecha: v.vence, titulo: 'Cobrar ' + soles(this.saldoVenta(v)), texto: ((this.get('clientes', v.clienteId) || {}).nombre || ''), ruta: 'venta/' + v.id, atrasada: v.vence < hoy, dinero: true });
    }
    for (const g of this.deChacra('gastos', cid)) {
      if (g.pagado === false && g.vence && g.vence <= lim) out.push({ tipo: 'pago', fecha: g.vence, titulo: 'Pagar ' + soles(g.monto), texto: g.descripcion + (g.proveedor ? ' · ' + g.proveedor : ''), ruta: 'cuentas', atrasada: g.vence < hoy, dinero: true });
    }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  /* ---------- Flujo de caja: dinero que entra y sale de verdad ---------- */
  caja(cid, desde, hasta) {
    cid = cid || this.chacraId;
    const en = f => f && (!desde || f >= desde) && (!hasta || f <= hasta);
    const out = [];
    const nomCl = id => (this.get('clientes', id) || {}).nombre || 'cliente';
    const nomTr = id => (this.get('trabajadores', id) || {}).nombre || '';
    for (const v of this.deChacra('ventas', cid)) if (Number(v.cobradoInicial) > 0 && en(v.fecha)) out.push({ fecha: v.fecha, monto: Number(v.cobradoInicial), concepto: 'Venta a ' + nomCl(v.clienteId), grupo: 'Ventas', ruta: 'venta/' + v.id });
    for (const c of this.deChacra('cobros', cid)) if (en(c.fecha)) { const v = this.get('ventas', c.ventaId); out.push({ fecha: c.fecha, monto: c.monto, concepto: 'Cobro a ' + nomCl(v && v.clienteId), grupo: 'Ventas', ruta: v ? 'venta/' + v.id : '' }); }
    for (const i of this.deChacra('ingresos', cid)) if (en(i.fecha)) out.push({ fecha: i.fecha, monto: i.monto, concepto: i.concepto, grupo: 'Otros ingresos', ruta: 'ingresos' });
    for (const m of this.deChacra('movimientos', cid)) {
      const f = m.fechaReal || m.fecha;
      if (!en(f)) continue;
      if (m.contrataId) { const c = this.get('contratas', m.contrataId); out.push({ fecha: f, monto: -m.monto, concepto: (m.tipo === 'pago' ? 'Pago' : 'Adelanto') + ' a contrata ' + (c ? c.contratista : ''), grupo: 'Mano de obra', ruta: 'contrata/' + m.contrataId }); }
      else if (m.tipo === 'pago' || m.tipo === 'adelanto') out.push({ fecha: f, monto: -m.monto, concepto: (m.tipo === 'pago' ? 'Pago a ' : 'Adelanto a ') + nomTr(m.trabajadorId), grupo: 'Mano de obra', ruta: 'liquidacion/' + m.trabajadorId });
    }
    for (const g of this.deChacra('gastos', cid)) { const f = g.pagado === false ? null : (g.fechaPago || g.fecha); if (en(f)) out.push({ fecha: f, monto: -g.monto, concepto: g.descripcion, grupo: g.categoria, ruta: 'gastos' }); }
    for (const i of this.deChacra('inversiones', cid)) if (en(i.fecha)) out.push({ fecha: i.fecha, monto: -i.monto, concepto: i.descripcion, grupo: 'Inversión', ruta: 'inversiones' });
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  },
};

/* PIN: se guarda solo su huella (SHA-256), nunca el número. */
async function huellaPin(pin, sal) {
  const datos = new TextEncoder().encode('michacra|' + sal + '|' + pin);
  if (window.crypto && crypto.subtle) {
    const h = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of datos) h = ((h << 5) + h + b) >>> 0;
  return 'x' + h.toString(16);
}
