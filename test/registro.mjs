/**
 * Lo que se pregunta al crear la cuenta.
 *
 *   npm run test:registro
 *
 * Se prueba la validación y no la pantalla: la validación es la que corre dos
 * veces —en la app y en la nativa de iOS— y la que decide si alguien puede
 * crear una cuenta con la contraseña mal tipeada.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  COMO_CONOCIO,
  EDAD_MINIMA,
  edadEn,
  metadatosDeRegistro,
  RUBROS,
  TAMANOS,
  validarRegistro,
} from "../src/lib/registro.ts";

const HOY = new Date(2026, 9, 27); // 27 de octubre de 2026

/** Un alta completa y correcta, para ir rompiéndola de a un campo. */
function completo(cambios = {}) {
  return {
    nombre: "Bartolomé Silvera",
    empresa: "Despensa Doña Lucía",
    correo: "bart@zentra.com.py",
    password: "secreta1",
    password2: "secreta1",
    nacimiento: "1990-03-15",
    comoConocio: COMO_CONOCIO[0],
    tamano: TAMANOS[1],
    rubro: RUBROS[0],
    ...cambios,
  };
}

test("un alta completa pasa", () => {
  assert.equal(validarRegistro(completo(), HOY), null);
});

test("hace falta el apellido, no solo el nombre", () => {
  assert.match(validarRegistro(completo({ nombre: "Bartolomé" }), HOY), /nombre y tu apellido/);
  // Una inicial no es un apellido.
  assert.match(validarRegistro(completo({ nombre: "Bartolomé S" }), HOY), /nombre y tu apellido/);
  assert.equal(validarRegistro(completo({ nombre: "  Ana   Maria  Benítez " }), HOY), null);
});

test("las dos contraseñas tienen que ser iguales", () => {
  // Mal tipeada acá no se nota hasta el dia siguiente, con la cuenta ya creada.
  assert.match(validarRegistro(completo({ password2: "secreta2" }), HOY), /no son iguales/);
  assert.match(validarRegistro(completo({ password: "123", password2: "123" }), HOY), /6 caracteres/);
});

test("la fecha de nacimiento tiene que ser una fecha posible", () => {
  assert.match(validarRegistro(completo({ nacimiento: "" }), HOY), /fecha de nacimiento/);
  assert.match(validarRegistro(completo({ nacimiento: "2025-02-31" }), HOY), /fecha de nacimiento/);
  assert.match(validarRegistro(completo({ nacimiento: "2030-01-01" }), HOY), /al menos 16 años/);
  assert.match(validarRegistro(completo({ nacimiento: "1850-01-01" }), HOY), /año de nacimiento/);
});

test("la edad se cuenta por cumpleaños, no por año", () => {
  // Cumple mañana: todavía no los tiene.
  assert.equal(edadEn("2010-10-28", HOY), EDAD_MINIMA - 1);
  // Cumple hoy: ya los tiene.
  assert.equal(edadEn("2010-10-27", HOY), EDAD_MINIMA);
  assert.equal(edadEn("no es una fecha", HOY), null);
});

test("las tres listas son listas: no entra cualquier cosa", () => {
  assert.match(validarRegistro(completo({ rubro: "lo que sea" }), HOY), /a qué se dedica/);
  assert.match(validarRegistro(completo({ tamano: "" }), HOY), /cuántas personas/);
  assert.match(validarRegistro(completo({ comoConocio: "" }), HOY), /cómo conociste/);
});

test("el negocio sin nombre se llama como la persona", () => {
  // Quien vende por su cuenta no tiene nombre comercial, y pedirle que
  // invente uno para poder entrar es inventarle un trámite.
  assert.equal(validarRegistro(completo({ empresa: "" }), HOY), null);
  assert.equal(metadatosDeRegistro(completo({ empresa: "" })).empresa, "Bartolomé Silvera");
});

test("los metadatos usan las claves que lee la base", () => {
  // Las mismas que `supabase/16_registro_datos.sql`. Si cambia una, el dato
  // llega nulo y nadie avisa.
  const m = metadatosDeRegistro(completo());
  assert.deepEqual(Object.keys(m).sort(), [
    "como_conocio",
    "empresa",
    "nacimiento",
    "nombre",
    "rubro",
    "tamano",
  ]);
  assert.equal(m.nombre, "Bartolomé Silvera");
  assert.equal(m.nacimiento, "1990-03-15");
  // La contraseña no es un metadato: viaja aparte y no se guarda en el perfil.
  assert.ok(!JSON.stringify(m).includes("secreta1"));
});
