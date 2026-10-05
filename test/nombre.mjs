/**
 * Pruebas del nombre que se muestra en el encabezado.
 *
 *   npm run test:nombre
 *
 * El ERP devuelve el nombre legal completo y en mayúsculas. Lo que se prueba
 * acá es que se acorte sin equivocarse de apellido, que es el error que más
 * molesta: a nadie le gusta ver mal su nombre todos los días.
 */
import { nombreCorto, inicialDe, rolLegible, fechaDeHoy } from "../src/lib/nombre.ts";

const casos = [];
function t(nombre, fn) { casos.push([nombre, fn]); }
function igual(a, b) { if (a !== b) throw new Error(`esperaba ${JSON.stringify(b)}, fue ${JSON.stringify(a)}`); }

t("dos nombres y dos apellidos: el primero de cada uno", () => {
  igual(nombreCorto("KAREN MAGNOLIA AYALA URUNAGA"), "Karen Ayala");
  igual(nombreCorto("BARTOLOME SILVERA SANABRIA"), "Bartolome Silvera");
});

t("con dos o tres palabras no se adivina el apellido", () => {
  // Con tres, la tercera podría ser segundo nombre o segundo apellido. Se
  // toman las dos primeras: equivocarse de apellido es peor que uno de más.
  igual(nombreCorto("Juan Carlos Benitez"), "Juan Carlos");
  igual(nombreCorto("Ana Gimenez"), "Ana Gimenez");
  igual(nombreCorto("Caja"), "Caja");
});

t("una partícula marca dónde arranca el apellido, y va entera", () => {
  // Cortar en "La" daria un apellido que no existe. Peor que uno largo.
  igual(nombreCorto("MARIA DE LA CRUZ"), "Maria de la Cruz");
  igual(nombreCorto("jose da silva"), "Jose da Silva");
  igual(nombreCorto("ANA MARIA DEL PUERTO GONZALEZ"), "Ana del Puerto Gonzalez");
});

t("un nombre ya bien escrito no se toca", () => {
  igual(nombreCorto("McDonald Perez"), "McDonald Perez");
});

t("los compuestos llevan mayúscula en cada parte", () => {
  igual(nombreCorto("MARIA-JOSE AYALA"), "Maria-Jose Ayala");
});

t("un correo se deja entero: cortarlo lo vuelve otra dirección", () => {
  igual(nombreCorto("karen.ayala@neura.com.py"), "karen.ayala@neura.com.py");
});

t("vacío no rompe ni inventa", () => {
  igual(nombreCorto(""), "");
  igual(nombreCorto("   "), "");
  igual(inicialDe(""), "?");
});

t("la inicial sale del nombre, en mayúscula", () => {
  igual(inicialDe("karen magnolia"), "K");
});

t("el rol se lee como se habla, no como lo guarda la base", () => {
  igual(rolLegible("vendedor_movil"), "Vendedor móvil");
  igual(rolLegible("VENDEDOR"), "Vendedor");
  igual(rolLegible("admin"), "Administrador");
  igual(rolLegible(""), "");
});

t("la fecha es la de hoy, no una escrita en el codigo", () => {
  // Estaba fija y mostraba siempre el mismo dia. Alguien la lee y cree que los
  // numeros de al lado son de ese dia.
  igual(fechaDeHoy(new Date(2026, 9, 5)), "Lun 5 oct 2026");
  igual(fechaDeHoy(new Date(2026, 0, 1)), "Jue 1 ene 2026");
});

let malas = 0;
for (const [nombre, fn] of casos) {
  try { await fn(); console.log("  OK · " + nombre); }
  catch (e) { malas++; console.log("  FALLA · " + nombre + "\n        " + e.message); }
}
console.log(malas ? `\n${malas} prueba(s) fallaron.` : "\nNombres: todas las pruebas pasaron.");
process.exitCode = malas ? 1 : 0;
