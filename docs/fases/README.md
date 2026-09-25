# Plan de fases · SIGMA-FCEN

**Qué es esto:** el orden exacto en que se construye el sistema, con qué se entrega cada fase y qué debe estar confirmado antes de empezarla.

**Regla de oro:** una fase no inicia hasta que la anterior cerró su Definition of Done y todos sus ADR están `[CONFIRMADO]`. Ver [`../PROTOCOLO-AGENTES.md`](../PROTOCOLO-AGENTES.md).

---

## 1. Estado de arranque

| Indicador | Valor |
|---|---|
| Fases definidas | 11 (FASE-00 a FASE-10) |
| Historias de usuario | 12 · 79 puntos |
| Decisiones abiertas | **15** |
| Fases habilitadas para implementar hoy | **0** |

> **Nada puede implementarse todavía.** El primer trabajo real del equipo es una sesión de confirmación de la tanda 1 de [`../DECISIONES-ABIERTAS.md`](../DECISIONES-ABIERTAS.md).

---

## 2. Mapa de fases

| Fase | Nombre | Historias | Puntos | ADR bloqueantes | Estado |
|---|---|---|---:|---|---|
| [00](FASE-00-fundaciones.md) | Fundaciones técnicas | — | 0 | 001, 002, 003, 004, 005, 006 | Bloqueada |
| [01](FASE-01-identidad-acceso.md) | Identidad y acceso | HU-01, HU-11 | 13 | 007, 008, 009 | Bloqueada |
| [02](FASE-02-catalogo-academico.md) | Catálogo académico | HU-11 (parcial) | 5 | 008 | Bloqueada |
| [03](FASE-03-disponibilidad.md) | Disponibilidad y búsqueda | HU-05, HU-02 | 10 | 010 | Bloqueada |
| [04](FASE-04-reservas.md) | Reservas y cancelación | HU-03, HU-04 | 11 | 010, 011 | Bloqueada |
| [05](FASE-05-sesiones.md) | Sesiones e historial | HU-06, HU-12 | 11 | 010 | Bloqueada |
| [06](FASE-06-evaluaciones.md) | Evaluación del servicio | HU-07 | 5 | 013 | Bloqueada |
| [07](FASE-07-materiales.md) | Repositorio académico | HU-08 | 8 | 012 | Bloqueada |
| [08](FASE-08-seguimiento-docente.md) | Seguimiento docente | HU-09 | 8 | 008 | Bloqueada |
| [09](FASE-09-metricas.md) | Métricas administrativas | HU-10 | 13 | 013 | Bloqueada |
| [10](FASE-10-hardening-despliegue.md) | Endurecimiento y despliegue | — | 0 | 014, 015 | Bloqueada |

---

## 3. Grafo de dependencias

```text
FASE-00  Fundaciones
   │  (sin esto, nada compila ni se prueba)
   ▼
FASE-01  Identidad y acceso
   │  (sin usuarios ni roles, no hay a quién autorizar)
   ▼
FASE-02  Catálogo académico
   │  (sin asignaturas, no hay de qué publicar disponibilidad)
   ▼
FASE-03  Disponibilidad y búsqueda
   │  (sin franjas, no hay qué reservar)
   ▼
FASE-04  Reservas y cancelación   ◀── NÚCLEO DEL SISTEMA
   │  (sin reservas, no hay sesiones que registrar)
   ▼
FASE-05  Sesiones e historial
   │
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
FASE-06        FASE-08        FASE-07
Evaluación     Seguimiento    Materiales
   │           docente        (independiente desde FASE-02)
   │              │
   └──────┬───────┘
          ▼
      FASE-09  Métricas
          │  (necesita datos reales de 04, 05, 06)
          ▼
      FASE-10  Endurecimiento y despliegue
```

**Únicas fases paralelizables:** FASE-07 (materiales) puede adelantarse en cualquier momento después de FASE-02, porque solo depende de asignaturas. Todo lo demás es estrictamente secuencial.

---

## 4. Planificación Scrum

### 4.1 Supuesto de capacidad

| Parámetro | Valor | Nota |
|---|---|---|
| Integrantes | 3 | Documentación base §18 |
| Dedicación individual | 5 h/semana | — |
| Capacidad semanal del equipo | 15 h | — |
| Duración del sprint | 2 semanas | `[PROPUESTA]` |
| Capacidad por sprint | 30 h | — |
| Velocidad estimada inicial | **10 puntos/sprint** | Hipótesis, no dato |

> **Esta velocidad es una hipótesis y debe recalibrarse al cerrar el Sprint 1.** Con TDD estricto, los primeros sprints suelen rendir por debajo de lo estimado. Planificar sobre un número no verificado es exactamente el error que este documento intenta evitar.

### 4.2 Distribución por sprints

| Sprint | Semanas | Fase | Contenido | Puntos |
|---|---|---|---|---:|
| 0 | 1–2 | FASE-00 | Infraestructura, CI, pruebas, configuración | 0 |
| 1 | 3–4 | FASE-01 | HU-01 Registro · inicio de HU-11 | 10 |
| 2 | 5–6 | FASE-01 / 02 | Cierre de HU-11 · catálogo académico | 8 |
| 3 | 7–8 | FASE-03 | HU-05 Disponibilidad · HU-02 Búsqueda | 10 |
| 4 | 9–10 | FASE-04 | HU-03 Reserva · HU-04 Cancelación | 11 |
| 5 | 11–12 | FASE-05 | HU-06 Sesiones · HU-12 Historial | 11 |
| 6 | 13–14 | FASE-06 / 08 | HU-07 Evaluación · inicio de HU-09 | 10 |
| 7 | 15–16 | FASE-08 / 09 | Cierre de HU-09 · métricas incremento 1 | 10 |
| 8 | 17–18 | FASE-09 / 07 | Métricas incrementos 2–3 · HU-08 Materiales | 9 |
| 9 | 19–20 | FASE-10 | Endurecimiento, despliegue, documentación final | 0 |

**Horizonte estimado: 20 semanas (~5 meses).**

### 4.3 Riesgo de capacidad, dicho sin adornos

79 puntos con 15 horas semanales de equipo es un plan ajustado. Si la velocidad real del Sprint 1 cae por debajo de 8 puntos, hay que recortar alcance, **no** recortar pruebas. Candidatas a salir de la versión 1, en este orden:

1. HU-08 Repositorio de materiales (8 pts, prioridad 3).
2. HU-10 Panel de métricas reducido a tres métricas en vez de seis (ahorra ~6 pts).
3. HU-12 Historial del estudiante (3 pts, prioridad 3).

Eso libera hasta 17 puntos sin tocar el núcleo del producto.

### 4.4 Ceremonias

| Ceremonia | Cuándo | Duración | Resultado |
|---|---|---|---|
| Sprint Planning | Lunes de inicio de sprint | 60 min | Sprint Backlog en Jira, con DoR verificada |
| Seguimiento semanal | Miércoles | 45 min (máximo) | Avance, impedimentos, reajuste |
| Sprint Review | Viernes de cierre | 45 min | Incremento funcionando y demostrado |
| Retrospectiva | Viernes de cierre | 45 min | Acciones de mejora con responsable |
| **Sesión de confirmación de ADR** | Al inicio de cada fase | 30 min | ADR movidos a `[CONFIRMADO]` |

> La sesión de confirmación de ADR es la ceremonia que hace funcionar todo este sistema. Sin ella, los agentes quedan bloqueados y el sprint se detiene.

---

## 5. Estructura de una ficha de fase

Todas las fichas siguen el mismo esquema, para que un agente sepa siempre dónde mirar:

| Sección | Contenido |
|---|---|
| 1. Objetivo | Resultado observable al terminar |
| 2. Gate de entrada | Qué debe estar confirmado antes de empezar (bloqueante) |
| 3. Alcance | Qué entra y, explícitamente, qué no |
| 4. Contratos propuestos | Endpoints y modelos, con su estado |
| 5. Plan de trabajo TDD | Tareas en orden, cada una con su prueba primero |
| 6. Criterios de aceptación | IDs `CA-HUxx-n` cubiertos |
| 7. Verificación | Comandos exactos con los que se comprueba |
| 8. Definition of Done | Checklist de cierre |
| 9. Riesgos | Lo que puede salir mal en esta fase concreta |

---

## 6. Cómo trabaja un agente en una fase

```text
1. Leer ../PROTOCOLO-AGENTES.md y ../DECISIONES-ABIERTAS.md
2. Abrir la ficha de la fase
3. Verificar el gate de entrada
   └─ ¿Algún ADR sin cerrar? → escribir pregunta bloqueante y DETENERSE
4. Tomar la primera tarea pendiente del plan TDD
5. G2: escribir la prueba. Ejecutarla. Confirmar que falla
6. G3: implementación mínima
7. G4: suite completa + linter + tipos, con evidencia
8. Marcar la tarea y abrir PR hacia develop
9. Repetir hasta cerrar el DoD de la fase
```

---

## 7. Tablero de progreso

Se actualiza al cerrar cada fase.

| Fase | Gate de entrada | Implementación | DoD | Fecha de cierre |
|---|---|---|---|---|
| FASE-00 | Bloqueado | No iniciada | — | — |
| FASE-01 | Bloqueado | No iniciada | — | — |
| FASE-02 | Bloqueado | No iniciada | — | — |
| FASE-03 | Bloqueado | No iniciada | — | — |
| FASE-04 | Bloqueado | No iniciada | — | — |
| FASE-05 | Bloqueado | No iniciada | — | — |
| FASE-06 | Bloqueado | No iniciada | — | — |
| FASE-07 | Bloqueado | No iniciada | — | — |
| FASE-08 | Bloqueado | No iniciada | — | — |
| FASE-09 | Bloqueado | No iniciada | — | — |
| FASE-10 | Bloqueado | No iniciada | — | — |
