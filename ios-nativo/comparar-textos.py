#!/usr/bin/env python3
"""
Qué textos de Android todavía no están en iOS.

Portar leyendo el código a ojo no alcanza: se te escapan los mensajes de error,
los vacíos y las etiquetas, que son justo los que nadie mira hasta que un
vendedor se los encuentra. Esto lo hace mecánico.

    python3 ios-nativo/comparar-textos.py

Compara las cadenas que ve una persona —con espacio, con mayúscula o acento,
sin pinta de código— entre `src/` y `ios-nativo/`. La interpolación se iguala:
`${x}` de TypeScript y `\(x)` de Swift cuentan como lo mismo.

No es exacto y no pretende serlo: sobran algunos y faltan otros. Sirve para
tener una lista por dónde empezar, no para dar algo por terminado.
"""
import re, sys, pathlib
from collections import defaultdict

RAIZ = pathlib.Path(__file__).resolve().parent.parent

RUIDO = re.compile(
    r'^\s*[|&=<>/+]|===|\?\?|=>|\bconst\b|\bexport\b|\breturn\b|^\w+\(|'
    r'select |insert |update |from |where |::|\.\w+\(|^[a-z]+\.[a-z]+', re.I)
FUERA = re.compile(r'^[a-z0-9_.\-/#%@]+$|px|rgba?\(|^\d|^M\d')


def textos(raiz, exts, saltar=()):
    out = defaultdict(set)
    for f in pathlib.Path(raiz).rglob("*"):
        if f.suffix not in exts or any(s in str(f) for s in saltar):
            continue
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for m in re.finditer(r'"([^"\\\n]{14,140})"', txt):
            v = m.group(1).strip()
            if " " not in v or FUERA.search(v) or RUIDO.search(v):
                continue
            # Mayúscula inicial o signo de apertura: así se escribe lo que se le
            # muestra a una persona, no un identificador.
            if not re.match(r'^[¿¡A-ZÁÉÍÓÚÑ]', v):
                continue
            out[v].add(f.name)
    return out


def norm(s):
    return re.sub(r'\s+', " ", re.sub(r'\$\{[^}]*\}|\\\([^)]*\)', "·", s)).strip().lower()


andro = textos(RAIZ / "src", {".ts", ".tsx"})
ios = textos(RAIZ / "ios-nativo" / "ZentraMovil", {".swift"}, saltar=("build",))
ya = {norm(k) for k in ios}

por_archivo = defaultdict(list)
for t, fs in andro.items():
    if norm(t) not in ya:
        por_archivo[sorted(fs)[0]].append(t)

total = sum(len(v) for v in por_archivo.values())
print(f"Textos de Android que le faltan a iOS: {total}\n")
for f, ts in sorted(por_archivo.items(), key=lambda x: -len(x[1])):
    print(f"\n=== {f}  ({len(ts)}) ===")
    for t in sorted(ts):
        print("  ·", t)

sys.exit(1 if total else 0)
