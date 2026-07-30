# Búsqueda, filtros y reportes — auditoría enterprise

## Alcance

Se revisaron Spotlight, directorio de candidatos, listado de jobs, pipeline,
dashboard principal, Reports, reportes programados, CSV y las consultas de
PostgreSQL que alimentan estas superficies.

## Hallazgos y estado

| Área | Estado | Evidencia / decisión |
| --- | --- | --- |
| Aislamiento por workspace | Corregido y verificado | Las consultas revisadas reciben el workspace autenticado y filtran entidades eliminadas. |
| Definición de hire | Corregido | Reports y reportes programados usan la primera transición a una etapa cuyo nombre normalizado es `Hired`; ya no dependen de `applications.status` para esa métrica. |
| Historial materializado en Reports | Mejorado | La vista solo materializa el rango necesario para comparaciones; el total histórico usa `count(distinct application)`. |
| Ventanas inválidas | Corregido | Solo se aceptan 30, 90 y 365 días; cualquier otro valor vuelve a 30. |
| Spotlight | Mejorado | Input normalizado, comodines de ILIKE escapados y orden determinista con `id` como desempate. |
| CSV | Corregido | El export de candidatos y reports neutraliza valores que Excel/Sheets podría interpretar como fórmulas. |
| Índices de lectura | Mejorado | Se añadieron índices compuestos para workspace/deleted/fecha, aplicaciones por job/fecha, historial por workspace/fecha y tags por workspace/label/candidate. La migración fue generada por Drizzle. |
| Paginación del directorio de candidatos | Mejorado, pendiente cursor | El directorio ahora filtra y cuenta en PostgreSQL y devuelve páginas acotadas de 50 (máximo 100). Para navegación profunda queda migrar de `OFFSET` a cursor estable. |
| Export completo con filtros | Mejorado, pendiente async | El export normal ahora ejecuta filtros server-side, audita la operación y limita a 10.000 filas; para volúmenes mayores falta convertirlo en job asíncrono descargable. |
| Filtros persistentes del directorio | Corregido | Búsqueda, filtros y orden se serializan en URL; las opciones se calculan desde todo el workspace, no solo desde la página visible. |

## Criterios de aceptación restantes

Antes de declarar esta sección lista para producción deben completarse estos
flujos sobre datos grandes:

1. Cursor pagination estable (`sort key + id`), sin `OFFSET` profundo.
2. Búsqueda y filtros ejecutados en PostgreSQL, no sobre una colección parcial
   del navegador.
3. `total`, `hasNextPage` y resultados calculados con el mismo predicado.
4. Exportaciones asíncronas server-side, con autorización al crear y descargar,
   límite de filas, expiración, auditoría y CSV formula-safe. Actualmente el
   camino síncrono está limitado a 10.000 filas.
5. Pruebas de aislamiento entre workspaces, orden estable bajo inserciones y
   carga con al menos 100k candidatos / 1M aplicaciones.
6. `EXPLAIN (ANALYZE, BUFFERS)` documentado para las consultas principales y
   límites de p95 definidos para búsqueda, listados y reportes.

## Verificación ejecutada

- `pnpm db:migrate`
- segundo `pnpm db:generate`: sin cambios pendientes
- `drizzle-kit check`: correcto
- `pnpm typecheck`: correcto
- `pnpm lint`: correcto
- `pnpm test`: 701 tests pasados; 22 omitidos por requerir fixtures/integraciones
- pruebas focalizadas de métricas, búsqueda y CSV: 19 tests pasados
- fixture local de 1.000 candidatos / 1.000 aplicaciones: filtros, total,
  paginación y aislamiento verificados en 511 ms

El estado “Pendiente” es intencional: evita declarar enterprise una experiencia
que todavía puede cargar demasiados datos en el navegador.
