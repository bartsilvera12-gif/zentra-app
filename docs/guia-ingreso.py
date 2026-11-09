"""Arma la guía de una página para entrar a la app con código de empresa.

Se genera con un script y no a mano para poder cambiarle el código y el nombre
de la empresa sin rehacer el PDF: cada cliente que entra con su propio ERP
necesita el suyo, y son todos la misma hoja con dos palabras distintas.

    python3 docs/guia-ingreso.py ROSALINDA "Rosa Linda"
"""
import sys

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

CODIGO = sys.argv[1] if len(sys.argv) > 1 else "ROSALINDA"
EMPRESA = sys.argv[2] if len(sys.argv) > 2 else "Rosa Linda"
SALIDA = sys.argv[3] if len(sys.argv) > 3 else f"docs/ingreso-{CODIGO.lower()}.pdf"

AZUL = HexColor("#04617A")
CIAN = HexColor("#209EBB")
TINTA = HexColor("#141A2E")
GRIS = HexColor("#65707F")
FONDO = HexColor("#F3F5F8")

W, H = A4
c = canvas.Canvas(SALIDA, pagesize=A4)
c.setTitle(f"Cómo entrar a Zentra Móvil · {EMPRESA}")

# Encabezado
c.setFillColor(AZUL)
c.rect(0, H - 42 * mm, W, 42 * mm, stroke=0, fill=1)
c.setFillColor(HexColor("#FFFFFF"))
c.setFont("Helvetica-Bold", 22)
c.drawString(20 * mm, H - 22 * mm, "Cómo entrar a Zentra Móvil")
c.setFont("Helvetica", 12)
c.drawString(20 * mm, H - 31 * mm, EMPRESA)

y = H - 58 * mm


def paso(n, titulo, cuerpo):
    """Un paso numerado. El número en un círculo, que es lo que se sigue con el
    dedo cuando alguien lee esto con el teléfono en la otra mano."""
    global y
    c.setFillColor(CIAN)
    c.circle(24 * mm, y + 1.6 * mm, 5 * mm, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(24 * mm, y - 0.6 * mm, str(n))

    c.setFillColor(TINTA)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(35 * mm, y, titulo)
    y -= 6.5 * mm

    c.setFillColor(GRIS)
    c.setFont("Helvetica", 11)
    for linea in cuerpo:
        c.drawString(35 * mm, y, linea)
        y -= 5.5 * mm
    y -= 7 * mm


paso(1, "Descargá la app", [
    "Buscá “Zentra Movil” en la App Store y descargala.",
])

paso(2, "Abrila y tocá “Ya tengo cuenta”", [
    "No hace falta registrarse: tu usuario ya está creado.",
])

paso(3, "Escribí el código de la empresa", [
    "Es lo primero que pide y es lo que conecta la app con el sistema",
    "de " + EMPRESA + ".",
])

# El código, destacado: es el único dato que la persona no conoce de memoria.
c.setFillColor(FONDO)
c.roundRect(35 * mm, y - 4 * mm, 70 * mm, 16 * mm, 3 * mm, stroke=0, fill=1)
c.setFillColor(AZUL)
c.setFont("Courier-Bold", 20)
c.drawCentredString(70 * mm, y + 1.5 * mm, CODIGO)
y -= 18 * mm

paso(4, "Entrá con tu correo y tu contraseña", [
    "Los mismos con los que entrás al sistema desde la computadora.",
])

paso(5, "Listo", [
    "Vas a ver el stock, las ventas y los clientes de " + EMPRESA + ".",
    "Cada uno ve lo que le corresponde según su puesto.",
])

# Pie
c.setStrokeColor(HexColor("#E3E7EE"))
c.setLineWidth(0.8)
c.line(20 * mm, 30 * mm, W - 20 * mm, 30 * mm)

c.setFillColor(TINTA)
c.setFont("Helvetica-Bold", 10.5)
c.drawString(20 * mm, 23 * mm, "¿No podés entrar?")
c.setFillColor(GRIS)
c.setFont("Helvetica", 10)
c.drawString(20 * mm, 17.5 * mm,
             "El código se escribe sin espacios y no distingue mayúsculas.")
c.drawString(20 * mm, 12.5 * mm,
             "Si el correo o la contraseña no andan, pedile al administrador "
             "que los revise.")

c.showPage()
c.save()
print("escrito:", SALIDA)
