/**
 * Lo que se pregunta al crear la cuenta, y cuándo está bien contestado.
 *
 * Está acá y no en la pantalla porque son dos pantallas: la de la app web y
 * la nativa de iOS. Las listas de opciones tienen que decir exactamente lo
 * mismo en las dos, si no el día que alguien cuente "de dónde vienen los
 * clientes" va a estar sumando "Instagram" con "instagram o face".
 *
 * Las preguntas nuevas —nacimiento, rubro, tamaño, cómo nos conoció— son
 * datos personales que antes no pedíamos. Eso obliga a dos cosas fuera del
 * código: declararlas en la sección de seguridad de datos de Play y nombrarlas
 * en la política de privacidad. Están hechas las dos; si se agrega otra
 * pregunta acá, hay que volver a tocarlas.
 */

/** De dónde salió la persona. Para saber qué sirve y qué no. */
export const COMO_CONOCIO = [
  "Me la recomendó un conocido",
  "Instagram o Facebook",
  "TikTok",
  "Buscando en Google",
  "Por WhatsApp",
  "Un vendedor de Zentra",
  "Otro",
] as const;

/** Cuánta gente trabaja en el negocio. En tramos: nadie sabe el número exacto. */
export const TAMANOS = ["Solo yo", "2 a 5 personas", "6 a 10 personas", "11 a 20 personas", "Más de 20"] as const;

/**
 * A qué se dedica. La lista es corta a propósito: una de treinta rubros no se
 * lee, se elige el primero. "Otro" está último y existe para no mentir.
 */
export const RUBROS = [
  "Despensa o minimercado",
  "Ropa y calzado",
  "Comida y bebidas",
  "Farmacia o perfumería",
  "Ferretería o materiales",
  "Celulares y tecnología",
  "Librería y papelería",
  "Distribuidora o mayorista",
  "Servicios",
  "Otro",
] as const;

export type DatosRegistro = {
  nombre: string;
  empresa: string;
  correo: string;
  password: string;
  password2: string;
  nacimiento: string;
  comoConocio: string;
  tamano: string;
  rubro: string;
};

/** La edad que se acepta. Abajo no se puede firmar; arriba es un año mal tipeado. */
export const EDAD_MINIMA = 16;
export const EDAD_MAXIMA = 100;

/** Los años cumplidos a una fecha dada. Se le pasa el hoy para poder probarlo. */
export function edadEn(nacimiento: string, hoy: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nacimiento.trim());
  if (!m) return null;
  const [, a, me, d] = m;
  const f = new Date(Number(a), Number(me) - 1, Number(d));
  // Una fecha como 2025-02-31 se convierte sola en marzo: así se la caza.
  if (f.getFullYear() !== Number(a) || f.getMonth() !== Number(me) - 1 || f.getDate() !== Number(d)) return null;
  let edad = hoy.getFullYear() - f.getFullYear();
  const cumplio =
    hoy.getMonth() > f.getMonth() || (hoy.getMonth() === f.getMonth() && hoy.getDate() >= f.getDate());
  if (!cumplio) edad--;
  return edad;
}

/**
 * Los pasos del alta, en orden. Son tres y no una sola pantalla larga: nueve
 * campos seguidos se leen como un formulario de banco, y con el teclado
 * abierto quedaban dos a la vista. De a tres o cuatro por paso, cada pantalla
 * entra entera.
 */
export const PASOS_REGISTRO = ["cuenta", "negocio", "vos"] as const;
export type PasoRegistro = (typeof PASOS_REGISTRO)[number];

/**
 * Qué falta en un paso, en una frase. `null` cuando el paso está completo.
 *
 * Una sola frase y no una lista: en un teléfono, varios errores en rojo al
 * mismo tiempo no se leen. El orden es el de la pantalla: señalar la
 * contraseña cuando la persona todavía no terminó de escribir el nombre la
 * manda a buscar un error que no cometió.
 */
export function validarPaso(paso: PasoRegistro, d: DatosRegistro, hoy: Date = new Date()): string | null {
  if (paso === "cuenta") {
    const nombre = d.nombre.trim().replace(/\s+/g, " ");
    // Nombre Y apellido: con el nombre solo, después no se sabe a quién
    // facturarle. Dos palabras de dos letras es el mínimo que no deja pasar
    // "Juan " ni "J P".
    const partes = nombre.split(" ").filter((p) => p.length >= 2);
    if (partes.length < 2) return "Escribí tu nombre y tu apellido.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo.trim())) return "Revisá el correo: parece que falta algo.";
    if (d.password.length < 6) return "La contraseña necesita al menos 6 caracteres.";
    if (d.password !== d.password2) return "Las dos contraseñas no son iguales.";
    return null;
  }
  if (paso === "negocio") {
    if (!(RUBROS as readonly string[]).includes(d.rubro)) return "Elegí a qué se dedica tu negocio.";
    if (!(TAMANOS as readonly string[]).includes(d.tamano)) return "Elegí cuántas personas trabajan con vos.";
    return null;
  }
  const edad = edadEn(d.nacimiento, hoy);
  if (edad === null) return "Poné tu fecha de nacimiento.";
  if (edad < EDAD_MINIMA) return `Hay que tener al menos ${EDAD_MINIMA} años para abrir una cuenta.`;
  if (edad > EDAD_MAXIMA) return "Revisá el año de nacimiento.";
  if (!(COMO_CONOCIO as readonly string[]).includes(d.comoConocio)) return "Contanos cómo conociste Zentra.";
  return null;
}

/**
 * Qué falta en todo el alta: lo primero que falte, paso por paso. Es lo que
 * se corre al final, antes de mandar, por si algún paso quedó a medias.
 */
export function validarRegistro(d: DatosRegistro, hoy: Date = new Date()): string | null {
  for (const paso of PASOS_REGISTRO) {
    const falta = validarPaso(paso, d, hoy);
    if (falta) return falta;
  }
  return null;
}

/** En qué paso está lo que falta, para volver ahí y no dejar a nadie buscando. */
export function pasoConFalta(d: DatosRegistro, hoy: Date = new Date()): PasoRegistro | null {
  return PASOS_REGISTRO.find((p) => validarPaso(p, d, hoy) !== null) ?? null;
}

/**
 * Lo que viaja a la base al registrarse.
 *
 * El disparador de la base lee estas claves para armar la empresa y el
 * perfil. Si se cambia un nombre acá hay que cambiarlo en
 * `supabase/16_registro_datos.sql`, y no hay quien avise: por eso está en un
 * solo lugar y lo usan las dos apps.
 */
export function metadatosDeRegistro(d: DatosRegistro): Record<string, string> {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  return {
    nombre,
    // Sin nombre de negocio, la empresa se llama como la persona: es lo que
    // pasa con quien vende por su cuenta, y pedirle que invente un nombre
    // comercial para poder entrar sería inventarle un trámite.
    empresa: d.empresa.trim() || nombre,
    nacimiento: d.nacimiento.trim(),
    como_conocio: d.comoConocio,
    tamano: d.tamano,
    rubro: d.rubro,
  };
}
