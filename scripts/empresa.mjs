/**
 * Agrega o cambia una empresa en el directorio del `.env.local`.
 *
 *   npm run empresa -- JM "Distribuidora JM" https://xxxx.supabase.co sb_publishable_...
 *   npm run empresa -- JM "Distribuidora JM" https://… sb_publishable_… zentra_jm
 *   npm run empresa -- JM --borrar
 *   npm run empresa              (lista lo que hay)
 *
 * El directorio es un JSON en una sola línea dentro de un archivo .env. Escribirlo
 * a mano sale mal seguido: una comilla de más, un salto de línea en el medio, un
 * espacio. Esto lo arma bien y avisa si algo no cierra.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV = ".env.local";
const CLAVE = "NEXT_PUBLIC_DIRECTORIO_JSON";
const ROJO = "\x1b[31m", VERDE = "\x1b[32m", GRIS = "\x1b[90m", FIN = "\x1b[0m";

function salir(msg) {
  console.error(`\n${ROJO}${msg}${FIN}\n`);
  process.exit(1);
}

if (!existsSync(ENV)) salir(`No existe ${ENV}. Copiá .env.example y completalo primero.`);

const lineas = readFileSync(ENV, "utf8").split("\n");
const i = lineas.findIndex((l) => l.trim().startsWith(`${CLAVE}=`));

let directorio = {};
if (i >= 0) {
  const crudo = lineas[i].slice(lineas[i].indexOf("=") + 1).trim();
  try {
    directorio = JSON.parse(crudo);
  } catch (e) {
    salir(`La línea ${CLAVE} que ya está en ${ENV} no es un JSON válido (${e.message}).\nBorrala a mano y volvé a intentar.`);
  }
}

const [codigoCrudo, ...resto] = process.argv.slice(2);

if (!codigoCrudo) {
  const entradas = Object.entries(directorio);
  console.log(`\nDirectorio en ${ENV}:`);
  if (!entradas.length) console.log(`  ${GRIS}(vacío — ningún código de empresa configurado)${FIN}`);
  for (const [c, v] of entradas) {
    console.log(`  ${c}  →  ${v.nombre || "(sin nombre)"}  ${GRIS}${v.supabaseUrl}${v.schema ? `  schema ${v.schema}` : ""}${FIN}`);
  }
  console.log(`\n${GRIS}Agregar:  npm run empresa -- JM "Distribuidora JM" https://xxxx.supabase.co sb_publishable_...${FIN}\n`);
  process.exit(0);
}

// Misma normalización que hace la app, o el código no resolvería.
const codigo = codigoCrudo.trim().toUpperCase().replace(/[\s-]/g, "");
if (!codigo) salir("El código no puede estar vacío.");

if (resto[0] === "--borrar") {
  if (!directorio[codigo]) salir(`${codigo} no está en el directorio.`);
  delete directorio[codigo];
  console.log(`\n${VERDE}${codigo} borrado del directorio.${FIN}`);
} else {
  // El cuarto dato es opcional: el schema. Hace falta cuando la instalación no
  // tiene nuestras tablas sino vistas sobre las del cliente, que viven en el
  // suyo.
  // `ruc=` y `ciudad=` van por nombre y no por posición: son opcionales, se
  // cargan tarde (cuando el cliente los manda) y nadie se va a acordar de que
  // el sexto argumento era la ciudad.
  const sueltos = {};
  const posicionales = resto.filter((a) => {
    const m = /^(ruc|ciudad)=(.*)$/i.exec(a);
    if (!m) return true;
    sueltos[m[1].toLowerCase()] = m[2].trim();
    return false;
  });
  const [nombre, url, clave, schema] = posicionales;
  if (!nombre || !url || !clave) {
    salir('Faltan datos.\n  npm run empresa -- JM "Distribuidora JM" https://xxxx.supabase.co sb_publishable_...');
  }
  const limpia = url.trim().replace(/\/$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(limpia)) {
    salir(`La URL tiene que ser https://algo, sin barra final ni ruta. Recibí: ${limpia}`);
  }
  if (clave.startsWith("sb_secret_") || /^eyJ/.test(clave) === false && !clave.startsWith("sb_publishable_")) {
    if (clave.startsWith("sb_secret_")) {
      salir("Esa es la clave SECRETA. Nunca puede ir en la app: usá la publishable (sb_publishable_…).");
    }
    console.log(`${GRIS}Aviso: la clave no empieza con sb_publishable_ ni con eyJ. Si Supabase la acepta, está bien.${FIN}`);
  }
  if (schema && !/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    salir(`"${schema}" no parece un nombre de schema. Van en minúsculas, sin espacios ni puntos.`);
  }
  directorio[codigo] = {
    nombre: nombre.trim(),
    supabaseUrl: limpia,
    anonKey: clave.trim(),
    ...(schema ? { schema: schema.trim() } : {}),
    // Para la cabecera de la factura. Sin RUC, la factura sale rotulada como
    // comprobante interno en vez de mostrar uno que no es de esta empresa.
    ...(sueltos.ruc ? { ruc: sueltos.ruc } : {}),
    ...(sueltos.ciudad ? { ciudad: sueltos.ciudad } : {}),
  };
  console.log(`\n${VERDE}${codigo} → ${nombre.trim()}${FIN}`);
  console.log(`  ${GRIS}${limpia}${schema ? `  schema ${schema.trim()}` : ""}${FIN}`);
  if (!sueltos.ruc) {
    console.log(
      `  ${GRIS}Sin RUC: las facturas de esta empresa van a salir como comprobante interno.`
        + `\n  Cargalo cuando lo tengas:  npm run empresa -- ${codigo} ... ruc=80012345-0 ciudad="Asunción"${FIN}`,
    );
  }
}

// Sin empresas, la línea se va del archivo. Dejar un `{}` no rompe nada, pero
// es ruido que después alguien tiene que interpretar.
if (!Object.keys(directorio).length) {
  if (i >= 0) {
    lineas.splice(i, 1);
    // Y el comentario que la encabeza, si quedó solo.
    if (i > 0 && lineas[i - 1].trim().startsWith("# Directorio de códigos")) lineas.splice(i - 1, 1);
    writeFileSync(ENV, lineas.join("\n").replace(/\n{3,}/g, "\n\n"));
  }
  console.log(`\nEl directorio quedó vacío: se quitó ${CLAVE} de ${ENV}.\n`);
  process.exit(0);
}

// Una sola línea, sin espacios: así lo lee un archivo .env.
const linea = `${CLAVE}=${JSON.stringify(directorio)}`;
if (i >= 0) lineas[i] = linea;
else {
  if (lineas.length && lineas[lineas.length - 1].trim() !== "") lineas.push("");
  lineas.push("# Directorio de códigos de empresa. Lo maneja: npm run empresa");
  lineas.push(linea);
}
writeFileSync(ENV, lineas.join("\n").replace(/\n{3,}/g, "\n\n"));

console.log(`\nGuardado en ${ENV}. Ahora:`);
console.log(`  npm run check        verifica que ese proyecto responda`);
console.log(`  npm run dev          probarlo\n`);
console.log(`${GRIS}Para Coolify, copiá esta línea entera como variable de BUILD:${FIN}`);
console.log(linea + "\n");
