# =============================================================================
# Zentra Móvil — imagen estática para Coolify.
#
# La app se compila a HTML y JavaScript sueltos (`output: "export"` en
# next.config.ts), así que la imagen final es sólo nginx sirviendo archivos. No
# levanta ningún proceso Node: pesa poco y consume casi nada en el servidor.
#
# OJO con las variables: Next las compila ADENTRO del bundle, no las lee al
# arrancar. Por eso van como `ARG` y hay que marcarlas como variables de BUILD
# en Coolify. Si las cargás sólo como variables de runtime, la imagen se
# construye sin ellas y la app arranca en modo datos de ejemplo.
# =============================================================================

# ---------- compilación ----------
FROM node:22-alpine AS build

WORKDIR /app

# Primero las dependencias: si no cambian, Docker reusa esta capa.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

ARG NEXT_PUBLIC_BACKEND=mock
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG NEXT_PUBLIC_DIRECTORIO_URL=""
ARG NEXT_PUBLIC_SOPORTE_WHATSAPP=""

ENV NEXT_PUBLIC_BACKEND=$NEXT_PUBLIC_BACKEND \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_DIRECTORIO_URL=$NEXT_PUBLIC_DIRECTORIO_URL \
    NEXT_PUBLIC_SOPORTE_WHATSAPP=$NEXT_PUBLIC_SOPORTE_WHATSAPP \
    NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm run build

# Falla acá y no en producción si el build quedó vacío.
RUN test -f out/index.html || (echo "ERROR: el build no generó out/index.html" && exit 1)

# ---------- servir ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
