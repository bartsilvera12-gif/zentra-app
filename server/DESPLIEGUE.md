# Desplegar el server de cobros en una VPS nueva

Paso a paso, en orden. Cada bloque se copia y se pega.

Supone Ubuntu o Debian recién instalado. Con otra distribución cambian los
comandos de paquetes y nada más.

---

## Antes de empezar: tres decisiones

No son técnicas pero frenan todo si faltan:

1. **El dominio del server.** Algo como `cobros.zentra.com.py`. Tiene que
   existir y apuntar a la IP de la VPS **antes** del paso 7, porque el
   certificado se emite verificando ese dominio.
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

El repo es privado, así que `git clone` a secas va a pedir credenciales. La
forma limpia es una **deploy key**: una llave que sólo sirve para leer este
repositorio.

```bash
sudo -u zentra ssh-keygen -t ed25519 -N "" -f /opt/zentra-cobros/.ssh/id_ed25519
cat /opt/zentra-cobros/.ssh/id_ed25519.pub
```

Esa clave pública se pega en GitHub → el repo `zentra-app` → **Settings → Deploy
keys → Add deploy key**, con permiso de sólo lectura. Después:

```bash
cd /opt
sudo -u zentra git clone git@github.com:bartsilvera12-gif/zentra-app.git zentra-app
ln -sfn /opt/zentra-app/server /opt/zentra-cobros/app
cd /opt/zentra-cobros/app && sudo -u zentra npm install --omit=dev
```

## 6. El `.env`

```bash
cd /opt/zentra-cobros/app
sudo -u zentra cp .env.example .env
sudo -u zentra nano .env
chmod 600 .env
```

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
cd /opt/zentra-cobros/app
sudo -u zentra node --env-file=.env src/prueba.js
```

Crea un pedido de prueba de mil guaraníes que caduca en una hora. **No pagues
nada.**

Si dice *"Las claves andan"*, seguí. Si dice *"Token no corresponde"*, el
problema está en el paso 6 o en la habilitación del comercio — y el propio
mensaje te dice cuál de las tres causas mirar. **No sigas hasta que esto pase**,
porque después el mismo error aparece enterrado en los logs del servicio y
cuesta diez veces más encontrarlo.

## 9. Que el servicio se levante solo

```bash
cat > /etc/systemd/system/zentra-cobros.service <<'EOF'
[Unit]
Description=Zentra — cobros con PagoPar
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/zentra-cobros/app
EnvironmentFile=/opt/zentra-cobros/app/.env
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

systemctl daemon-reload
systemctl enable --now zentra-cobros
systemctl status zentra-cobros --no-pager
```

Tiene que decir `active (running)`. Si no:

```bash
journalctl -u zentra-cobros -n 50 --no-pager
```

Y desde la propia VPS, que el proceso contesta:

```bash
curl -s localhost:8790/pagopar/health
```

## 10. HTTPS por delante

PagoPar tiene que llegar al webhook desde internet y por HTTPS. Caddy saca el
certificado solo:

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
cd /opt/zentra-app && sudo -u zentra git pull
cd server && sudo -u zentra npm install --omit=dev
systemctl restart zentra-cobros
```

El `.env` no se toca: está fuera del repo y `git pull` no lo pisa.

---

## Cuando algo no anda

| Síntoma | Dónde mirar |
|---|---|
| `curl` al dominio no responde | Caddy: `systemctl status caddy`, DNS, `ufw status` |
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
