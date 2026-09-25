# FASE-09 · Métricas administrativas

| Campo | Valor |
|---|---|
| Sprints | 7 y 8 (semanas 15–18) |
| Historias | HU-10 Panel de métricas administrativas (13 pts) |
| Puntos | 13 — **la historia más grande del backlog** |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-013 |
| Requisitos | RF-090 a RF-092 |

---

## 1. Objetivo

Que el administrador disponga de indicadores confiables para optimizar la distribución de recursos de monitoría.

**Resultado observable:** el administrador filtra por período y asignatura y obtiene las seis métricas confirmadas, con cifras que cualquiera puede recalcular a mano y verificar.

---

## 2. Gate de entrada

- [ ] FASE-04, FASE-05 y FASE-06 cerradas — sin datos reales no hay métricas
- [ ] **ADR-013 cerrado con las seis fórmulas explícitas y las dudas de la columna derecha resueltas**

> Un número en un panel administrativo que nadie puede defender es peor que no tener panel. Si "monitorías realizadas" incluye o no las inasistencias cambia el resultado y las decisiones de asignación de recursos. Por eso ADR-013 bloquea de forma absoluta.

---

## 3. La historia debe partirse

13 puntos con una velocidad estimada de 10 por sprint no caben en un sprint. Se entrega en **tres incrementos verticales**, cada uno funcionando de extremo a extremo.

| Incremento | Contenido | Puntos | Sprint |
|---|---|---:|---|
| **9.A** | Infraestructura de consultas + métricas de volumen: monitorías realizadas, estudiantes atendidos | 5 | 7 |
| **9.B** | Métricas de demanda: demanda por asignatura, horarios de mayor demanda | 5 | 8 |
| **9.C** | Métricas de calidad: valoración de monitores, cumplimiento del programa | 3 | 8 |

Cada incremento se entrega funcionando en el panel. Nada de "tres sprints construyendo y mostrando al final".

---

## 4. Alcance

### Entra

- Servicio de consultas agregadas en `apps/analytics`, de solo lectura.
- Las seis métricas confirmadas en ADR-013.
- Filtros por rango de fechas y por asignatura.
- Panel administrativo con visualizaciones.
- Manejo explícito de períodos sin datos.

### No entra

- Exportación (RF-092, prioridad baja) salvo que sobre capacidad.
- Análisis predictivo o recomendaciones automáticas (fuera de alcance de la versión 1).
- Tablas materializadas o caché: se introducen solo si una medición demuestra que hacen falta.
- Métricas en tiempo real: la consulta bajo demanda es suficiente para este volumen.

---

## 5. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol | Incremento |
|---|---|---|---|
| `GET` | `/api/v1/analytics/dashboard/?date_from=&date_to=&subject=` | admin | 9.A |
| `GET` | `/api/v1/analytics/sessions-count/` | admin | 9.A |
| `GET` | `/api/v1/analytics/demand-by-subject/` | admin | 9.B |
| `GET` | `/api/v1/analytics/peak-hours/` | admin | 9.B |
| `GET` | `/api/v1/analytics/monitor-ratings/` | admin | 9.C |
| `GET` | `/api/v1/analytics/program-compliance/` | admin | 9.C |

---

## 6. Plan de trabajo TDD

**Cada métrica se prueba con un escenario de datos conocido y un resultado calculado a mano.** Si la prueba se limita a comprobar que el endpoint responde `200`, no prueba nada.

### Incremento 9.A

| # | Tarea | Prueba primero (G2) | Criterio |
|---|---|---|---|
| T-09.1 | Base del servicio de analítica | Filtro por rango de fechas aplicado correctamente | CA-HU10-1 |
| T-09.2 | Autorización de administrador | Rol no administrador → `403` | CA-HU10-4 |
| T-09.3 | Monitorías realizadas | 10 sesiones, 3 con inasistencia → resultado según ADR-013 | CA-HU10-1 |
| T-09.4 | Estudiantes atendidos | 5 sesiones de 3 estudiantes → resultado 3, no 5 | CA-HU10-1 |
| T-09.5 | Período sin datos | Ceros explícitos, nunca error ni nulos | CA-HU10-3 |
| T-09.6 | Frontend: panel base | Selector de rango y dos indicadores | — |

### Incremento 9.B

| # | Tarea | Prueba primero (G2) | Criterio |
|---|---|---|---|
| T-09.7 | Demanda por asignatura | Escenario con 3 asignaturas y conteos conocidos | CA-HU10-1 |
| T-09.8 | Horarios de mayor demanda | Agrupación por día y hora, con datos conocidos | CA-HU10-1 |
| T-09.9 | Filtro por asignatura | Todas las métricas se recalculan sobre el subconjunto | CA-HU10-2 |
| T-09.10 | Frontend: gráficas de demanda | Visualización con estado vacío manejado | — |

### Incremento 9.C

| # | Tarea | Prueba primero (G2) | Criterio |
|---|---|---|---|
| T-09.11 | Valoración de monitores | Promedio correcto respetando el umbral mínimo | CA-HU10-5 |
| T-09.12 | Monitor con pocas evaluaciones | Devuelve "sin datos suficientes" | CA-HU10-5 |
| T-09.13 | Cumplimiento del programa | Horas atendidas sobre horas comprometidas | CA-HU10-1 |
| T-09.14 | Rendimiento del panel completo | Número de consultas acotado; sin N+1 | RNF-PER-002 |
| T-09.15 | Frontend: panel completo | Las seis métricas integradas | — |

---

## 7. Criterios de aceptación cubiertos

CA-HU10-1 a CA-HU10-5

---

## 8. Verificación

```bash
<comando de pruebas> tests/ -k "analytics or metric or dashboard" -v
<comando de pruebas> --cov=apps/analytics --cov-report=term-missing
ruff check . && mypy .
```

**Verificación manual obligatoria:** tomar un período con datos, calcular una métrica a mano con consultas SQL directas y comparar con lo que muestra el panel. Si no coinciden, el panel está mal.

---

## 9. Definition of Done

- [ ] ADR-013 cerrado con las seis fórmulas y sus dudas resueltas.
- [ ] Cada métrica tiene una prueba con datos conocidos y resultado calculado a mano.
- [ ] Los 5 criterios de aceptación con prueba automatizada.
- [ ] Un período vacío devuelve ceros, nunca error ni nulos.
- [ ] Endpoints de solo lectura y restringidos a administrador, con prueba de `403`.
- [ ] Agregaciones en base de datos; número de consultas del panel medido y acotado.
- [ ] Las fórmulas implementadas están documentadas en el propio panel o en el TRD, de modo que cualquiera pueda auditarlas.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 10. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fórmulas interpretadas por el implementador | **Alto — decisiones administrativas sobre datos falsos** | Gate de entrada: ADR-013 cerrado con fórmulas explícitas |
| Historia de 13 puntos en un solo sprint | Alto | Partición obligatoria en tres incrementos verticales |
| Pruebas que solo verifican `200` | Alto | El DoD exige datos conocidos y resultado calculado a mano |
| Panel lento por consultas mal construidas | Medio | Agregación en SQL; medición del número de consultas |
| Optimización prematura con caché | Medio | Prohibido sin una medición que la justifique |

---

## 11. Siguiente fase

[FASE-10 · Endurecimiento y despliegue](FASE-10-hardening-despliegue.md)
