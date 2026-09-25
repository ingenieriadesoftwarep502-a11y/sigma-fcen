# FASE-04 · Reservas y cancelación

| Campo | Valor |
|---|---|
| Sprint | 4 (semanas 9–10) |
| Historias | HU-03 Reserva (8 pts) · HU-04 Cancelación (3 pts) |
| Puntos | 11 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-010, ADR-011 |
| Requisitos | RF-040 a RF-046 |

---

## 1. Objetivo

Que un estudiante reserve una franja disponible con garantía de que nadie más puede tomarla, y que pueda cancelarla dentro de la política definida liberando el espacio.

**Resultado observable:** dos estudiantes envían una reserva sobre la misma franja **en el mismo instante**; exactamente uno recibe `201` y el otro `409`. La base de datos nunca contiene dos reservas confirmadas sobre la misma franja.

---

## 2. Por qué esta es la fase más importante

Todo lo demás del sistema es administración de datos con permisos. **Aquí hay concurrencia real, invariantes duras y estado que debe cambiar de forma atómica.** Si esta fase se hace mal, el sistema produce dobles reservas en producción — exactamente el problema que SIGMA-FCEN existe para eliminar (Documentación base §2).

Un `if` en el serializer **no** resuelve esto. Entre la comprobación y la escritura hay una ventana en la que otra petición puede colarse. Este es el problema clásico *check-then-act*.

---

## 3. Gate de entrada

- [ ] FASE-03 cerrada con su DoD completa
- [ ] ADR-010 cerrado — capacidad de la franja, anticipación mínima, límite de reservas activas
- [ ] ADR-011 cerrado — ventana de cancelación, consecuencia de cancelar tarde, cancelación por el monitor

> Sin ADR-011, la pregunta "¿qué significa suficiente anticipación?" queda al criterio del implementador. Eso es inventar una regla de negocio, y está prohibido por el protocolo.

---

## 4. Alcance

### Entra

- Modelo `Reservation` con máquina de estados.
- **Restricción única parcial en base de datos** sobre franja con estado `CONFIRMED`.
- Servicio de reserva transaccional con bloqueo de fila.
- Servicio de cancelación transaccional que libera la franja.
- Validación de solapamiento de reservas del propio estudiante.
- Consulta de reservas propias para estudiante y monitor.
- Traducción de conflictos a `409` con el formato de error del SAD §6.3.
- Pantallas de reserva, listado y cancelación.

### No entra

- Registro de lo ocurrido en la sesión — es FASE-05.
- Notificaciones por correo (se documentan como evento de dominio, no se implementan).
- Lista de espera sobre franjas ocupadas (fuera de alcance de la versión 1).
- Reprogramación: cancelar y volver a reservar es el flujo de la versión 1.

---

## 5. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol | Respuestas |
|---|---|---|---|
| `POST` | `/api/v1/reservations/` | estudiante | `201` · `400` franja pasada · `409` ya reservada · `403` rol incorrecto |
| `GET` | `/api/v1/reservations/mine/` | estudiante o monitor | `200` paginado |
| `GET` | `/api/v1/reservations/{id}/` | participantes | `200` · `403` |
| `POST` | `/api/v1/reservations/{id}/cancel/` | estudiante propietario, monitor o admin | `200` · `403` · `409` ya cancelada · `400` fuera de ventana |

**Cuerpo de la reserva:**

```json
{ "slot_id": "uuid" }
```

El estudiante se toma del usuario autenticado, **nunca del cuerpo de la petición**. Aceptarlo del cliente permitiría reservar a nombre de otro.

---

## 6. Diseño de la invariante crítica

Tres capas de defensa. Las tres son obligatorias; ninguna sustituye a las otras.

| Capa | Mecanismo | Qué garantiza |
|---|---|---|
| Base de datos | `UniqueConstraint(fields=["slot"], condition=Q(status="CONFIRMED"))` | Garantía absoluta, incluso con varios procesos o servidores |
| Servicio | `select_for_update()` dentro de `transaction.atomic()` | Serializa el acceso y produce un error de dominio limpio |
| API | `IntegrityError` → `409 Conflict` | Respuesta comprensible y consistente para el cliente |

```text
POST /reservations/
      │
      ▼
transaction.atomic()
      │
      ├─▶ SELECT ... FOR UPDATE sobre el slot   (bloquea la fila)
      │
      ├─▶ Reglas de dominio: futura, disponible, sin solapamiento propio
      │
      ├─▶ INSERT Reservation (status=CONFIRMED)
      │      └─ la restricción única es la última línea de defensa
      │
      └─▶ UPDATE slot → RESERVED
            (todo junto, o nada)
```

> Si la capacidad de la franja resulta ser mayor que 1 (ADR-010), la restricción única se sustituye por una verificación de conteo **bajo bloqueo**, no por un contador en memoria.

---

## 7. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-04.1 | Reglas puras de reserva | Franja pasada, franja no disponible, solapamiento propio | RN-004.1, 004.2, 004.4 |
| T-04.2 | Modelo `Reservation` y estados | Transiciones prohibidas del DDD §6.2 son rechazadas | DDD §6.2 |
| T-04.3 | **Restricción única en base de datos** | Insertar dos `CONFIRMED` sobre la misma franja lanza `IntegrityError` | RN-004.3 |
| T-04.4 | Servicio de reserva transaccional | Reserva válida crea la reserva y marca la franja | CA-HU03-1, RN-004.5 |
| T-04.5 | Franja ya reservada | `409`, sin segunda reserva | CA-HU03-2 |
| T-04.6 | **Prueba de concurrencia real** | Dos transacciones simultáneas: exactamente una gana | **CA-HU03-3** |
| T-04.7 | Franja pasada | `400` | CA-HU03-4 |
| T-04.8 | Solapamiento propio del estudiante | Reserva en horario ya comprometido es rechazada | CA-HU03-5 |
| T-04.9 | Límite de reservas activas | Según ADR-010 | RN-004.7 |
| T-04.10 | Autorización de rol | Monitor o docente intentando reservar → `403` | CA-HU03-6 |
| T-04.11 | Atomicidad ante fallo | Si el `UPDATE` de la franja falla, la reserva no queda creada | RN-004.5 |
| T-04.12 | Cancelación dentro de ventana | Reserva `CANCELLED`, franja vuelve a `AVAILABLE` | CA-HU04-1, RN-005.2 |
| T-04.13 | Cancelación fuera de ventana | Se aplica la política de ADR-011 | CA-HU04-2 |
| T-04.14 | Cancelación por tercero | `403` | CA-HU04-3, RN-005.4 |
| T-04.15 | Doble cancelación | `409` | CA-HU04-4, RN-005.3 |
| T-04.16 | Cancelación por el monitor | Exige justificación; registra autor | RN-005.5 |
| T-04.17 | Consulta de reservas propias | Estudiante y monitor ven solo las suyas, paginadas | RF-045, RF-046 |
| T-04.18 | Completar T-01.12 | Desactivar usuario con reservas futuras informa el impacto | CA-HU11-3 |
| T-04.19 | Frontend: reservar | Flujo desde la búsqueda, con manejo de `409` |  — |
| T-04.20 | Frontend: mis reservas y cancelar | Listado, confirmación y estado tras cancelar | — |

### Cómo se prueba realmente T-04.6

No basta con dos llamadas seguidas: eso no es concurrencia.

```text
Hilo A                          Hilo B
  │                               │
  ├─ abrir transacción            ├─ abrir transacción
  ├─ SELECT FOR UPDATE slot ──┐   │
  │                           │   ├─ SELECT FOR UPDATE slot  (BLOQUEADO)
  ├─ INSERT reservation       │   │
  ├─ COMMIT ──────────────────┘   │
  │                               ├─ (se desbloquea, ve el estado nuevo)
  │                               ├─ falla: franja ocupada
  ▼                               ▼
 201                             409
```

La prueba debe usar hilos con conexiones independientes y transacciones reales. Con una base de datos en memoria o transacciones compartidas, **la prueba miente**.

---

## 8. Criterios de aceptación cubiertos

CA-HU03-1 a CA-HU03-6 · CA-HU04-1 a CA-HU04-4 · CA-HU11-3 (completado)

---

## 9. Verificación

```bash
<comando de pruebas> tests/ -k "reservation" -v
<comando de pruebas> tests/integration/test_reservation_concurrency.py -v
<comando de pruebas> --cov=apps/reservations --cov-report=term-missing
ruff check . && mypy .
```

**Verificación manual obligatoria:** inspeccionar la restricción única en PostgreSQL.

```sql
\d+ reservations_reservation
-- debe aparecer el índice único parcial sobre slot con status = 'CONFIRMED'
```

---

## 10. Definition of Done

- [ ] ADR-010 y ADR-011 cerrados y reflejados en la documentación.
- [ ] Restricción única parcial existente en base de datos y **verificada en PostgreSQL**, no solo en el código del modelo.
- [ ] **CA-HU03-3 probado con concurrencia real**, con conexiones y transacciones independientes.
- [ ] Los 10 criterios de aceptación con prueba automatizada.
- [ ] Reserva y cancelación son atómicas; probado el fallo intermedio.
- [ ] Todos los conflictos devuelven `409` con el formato de error del SAD §6.3.
- [ ] El estudiante nunca se toma del cuerpo de la petición.
- [ ] Cobertura de `apps/reservations` por encima del umbral.
- [ ] Eventos de dominio documentados (no implementados).
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Validación solo en el serializer | **Doble reserva en producción** | Restricción en base de datos obligatoria en el DoD |
| Prueba de concurrencia falsa (secuencial) | Falsa sensación de seguridad | Revisión específica en el PR: debe haber hilos y transacciones reales |
| Cancelación no atómica | Franja bloqueada sin reserva | `transaction.atomic()` + prueba de fallo intermedio |
| Ventana de cancelación inventada | Regla arbitraria en producción | Gate de entrada: ADR-011 cerrado |
| Bloqueos prolongados bajo carga | Degradación del servicio | Mantener la transacción mínima; sin llamadas externas dentro |

---

## 12. Siguiente fase

[FASE-05 · Sesiones e historial](FASE-05-sesiones.md)
