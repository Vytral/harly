# Release 0.2.3 — Demo sandbox y selector de estilos

**Estado:** implementado en `claude/charming-hawking-36mon5`; pendiente de revisión.
**Ámbito:** demo público (`DEMO_MODE=true`). Ningún cambio de comportamiento en instalaciones normales.

## 1. Qué estaba roto

El demo anterior era **una sola cuenta compartida y un solo workspace** que se reseteaba cada ~2 horas.
De ahí salían los problemas de permisos y acceso:

| Síntoma | Causa |
| --- | --- |
| Guardar la career page devolvía "disabled in the demo" | `saveCareerPageConfigAction` bloqueaba toda escritura en demo para que nadie publicara contenido arbitrario en el dominio público compartido. |
| Roles, accesos de miembros y branding del board eran de solo lectura | Se bloqueaban con `assertNotDemo()` porque el estado compartido persistiría entre visitantes hasta el reset. |
| Un visitante veía (y pisaba) los cambios de otro | Todos operaban sobre el mismo workspace. |
| No se podía "ver reflejado" un cambio de la career page | El board público (`/`) era el del workspace compartido y el builder no podía publicar. |
| La landing mostraba un único estilo (Playful) | El board en `/` renderizaba la config guardada, sin elección previa. |
| El panel de `/enter` prometía "construir automatizaciones" | Contradecía el contrato del demo de 0.2.0 (simulaciones curadas, sin ejecución). |

La causa común: **sin aislamiento por visitante, cualquier permiso abierto era un riesgo**, así que se cerraron casi todos.

## 2. Decisión: sandbox por visitante

Cada visitante recibe, al entrar, **su propia cuenta y su propia copia del workspace Syntrix**:

```
/            → workspace "plantilla" (canónico, solo lectura, reseteado por cron)
                con selector de estilo (4 templates reales de career page)
/enter       → Turnstile → createDemoSandbox({ style })
                  user sandbox-<id>@sandbox.harly.dev
                  organization slug sbx-<id>  (metadata.harlyDemoSandbox = { expiresAt, style })
                  seedDemoWorkspace({ sandbox: true })   ← mismo seed que la plantilla
                  career page = estilo elegido, seo.indexable = false
                  sesión firmada, cookie con vida ≤ TTL del sandbox
/dashboard   → workspace del visitante
/board/sbx-… → su career page pública, con cinta "Harly demo sandbox preview"
```

* **Aislamiento real.** Nada de lo que haga un visitante llega a otro ni a la plantilla.
* **Un solo mecanismo de limpieza.** Los sandboxes caducan (`DEMO_SANDBOX_TTL_MINUTES`, 4 h por defecto) y se
  borran (`deleteDemoSandbox`: tablas con `workspace_id`, filas por `organization_id`, org, usuario y blobs) de
  forma oportunista en cada entrada y en el cron `demo-reset`.
* **Tope de capacidad** (`DEMO_SANDBOX_MAX_ACTIVE`, 40) y rate limit más estricto en `/api/demo/enter`
  (3/min y 12/h por IP), porque cada entrada siembra un workspace completo (~0,3 s medidos en local).

### Matriz de permisos en demo

La regla: *si solo afecta al workspace del visitante y no genera salida externa ni toca identidad, se permite
en un sandbox vivo*. El servidor decide (`organization.metadata`), nunca el navegador.

| Capacidad | Plantilla | Sandbox vivo |
| --- | --- | --- |
| Editar y publicar career page | ✗ | ✓ (siempre `noindex`) |
| Branding del board (textos, colores, hero URL) | ✗ | ✓ |
| Roles personalizados; roles/acceso de miembros sembrados | ✗ | ✓ |
| Jobs, pipeline, candidatos, entrevistas, notas | — | ✓ (ya permitido) |
| Nombre/logo del workspace (fetch de URL en servidor) | ✗ | ✗ |
| Invitar/crear miembros, contraseñas, SSO/SCIM, passkeys, API keys, sesiones | ✗ | ✗ |
| Integraciones, OAuth, email/webhooks salientes | ✗ | ✗ |
| Automations | simulación curada | simulación curada |

Defensa en profundidad: el layout del dashboard redirige a `/enter` si la sesión apunta a un workspace que no
sea un sandbox vivo (cookies viejas de la cuenta compartida, sandboxes caducados), y las server actions
fallan cerradas (`assertNotDemoOutsideSandbox`).

### Selector de estilos

La home pública del demo es el board real de la plantilla con una barra superior para alternar entre los cuatro
templates (Playful, Minimal, Editorial/Ashby, Profile/Join) sin recargar. El estilo elegido viaja a
`/enter?style=…` y se aplica a la career page del sandbox, así que lo previsualizado es exactamente lo que se
recibe. Los looks son los templates reales (`applyDemoStyle`), no maquetas.

## 3. Verificado

* Postgres 16 local + migraciones: dos sandboxes concurrentes se crean, quedan aislados (20 candidatos, 6
  miembros cada uno), y la purga elimina org, usuario y datos de uno sin tocar el otro.
* App en modo demo contra esa base: landing con los 4 estilos (desktop y móvil), `/enter` con estilo,
  dashboard del sandbox, guardar la career page en el builder y verla en `/board/sbx-…` con `noindex`.
* Pruebas unitarias nuevas: metadata/expiración, estilos, acceso por sandbox, la acción de career page en
  demo (plantilla denegada / sandbox permitido y `noindex` / instalación normal intacta), landing en modo demo
  y límites de configuración.
* **No verificado:** el POST completo a `/api/demo/enter` (Turnstile no es alcanzable desde el entorno de
  desarrollo); se ejercitó la misma ruta de código (crear sandbox + sesión firmada) por separado.

## 4. Notas de despliegue

* Sin migración de base de datos.
* Variables nuevas, opcionales: `DEMO_SANDBOX_TTL_MINUTES`, `DEMO_SANDBOX_MAX_ACTIVE`.
* `DEMO_WORKSPACE_ID` es ahora la forma recomendada de fijar la plantilla: con él, `/` ya no depende de que la
  plantilla sea la organización más antigua.
* `DEMO_LOGIN_EMAIL` sigue siendo la cuenta dueña de la plantilla (la usa el reset). Ya no se inicia sesión con
  ella; las cookies antiguas se redirigen a `/enter`.
* El cron `demo-reset` debe seguir activo: además de resembrar la plantilla, purga sandboxes caducados.

## 5. Investigación: qué pulir y qué construir

### 5.1 Demo (siguiente iteración, 0.2.4)

1. **Checklist de primera visita** dentro del sandbox (mover un candidato → restyle de la career page → postular
   desde tu board → crear un job → recorrer una simulación de automations). Es la forma más barata de convertir
   "poder experimentar" en "saber qué probar".
2. **Cuenta atrás y "Reiniciar mi sandbox"** en la barra superior (hoy el aviso es de una sola vez). Reiniciar =
   re-sembrar su propio workspace; ampliar tiempo = mover `expiresAt`.
3. **Cuotas por sandbox** (jobs, candidatos, aplicaciones desde el board público). Hoy un visitante podría
   inflar su workspace; el TTL y el tope global lo acotan, pero una cuota por tabla es más sana.
4. **Telemetría del embudo del demo**: entradas, estilo elegido, acciones clave y expiraciones, para saber qué
   convence. Contadores en `cron_runs` / logs estructurados bastan para empezar.
5. **Más estilos y colores**: modo oscuro y selector de color de marca en el propio selector previo a entrar.
6. **Alertas operativas**: sandboxes activos vs. tope, fallos de purga y tiempo de siembra.
7. **Endurecer el contenido público**: hoy el board de un sandbox es `noindex`, con cinta y URL no adivinable;
   si se abre a más tráfico, añadir lista de dominios para imágenes remotas y límite de longitud de textos.

### 5.2 Producto (alineado con `ROADMAP.md`)

* **NEXT-2 — Career pages**: borrador/vista previa antes de publicar, galería de templates con presets de marca,
  `JobPosting` JSON-LD y métricas de conversión. El selector de estilos del demo ya es la mitad de una galería.
* **NEXT-3 — Búsqueda global (`Cmd/Ctrl + K`)**: es la mejora de uso diario más visible que falta.
* **NEXT-1 — Pipelines por job**: requisito para reclutadores con procesos distintos por área.
* **NEXT-4 — Importación con vista previa y reintentos**, para que probar Harly con datos propios no dé miedo.
* **NEXT-5 — Plantillas reutilizables** (job, email, kit de entrevista, scorecard).
* **Pulido concreto detectado al revisar el código:**
  * `DemoLockedNotice` y varios textos de la UI de seguridad/integraciones hablan de "shared account"; unificar
    el lenguaje ahora que hay sandbox.
  * `getPublicWorkspaceSlug()` asume "la organización más antigua"; fuera del demo conviene un ajuste explícito de
    workspace público (ya endurecido para demo con `DEMO_WORKSPACE_ID`).
  * Un `loadDemoSandbox`/`resetSandbox` reutilizable permitiría también un "workspace de evaluación" desechable
    en instalaciones reales (cubre el punto de NOW-5: datos demo que se cargan y se quitan sin riesgo).
