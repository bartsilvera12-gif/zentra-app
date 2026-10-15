# Desplegar el server de cobros en una VPS nueva

Paso a paso, en orden. Cada bloque se copia y se pega.

Supone Ubuntu o Debian recién instalado. Con otra distribución cambian los
comandos de paquetes y nada más.

---

## Antes de empezar: tres decisiones

No son técnicas pero frenan todo si faltan:

1. **El dominio del server.** Algo como `cobros.zentra.com.py`. Tiene que
   existir y apuntar a la IP de la VPS **antes** del paso 7, porque el
   certificado se emite verificando ese dominio. No hace falta uno nuevo: a esa
   URL le pega sólo PagoPar, nadie la ve, así que un subdominio de uno que ya
   tengas alcanza.

   Si el DNS está en Cloudflare, el registro va en **DNS only** (nube gris). Con
   el proxy prendido el certificado se complica, y —peor— Cloudflare puede
   frenar el aviso de PagoPar tomándolo por un bot: el pago entra, el aviso
   rebota y el cobro queda `pendiente` como si nadie hubiera pagado.
2. **Contra qué Supabase trabaja.** El de siempre (`api.neura.com.py`) o uno
   nuevo. Si es nuevo, hay que correr las migraciones ahí.
3. **Si el comercio de PagoPar está habilitado para producción.** Eso lo
   destraba el soporte de ellos y puede tardar. Mientras tanto se trabaja con
   las claves de desarrollo y `PAGOPAR_ENV=staging`.

---

## 1. Entrar y actualizar

```bash
ssh root@LA-IP-DE-LA-VPS
apt update && apt upgrade -y
```

## 2. Un usuario que no sea root

El server no tiene por qué correr como root: si algún día lo comprometen, que
no se lleve la máquina entera.

```bash
adduser --system --group --home /opt/zentra-cobros zentra
```

`--system` crea un usuario sin contraseña y sin shell de login. Es para que
corra el servicio, no para entrar con él.

## 3. Firewall

Sólo SSH y web. El server escucha en `127.0.0.1`, así que su puerto no se abre
nunca desde afuera.

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
ufw status
```

## 4. Node

Hace falta 20 o más nuevo: el `--env-file` que usamos para leer el `.env`
existe desde la 20.6.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git
node -v        # tiene que decir v22.x
```

## 5. Traer el código

El repo es privado, así que `git clone` necesita permiso. La forma limpia es
una **deploy key**: una llave que sólo sirve para leer este repositorio.

Se genera con tu usuario normal, no con `zentra`. El usuario del servicio no
tiene shell y hacerlo ahí es pelear con permisos para nada: `zentra` sólo
necesita *correr* el server, no bajarlo.

```bash
ssh-keygen -t ed25519 -C "vps-zentra-cobros" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Lo que imprime el `cat` se pega en GitHub → el repo `zentra-app` → **Settings →
Deploy keys → Add deploy key**. Sin marcar *Allow write access*: sólo lee.

```bash
sudo mkdir -p /opt/zentra-app
sudo chown "$USER:$USER" /opt/zentra-app
git clone git@github.com:bartsilvera12-gif/zentra-app.git /opt/zentra-app
cd /opt/zentra-app/server
npm install --omit=dev
```

La primera vez pregunta si confiás en `github.com`. Esa huella sí es pública y
conocida, así que `yes`.

## 6. El `.env`

```bash
cd /opt/zentra-app/server
cp .env.example .env
nano .env
sudo chown root:root .env && sudo chmod 600 .env
```

El `.env` queda de `root` y en 600 **a propósito**: systemd lo lee como root
antes de bajar a `zentra`, así que el servicio arranca igual y el usuario que
corre el proceso no puede leer sus propios secretos. Si algún día alguien
entra por el server, no se lleva las claves.

Lo que hay que completar:

| Variable | De dónde sale |
|---|---|
| `PAGOPAR_PUBLIC_KEY` / `PAGOPAR_PRIVATE_KEY` | Panel de PagoPar → *Integrar con mi sitio web* |
| `PAGOPAR_ENV` | `staging` mientras probás, `production` después |
| `SUPABASE_URL` | La URL de tu Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |
| `ALLOWED_ORIGINS` | El dominio de la página donde se paga |

**Ese archivo tiene las dos llaves del negocio.** Con la privada de PagoPar se
firman pedidos y se falsifican avisos de pago; con la `service_role` se pasa
por encima de RLS. De ahí el `chmod 600` y el `UMask` del paso 8.

### Y que `zentra` pueda leer el código

El código se baja con tu usuario, así que queda con tus permisos. Si tu carpeta
personal es `700` —lo normal—, el servicio arranca y muere en el acto: `zentra`
no puede leer ni `src/index.js`.

```bash
sudo chmod 755 /opt/zentra-app /opt/zentra-app/server
sudo chmod -R a+rX /opt/zentra-app/server/src /opt/zentra-app/server/node_modules
```

El `.env` NO entra acá y sigue en `600` de root: lo lee systemd antes de bajar a
`zentra`, así que el servicio arranca igual.

## 7. Las migraciones y los precios

En el SQL editor de Supabase, en orden:

```
supabase/06_planes.sql
supabase/07_cobros.sql
supabase/08_precios.sql
```

Y después los precios, que arrancan en cero y sin vender a propósito:

```sql
update zentra.planes set precio_mensual = 150000, vendible = true where codigo = 'max';
update zentra.planes set precio_mensual =  80000, vendible = true where codigo = 'emprendedor';
```

(Los montos son de ejemplo. Poné los tuyos.)

## 8. Probar las claves ANTES de exponer nada

```bash
cd /opt/zentra-app/server
sudo node --env-file=.env src/prueba.js
```

Con `sudo` porque el `.env` es de root. Sin él, Node dice **`.env: not found`**
—aunque el archivo esté ahí— y se pierde un rato buscando un archivo que nunca
faltó.

Crea un pedido de prueba de mil guaraníes que caduca en una hora. **No pagues
nada.**

Si dice *"Las claves andan"*, seguí. Si dice *"Token no corresponde"*, el
problema está en el paso 6 o en la habilitación del comercio — y el propio
mensaje te dice cuál de las tres causas mirar. **No sigas hasta que esto pase**,
porque después el mismo error aparece enterrado en los logs del servicio y
cuesta diez veces más encontrarlo.

## 9. Que el servicio se levante solo

Si entraste como root, `cat >` alcanza. Si entraste con un usuario normal
—lo recomendable— va con `sudo tee`, que es lo que está acá: `sudo cat >`
no funciona, porque el que escribe es el shell y el shell no es root.

```bash
sudo tee /etc/systemd/system/zentra-cobros.service > /dev/null <<'EOF'
[Unit]
Description=Zentra — cobros con PagoPar
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/zentra-app/server
EnvironmentFile=/opt/zentra-app/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
User=zentra
Group=zentra
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now zentra-cobros
sudo systemctl status zentra-cobros --no-pager
```

Tiene que decir `active (running)`. Si no:

```bash
journalctl -u zentra-cobros -n 50 --no-pager
```

Y desde la propia VPS, que el proceso contesta:

```bash
curl -s localhost:8790/pagopar/health | python3 -m json.tool
```

Si no contesta nada, probá de nuevo en unos segundos: recién arrancado, el
proceso todavía no abrió el puerto y el `-s` esconde el error de conexión.

## 10. HTTPS por delante

PagoPar tiene que llegar al webhook desde internet y por HTTPS.

**Antes que nada, mirá si el 80 y el 443 están libres:**

```bash
sudo ss -lntp | grep -E ':80 |:443 '
```

Si algo ya escucha ahí —nginx, apache— **no instales Caddy**: los dos quieren
los mismos puertos y el que ya estaba sirviendo deja de servir. Saltá a *"Si la
VPS ya tiene nginx"*, más abajo.

Con los puertos libres, Caddy saca el certificado solo:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

cat > /etc/caddy/Caddyfile <<'EOF'
cobros.zentra.com.py {
    reverse_proxy 127.0.0.1:8790
}
EOF

systemctl reload caddy
```

Cambiá el dominio por el tuyo. Si el DNS todavía no apunta a la VPS, el
certificado falla: eso es lo que avisaba la decisión 1.

Desde tu máquina:

```bash
curl https://cobros.zentra.com.py/pagopar/health
```

Si las claves salen `(vacía)` o dice `FALTA SUPABASE_URL`, el `.env` no se está
leyendo: revisá el `EnvironmentFile` del paso 9.

### Si la VPS ya tiene nginx

No se reemplaza nada: se le agrega un sitio más. Lo de antes queda intacto.

```bash
sudo tee /etc/nginx/sites-available/cobros-zentra > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name cobros.zentra.com.py;

    location / {
        proxy_pass http://127.0.0.1:8790;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/cobros-zentra /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d cobros.zentra.com.py
```

Cambiá el dominio por el tuyo. Certbot edita sólo ese archivo, pregunta si
redirigir HTTP a HTTPS —sí— y deja la renovación programada. El puerto 80 tiene
que seguir abierto después: es por donde se renueva.

## 11. Decirle a PagoPar a dónde avisar

En el panel, **Integrar con mi sitio web → URL de respuesta**:

```
https://cobros.zentra.com.py/pagopar/webhook
```

## 12. Probar el circuito entero

Un pago de verdad, del monto más chico que tengas. Después, en Supabase:

```sql
select estado, hash_pedido from zentra.cobros order by creado_en desc limit 1;
select * from zentra.pagos order by pagado_en desc limit 1;
select nombre, plan, vence from zentra.empresas where id = 'LA-EMPRESA';
```

Tiene que quedar: el cobro en `pagado`, el pago registrado, y `vence` un mes
más adelante.

---

## Actualizar después

```bash
cd /opt/zentra-app && git pull
cd server && npm install --omit=dev
sudo systemctl restart zentra-cobros
```

El `.env` no se toca: está fuera del repo y `git pull` no lo pisa.

---

## Cuando algo no anda

| Síntoma | Dónde mirar |
|---|---|
| `curl` al dominio no responde | El proxy de adelante (`systemctl status caddy` o `nginx`), DNS, `ufw status` |
| Caddy no levanta | Algo más tiene el 80/443: `sudo ss -lntp`. Con nginx puesto, usá nginx |
| El dominio resuelve a `104.x` o `172.67.x` | Está proxeado en Cloudflare. Ponelo en *DNS only* (nube gris) |
| `node: .env: not found` y el archivo está ahí | Es permiso, no ausencia: corré el comando con `sudo` |
| El servicio arranca y muere enseguida | Permisos del paso 6: `zentra` no puede leer `/opt/zentra-app/server` |
| `health` dice claves `(vacía)` | El `EnvironmentFile` del paso 9, o el `.env` sin permisos |
| `health` dice `FALTA SUPABASE` | `SUPABASE_URL` / `SERVICE_ROLE_KEY` en el `.env` |
| "Token no corresponde" | Paso 8. Clave mal copiada, ambiente cruzado, o comercio sin habilitar |
| El cobro se crea pero queda `pendiente` | El aviso no llega: URL de respuesta (paso 11) y `journalctl` |
| El aviso llega pero no empuja la fecha | ¿Corriste `07_cobros.sql`? `journalctl` dice `desconocido` si el hash no tiene cobro |
| El servicio se reinicia solo | `journalctl -u zentra-cobros -n 100` |

Los logs, siempre:

```bash
journalctl -u zentra-cobros -f
```
