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
ARG NEXT_PUBLIC_DIRECTORIO_JSON=""
ARG NEXT_PUBLIC_SOPORTE_WHATSAPP=""
ARG NEXT_PUBLIC_API_URL=""

ENV NEXT_PUBLIC_BACKEND=$NEXT_PUBLIC_BACKEND \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_DIRECTORIO_URL=$NEXT_PUBLIC_DIRECTORIO_URL \
    NEXT_PUBLIC_DIRECTORIO_JSON=$NEXT_PUBLIC_DIRECTORIO_JSON \
    NEXT_PUBLIC_SOPORTE_WHATSAPP=$NEXT_PUBLIC_SOPORTE_WHATSAPP \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY . .

# Qué variables llegaron realmente. Es la primera pregunta cuando una imagen sale
# con datos de ejemplo, y la respuesta queda en el log del deploy.
#
# El caso peligroso es que en Coolify queden como variables de RUNTIME: entonces
# acá no llega ninguna, BACKEND vale "mock" por defecto, el build sale bien y la
# app arranca con datos de ejemplo sin que nadie se entere.
RUN echo "---- variables en el build ----" \
 && echo "  NEXT_PUBLIC_BACKEND         = $NEXT_PUBLIC_BACKEND" \
 && echo "  NEXT_PUBLIC_SUPABASE_URL    = ${NEXT_PUBLIC_SUPABASE_URL:-(vacía)}" \
 && echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY = $([ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && echo presente || echo '(vacía)')" \
 && echo "  NEXT_PUBLIC_DIRECTORIO_URL  = ${NEXT_PUBLIC_DIRECTORIO_URL:-(vacía)}" \
 && echo "  NEXT_PUBLIC_DIRECTORIO_JSON = $([ -n "$NEXT_PUBLIC_DIRECTORIO_JSON" ] && echo presente || echo '(vacío)')" \
 && echo "  NEXT_PUBLIC_API_URL         = ${NEXT_PUBLIC_API_URL:-(vacía)}" \
 && echo "-------------------------------" \
 && if [ "$NEXT_PUBLIC_BACKEND" = "mock" ]; then \
      echo "AVISO: BACKEND=mock. La imagen va a quedar con DATOS DE EJEMPLO."; \
      echo "Si no era la idea, en Coolify marcá las variables como de BUILD, no de runtime."; \
    fi

RUN npm run build

# Falla acá y no en producción si el build quedó vacío.
RUN test -f out/index.html || (echo "ERROR: el build no generó out/index.html" && exit 1)

# Y que la URL pedida haya quedado horneada de verdad. Se busca la URL exacta: la
# cadena "supabase.co" aparece igual en la librería, así que no prueba nada.
RUN if [ -n "$NEXT_PUBLIC_API_URL" ]; then \
      grep -rqF "$NEXT_PUBLIC_API_URL" out/_next/static/chunks/ \
        || (echo "ERROR: la URL de la API no quedó dentro del build." && exit 1); \
      echo "OK: la URL de la API quedó dentro del build."; \
    fi

RUN if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then \
      grep -rqF "$NEXT_PUBLIC_SUPABASE_URL" out/_next/static/chunks/ \
        || (echo "ERROR: la URL de Supabase no quedó dentro del build." && exit 1); \
      echo "OK: la URL de Supabase quedó dentro del build."; \
    fi

# ---------- servir ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
