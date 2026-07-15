# Runbook — Validación de instalación limpia en VPS (SELFHOST-RC-01)

_Objetivo:_ probar que Harly se instala de cero en una VPS limpia, sirve HTTPS,
sobrevive un reinicio, y que backup/restore/upgrade funcionan de verdad. Al
terminar sin fallos, este item deja de bloquear el RC.

Configuración asumida (verificada en el repo): **proxy Caddy** (TLS automático,
profile `proxy`) y **storage S3/R2** (`packages/storage/src/adapters/s3.ts`).

## Prerrequisitos

- VPS limpia (Debian/Ubuntu), 2 vCPU / 4 GB / 20 GB+ recomendado.
- Docker + Docker Compose v2 instalados.
- Un dominio con un registro **A** apuntando a la IP de la VPS
  (Caddy saca Let's Encrypt solo; sin DNS correcto no hay certificado).
- Puertos **80** y **443** abiertos en el firewall.
- Credenciales del bucket S3/R2: bucket, access key, secret, endpoint (R2/MinIO).
- Una clave `age` para cifrar backups:
  ```bash
  age-keygen -o /secure/harly-backup.key   # imprime la recipient age1...
  ```

> ⚠️ **Backups con S3:** el backup del CLI incluye base de datos + `.env` +
> `harly.config.json` + uploads **locales**. Con `STORAGE_PROVIDER=s3` los
> adjuntos viven en el bucket, **no** en el archivo de backup. La durabilidad de
> esos objetos la das con **versionado del bucket**, no con `harly backup`.
> Actívalo en R2/S3 antes de producción.

## Paso 1 — Preflight en la VPS

```bash
npx @harly/create doctor . || true   # aún no hay instalación; valida binario
docker --version && docker compose version
```

## Paso 2 — Instalar (init no interactivo)

Desde el directorio de instalación en la VPS:

```bash
export HARLY_PROXY_MODE=caddy
export HARLY_URL=https://harly.TUDOMINIO.com
export HARLY_DOMAIN=harly.TUDOMINIO.com
export HARLY_INITIAL_ADMIN_EMAIL=owner@TUDOMINIO.com
export HARLY_ORGANIZATION="Tu organización"
export STORAGE_PROVIDER=s3
export S3_BUCKET=harly-prod
export S3_REGION=auto
export S3_ACCESS_KEY_ID=...
export S3_SECRET_ACCESS_KEY=...
export S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # R2/MinIO
export HARLY_IMAGE_REF=ghcr.io/vytral/harly:0.1.0-beta.1

npx @harly/create init .
```

**Verificar:**
- [ ] `.env` existe con permisos `0600` (`stat -c '%a' .env` → `600`).
- [ ] Secretos generados distintos entre sí (`BETTER_AUTH_SECRET`, `AI_ENCRYPTION_KEY`, `STORAGE_UPLOAD_SECRET`, `CRON_SECRET`, `HARLY_SETUP_SECRET`).
- [ ] `harly.config.json` refleja `proxyMode: caddy` y `storage: s3`.
- [ ] `Caddyfile` y `compose.yaml` presentes.

## Paso 3 — Levantar

```bash
COMPOSE_PROFILES=proxy npx @harly/create launch . --yes
```

**Verificar:**
- [ ] `docker compose ps` muestra `postgres`, `app`, `scheduler`, `caddy` como healthy.
- [ ] `curl -fsS https://harly.TUDOMINIO.com/api/health/ready` → `200` (readiness).
- [ ] `curl -fsS https://harly.TUDOMINIO.com/api/health/live` → `200` (liveness).
- [ ] El certificado TLS es válido (no self-signed): `curl -vI https://harly.TUDOMINIO.com 2>&1 | grep -i 'issuer\|SSL'`.
- [ ] `npx @harly/create doctor . --json` → `"ok": true`.

## Paso 4 — Primer owner + flujo mínimo

- [ ] Abrir `https://harly.TUDOMINIO.com/setup`, completar el owner con `HARLY_SETUP_SECRET` del `.env`.
- [ ] Login como owner → dashboard carga.
- [ ] Crear un job → publicarlo → abrir la career page pública.
- [ ] Aplicar como candidato **subiendo un CV** (prueba el path S3).
- [ ] Verificar que el CV se ve desde la ficha del candidato (descarga desde S3 OK).
- [ ] Mover al candidato de etapa en el pipeline.

## Paso 5 — Sobrevivir un reinicio

```bash
docker compose down && COMPOSE_PROFILES=proxy docker compose up -d --wait
```

**Verificar:**
- [ ] Readiness vuelve a `200` sin intervención.
- [ ] El job publicado, el candidato y el CV siguen ahí.

## Paso 6 — Backup / restore / upgrade

Prueba destructiva end-to-end (harness dedicado, **instalación de prueba**):

```bash
HARLY_DESTRUCTIVE_OK=1 \
  tooling/create-harly/test/backup-restore.destructive.sh .
```

- [ ] Termina en `PASS: backup → destroy → restore recovered all data`.

Upgrade N-1 → actual (cuando exista una versión posterior publicada):

```bash
AGE_RECIPIENT=age1... npx @harly/create upgrade . --to <next-version> --yes
```

- [ ] `upgrade` toma backup, corre el migrator, y `doctor` termina `ok:true`.

## Criterio de salida

Todas las casillas marcadas → **SELFHOST-RC-01 desbloqueado**. Anota el digest
exacto de la imagen probada; solo ese digest se promueve a `latest`.
