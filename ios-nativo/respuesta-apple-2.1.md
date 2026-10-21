# Respuesta a Apple — Guideline 2.1, Information Needed

Pegar en **App Store Connect → Revisión de apps → Responder**, y además copiar
los puntos 2 a 6 en el campo **Notas** de "Información para el equipo de
revisión", que es lo que Apple pide explícitamente para futuros envíos.

Va en inglés porque es el idioma en que revisan.

---

## 1. Screen recording

(Adjuntar el video. El guion está al final de este archivo.)

## 2. Purpose and target audience

Zentra Móvil is the mobile client of Zentra, a business management system
(ERP) used by small and medium retail businesses in Paraguay: grocery stores,
hardware stores, appliance retailers, bakeries and similar.

The problem it solves: these businesses record sales, stock and customer
accounts on a desktop computer in the back office. The owner or the sales
clerk is usually on the shop floor, at a customer's home, or at a supplier's
warehouse, and cannot reach that computer. Zentra Móvil gives them the same
data on the phone: they can record a sale while standing in front of the
customer, check whether a product is actually in stock before promising a
delivery, look up how much a customer owes, and see how the month is going.

The audience is the business owner and their employees. It is not a consumer
app and it is not an internal app for a single company: Zentra is sold as a
subscription product to any business that wants it, and anyone can create an
account from the app's own sign-up screen.

## 3. Setting up and accessing the main features

Demo account (already configured in App Review Information):

- User: revision@neura.com.py
- Password: (the one provided in the App Review Information section)

This account belongs to a demonstration company populated with sample data.
It is not a real customer's data.

After signing in:

- **Inicio** (first tab) — the home screen, with the day's totals and shortcuts.
- **Reportes** (second tab) — sales reports by day, week and month.
- **Configuración** (third tab, gear icon) — settings, the subscription plan,
  and account deletion.

To reach the paid features: Configuración → the plan row. A sheet opens
showing the three plans.

The demo account already has an active paid plan. The sheet marks the current
plan and shows the purchase button on the other paid plan, so the purchase
flow can be tested from the demo account as it is. (At the time of writing the
current plan is "Emprendedor" and the button is on "Max".)

To delete the account: Configuración → scroll to the bottom → "Eliminar mi
cuenta". The deletion is performed from inside the app.

## 4. External services used

- **Supabase (self-hosted, api.neura.com.py)** — authentication and database.
  This is our own server, not supabase.com.
- **Zentra ERP API (sistemas.neura.com.py)** — our own backend. It serves the
  business data (sales, inventory, customers) and relays the WhatsApp
  conversations described below.
- **Zentra billing server (cobros.neura.com.py)** — our own server. It
  verifies App Store purchase receipts and activates the subscription.
- **Apple StoreKit 2 / App Store** — all in-app purchases. The app does not
  take payments through any other channel on iOS.
- **Firebase Cloud Messaging (Google)** — push notifications only.
- **WhatsApp Business Platform (Meta)** — each business connects its *own*
  WhatsApp Business account to its own Zentra installation, and the app shows
  those conversations. We do not provide the WhatsApp account; the business
  owns it and contracts it directly.

No AI services, no advertising networks, no analytics SDKs, no third-party
data providers.

### About user-generated content

The app contains a messaging screen, and we want to be explicit about what it
is, because it is not a social feature.

It shows the WhatsApp conversations between **the business and its own
customers**, through the business's own WhatsApp Business account. There is no
feed, no public profiles, no discovery, and no way for one user of the app to
contact another user of the app. A shop clerk only ever sees the conversations
of the shop they work for, with people who wrote to that shop's WhatsApp
number.

Because of that there is no community to moderate, and no reporting or
blocking mechanism inside the app: blocking a phone number is done from
WhatsApp itself, by the business that owns the number. If App Review considers
that a reporting mechanism is still required here, we will add it — please let
us know.

## 5. Regional differences

There are none. The app has the same features and the same content in every
region. It is available in Spanish only. Prices are set per region by App
Store Connect; everything else is identical.

## 6. Regulated industry / third-party material

The app does not operate in a regulated industry. It is general-purpose
business management software: sales, inventory, customers and reports.

It contains no third-party protected material. All content shown in the app is
data entered by the business that uses it, plus their own WhatsApp
conversations, which belong to that business.

---

# Guion para el video (lo grabás vos, en el iPhone)

Apple lo quiere **en un teléfono físico**, empezando por el lanzamiento de la
app. Grabá con la grabación de pantalla de iOS. Dura 2 o 3 minutos.

1. **Arrancá desde la pantalla de inicio del iPhone** y tocá el ícono de
   Zentra. Que se vea el arranque, no empieces con la app abierta.
2. **Registro.** Tocá "Crear cuenta" y mostrá el formulario. No hace falta
   completar el registro: alcanza con que se vea que existe y qué pide.
3. **Login** con revision@neura.com.py.
4. **Inicio**: mostrá los totales del día y bajá un poco.
5. **Inventario y clientes**: entrá desde los accesos de Inicio, mostrá la
   lista y abrí una ficha.
6. **Nueva venta**: armá una venta con un producto, aunque no la termines.
7. **Reportes**: la pestaña del medio.
8. **Chat**: abrí una conversación. Esto es lo que Apple llama contenido
   generado por usuarios, así que tiene que verse.
9. **Contenido pago**: Configuración → el plan → que se vea la hoja con los
   planes y el botón de compra. **Hacé la compra completa y mostrá que el plan
   queda activado.** Esto es lo que más les interesa.

   Ojo: el boton de compra aparece en el plan que NO tenes. Despues de la
   compra del 2026-10-21 la cuenta demo quedo en Emprendedor, asi que ahora el
   boton esta en Max. Si volves a comprar, se invierte otra vez — mira que
   diga lo mismo que las notas antes de reenviar.
10. **Eliminar cuenta**: Configuración → abajo de todo → "Eliminar mi cuenta".
    Mostrá la confirmación. **No la confirmes**, o perdés la cuenta demo.
