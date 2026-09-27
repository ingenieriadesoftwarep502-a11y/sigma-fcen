# DDD — Diseño Dirigido por el Dominio · SIGMA-FCEN

| Campo | Valor |
|---|---|
| Sistema | SIGMA-FCEN |
| Versión | 1.0 |
| Fecha | 2026-09-24 |
| Estado global | `[PROPUESTA]` — ADR-008 cerrado (2026-09-27); el resto del modelo de dominio no se implementa hasta cerrar ADR-010 |
| Documentos relacionados | [`TRD.md`](TRD.md) · [`SAD.md`](SAD.md) · [`DECISIONES-ABIERTAS.md`](DECISIONES-ABIERTAS.md) |

> **Advertencia crítica:** cambiar `AUTH_USER_MODEL` o el modelo de agregados después de la primera migración es una de las operaciones más caras en Django. ADR-008 quedó cerrado el 2026-09-27: `AUTH_USER_MODEL` va en la **primera** migración de `apps/accounts`. Riesgo R-04 del TRD.

---

## 1. Para qué sirve este documento

Fija el **lenguaje ubicuo**: el vocabulario único que usan la conversación con el cliente, la documentación, el código, las pruebas y la interfaz. Si un término no está aquí, no existe en el código.

También define **dónde vive cada regla de negocio** y **qué no puede ser falso nunca** (invariantes). El SAD dice cómo se estructura el software; este documento dice qué significa el negocio.

---

## 2. Lenguaje ubicuo

Tabla normativa. La columna "Código" es obligatoria: los identificadores en inglés se escriben exactamente así.

| Español (negocio) | Código (inglés) | Definición precisa |
|---|---|---|
| Usuario | `User` | Persona con acceso al sistema, identificada por su correo institucional |
| Rol | `Role` | Conjunto de capacidades: `STUDENT`, `MONITOR`, `TEACHER`, `ADMIN` |
| Asignatura | `Subject` | Materia del plan de estudios (código y nombre), independiente del período |
| Curso | `Course` | Instancia de una asignatura en un período académico, con docente asignado |
| Asignación de monitoría | `MonitorAssignment` | Autorización de un monitor para atender una asignatura |
| Franja de disponibilidad | `AvailabilitySlot` | Bloque de tiempo concreto que un monitor publica como atendible |
| Reserva | `Reservation` | Compromiso de un estudiante sobre una franja específica |
| Sesión de monitoría | `TutoringSession` | Registro de lo ocurrido en una monitoría efectivamente realizada |
| Asistencia | `attendance` | Atributo de la sesión: asistió, no asistió |
| Tema trabajado | `Topic` | Asunto académico abordado durante una sesión |
| Evaluación | `Evaluation` | Calificación y comentario del estudiante sobre una sesión |
| Material académico | `Material` | Recurso de apoyo asociado a una asignatura |
| Período académico | `AcademicTerm` | Semestre o ciclo en el que existen los cursos |

### 2.1 Términos prohibidos

Palabras que generan ambigüedad. No aparecen en código, documentación ni interfaz.

| Prohibido | Por qué | Usar en su lugar |
|---|---|---|
| "Clase" | Se confunde con clase magistral y con clase de programación | `TutoringSession` |
| "Cita" / "Appointment" | No distingue el compromiso del registro posterior | `Reservation` o `TutoringSession` |
| "Profesor" | Ambiguo entre docente titular y monitor | `Teacher` o `Monitor`, según corresponda |
| "Horario" a secas | Confunde la plantilla con la franja concreta | `AvailabilitySlot` |
| "Nota" | Se confunde con calificación académica del estudiante | `Evaluation` (del servicio, no del estudiante) |

### 2.2 La distinción que más errores evita

**Reserva ≠ Sesión.**

- La **reserva** es un compromiso futuro. Puede cancelarse. Vive antes del hecho.
- La **sesión** es el registro de lo que ocurrió. No se cancela: se registra, con asistencia o sin ella.

Una reserva cancelada **nunca** produce una sesión. Una sesión siempre proviene de exactamente una reserva confirmada.

---

## 3. Contextos delimitados

Cinco contextos. Cada uno corresponde a un grupo de apps del backend (SAD §4.2).

```text
┌───────────────────────┐        ┌────────────────────────┐
│   IDENTIDAD Y ACCESO  │        │   CATÁLOGO ACADÉMICO   │
│  User · Role          │───────▶│  Subject · Course      │
│  Autenticación        │        │  MonitorAssignment     │
└───────────┬───────────┘        └───────────┬────────────┘
            │                                │
            ▼                                ▼
┌──────────────────────────────────────────────────────────┐
│                    AGENDAMIENTO (núcleo)                  │
│  AvailabilitySlot · Reservation                           │
│  Reglas de conflicto y cancelación                        │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│                  REGISTRO ACADÉMICO                       │
│  TutoringSession · Topic · Evaluation · Material          │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│              ANÁLISIS (solo lectura)                      │
│  Métricas agregadas. No escribe en otros contextos.       │
└──────────────────────────────────────────────────────────┘
```

| Contexto | Núcleo del negocio | Apps | Fases |
|---|---|---|---|
| Identidad y acceso | Quién es y qué puede hacer | `accounts` | 01 |
| Catálogo académico | Qué se enseña y quién lo atiende | `academics` | 02 |
| **Agendamiento** | **Corazón del sistema** | `availability`, `reservations` | 03, 04 |
| Registro académico | Qué ocurrió y qué valor tuvo | `tutoring_sessions`, `evaluations`, `materials` | 05, 06, 07 |
| Análisis | Qué dicen los datos | `analytics` | 08, 09 |

> **Agendamiento es el subdominio principal.** Ahí se concentra la complejidad real (concurrencia, solapamientos, cancelaciones) y ahí debe ir el mayor esfuerzo de diseño y pruebas. El resto es CRUD con permisos.

---

## 4. Agregados y entidades

Un **agregado** es la frontera de consistencia: todo lo que dentro de él debe ser verdad al mismo tiempo, en la misma transacción.

### 4.1 Agregado `User` · raíz

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | Recomendado sobre entero secuencial: no revela volumen ni permite enumeración |
| `email` | Email único | Identificador de acceso; dominio `@unal.edu.co` — `[CONFIRMADO]` ADR-009 |
| `first_name`, `last_name` | Texto | — |
| ~~`institutional_id`~~ | — | `[OBSOLETO]` — descartado: el correo `@unal.edu.co` es el único identificador (Nicolás García Orozco, 2026-09-27) |
| `is_active` | Booleano | Desactivación lógica; nunca se borra físicamente (RF-025) |
| `date_joined` | Marca de tiempo | UTC |

**Relación con roles:** `[CONFIRMADO]` ADR-008. Un usuario puede tener varios roles simultáneos; se modela con la tabla `UserRole` (N:M entre `User` y `Role`) con restricción única `(user, role)`.

**Invariante:** un usuario inactivo no puede autenticarse ni ser destinatario de reservas nuevas.

---

### 4.2 Agregado `Course` · raíz, con `Subject` y `MonitorAssignment`

| Entidad | Campos clave | Notas |
|---|---|---|
| `Subject` | `code` único, `name`, `credits`, `is_active` | Existe independientemente del período |
| `Course` | `subject`, `term`, `teacher`, `group` | Instancia en un período |
| `MonitorAssignment` | `monitor`, `subject`, `term`, `committed_hours` | Autoriza a un monitor sobre una asignatura |

**Invariantes:**

- Un `Course` pertenece a exactamente un `Subject` y un `AcademicTerm`.
- `MonitorAssignment` es única por `(monitor, subject, term)`.
- `committed_hours` alimenta la métrica de cumplimiento (ADR-013).

---

### 4.3 Agregado `AvailabilitySlot` · raíz

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | — |
| `monitor` | FK a `User` | Debe tener rol `MONITOR` |
| `subject` | FK a `Subject` | Debe existir `MonitorAssignment` vigente |
| `starts_at`, `ends_at` | Marca de tiempo UTC | RNF-DAT-001 |
| `capacity` | Entero | `[PENDIENTE]` ADR-010; por defecto 1 |
| `status` | `AVAILABLE` · `RESERVED` · `CANCELLED` · `EXPIRED` | — |
| `modality` | `IN_PERSON` · `VIRTUAL` | `[PENDIENTE]` |
| `location` | Texto | Aula o enlace |

**Invariantes:**

- `ends_at > starts_at`.
- Dos franjas del mismo monitor no se solapan (RN-003).
- Una franja con reserva confirmada no se elimina (RN-003.4).
- `starts_at` está en el futuro al crearse.

---

### 4.4 Agregado `Reservation` · raíz · **el más crítico**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | — |
| `slot` | FK a `AvailabilitySlot` | — |
| `student` | FK a `User` | Debe tener rol `STUDENT` |
| `status` | `CONFIRMED` · `CANCELLED` · `COMPLETED` · `NO_SHOW` | Máquina de estados §6.2 |
| `created_at` | Marca de tiempo UTC | — |
| `cancelled_at` | Marca de tiempo UTC nulable | — |
| `cancellation_reason` | Texto nulable | Obligatorio si cancela el monitor — ADR-011 |
| `cancelled_by` | FK a `User` nulable | Quién ejecutó la cancelación |

**Invariantes — las más importantes del sistema:**

1. Una franja con capacidad 1 admite **exactamente una** reserva en estado `CONFIRMED`. Garantizada por restricción única en base de datos (SAD §4.4), no por validación en Python.
2. No se crean reservas sobre franjas pasadas.
3. Un estudiante no tiene dos reservas `CONFIRMED` que se solapen en el tiempo.
4. Cancelar libera la franja de forma atómica: ambos cambios ocurren en la misma transacción o ninguno.

---

### 4.5 Agregado `TutoringSession` · raíz, con `Topic`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | — |
| `reservation` | OneToOne a `Reservation` | Una reserva, a lo sumo una sesión |
| `attendance` | `ATTENDED` · `NO_SHOW` | — |
| `topics` | M:N a `Topic` | Alimenta "dificultades frecuentes" (RF-083) |
| `notes` | Texto | Observaciones del monitor |
| `materials` | M:N a `Material` | Material usado en la sesión |
| `recorded_at` | Marca de tiempo UTC | — |
| `duration_minutes` | Entero | Duración real |

**Invariantes:**

- La sesión solo se registra si `reservation.status == CONFIRMED` y `slot.starts_at` ya pasó (RN-006).
- Relación uno a uno estricta con la reserva.
- Una sesión con `NO_SHOW` no admite evaluación (RN-007.3).

> **Decisión de modelado:** los temas son una entidad `Topic`, no texto libre. Con texto libre, la métrica de "dificultades frecuentes" (RF-083, HU-09) sería imposible de calcular sin procesamiento de lenguaje natural. Un catálogo de temas por asignatura, con opción de agregar nuevos, resuelve el problema desde el modelo.

---

### 4.6 Agregado `Evaluation` · raíz

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | — |
| `session` | FK a `TutoringSession` | — |
| `student` | FK a `User` | Autor |
| `rating` | Entero | Escala `[PENDIENTE]` ADR-013; propuesta 1–5 |
| `comment` | Texto | Opcional |
| `created_at` | Marca de tiempo UTC | — |

**Invariantes:**

- Única por `(session, student)` (RF-061).
- `rating` dentro de la escala confirmada.
- Solo evalúa el estudiante que participó en la sesión.
- El monitor no accede a la autoría individual — `[PENDIENTE]` RF-062.

---

### 4.7 Agregado `Material` · raíz

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | — |
| `subject` | FK a `Subject` | — |
| `uploaded_by` | FK a `User` | Monitor o docente |
| `title`, `description` | Texto | — |
| `file` | Archivo | `[PENDIENTE]` ADR-012 |
| `content_type`, `size_bytes` | Texto, entero | Validados al subir |
| `is_active` | Booleano | Borrado lógico |

---

## 5. Reglas de negocio

Catálogo normativo. **Cada regla exige al menos dos pruebas: camino feliz y violación** (RNF-CAL-002).

### RN-001 · Registro e identidad · `[CONFIRMADO]`

| # | Regla | Estado |
|---|---|---|
| 001.1 | El correo es único en todo el sistema | `[CONFIRMADO]` |
| 001.2 | El correo debe pertenecer al dominio `@unal.edu.co` | `[CONFIRMADO]` ADR-009 |
| 001.3 | La contraseña cumple la política mínima de Django | `[CONFIRMADO]` |
| 001.4 | El auto-registro asigna únicamente el rol Estudiante; Monitor, Docente y Administrador los asigna un administrador. La cuenta queda activa sin verificación por correo | `[CONFIRMADO]` ADR-009 |

### RN-002 · Autorización · `[CONFIRMADO]`

| # | Regla | Estado |
|---|---|---|
| 002.1 | Toda operación verifica el rol en el servidor, nunca solo en la interfaz | `[CONFIRMADO]` |
| 002.2 | Un usuario solo accede a sus propios recursos, salvo rol administrativo | `[CONFIRMADO]` |
| 002.3 | Un docente accede únicamente a información de sus cursos | `[CONFIRMADO]` |
| 002.4 | Un usuario inactivo no puede autenticarse | `[CONFIRMADO]` |

### RN-003 · Disponibilidad · `[PENDIENTE]` ADR-010

| # | Regla | Estado |
|---|---|---|
| 003.1 | `ends_at > starts_at` | `[PROPUESTA]` |
| 003.2 | Una franja no se crea en el pasado | `[PROPUESTA]` |
| 003.3 | Dos franjas del mismo monitor no se solapan | `[PROPUESTA]` |
| 003.4 | Una franja con reserva confirmada no se elimina ni se modifica en su horario | `[PROPUESTA]` |
| 003.5 | El monitor solo publica franjas de asignaturas que tiene asignadas | `[PROPUESTA]` (ADR-009 cerrado) |
| 003.6 | Duración estándar de la franja | `[PENDIENTE]` ADR-010 |

### RN-004 · Reserva · `[PENDIENTE]` ADR-010

| # | Regla | Estado |
|---|---|---|
| 004.1 | Solo se reservan franjas en estado `AVAILABLE` | `[PROPUESTA]` |
| 004.2 | Solo se reservan franjas futuras | `[PROPUESTA]` |
| 004.3 | Una franja de capacidad 1 admite una sola reserva `CONFIRMED`, incluso bajo concurrencia | `[PROPUESTA]` |
| 004.4 | Un estudiante no tiene dos reservas `CONFIRMED` solapadas | `[PROPUESTA]` |
| 004.5 | La franja cambia a `RESERVED` en la misma transacción que crea la reserva | `[PROPUESTA]` |
| 004.6 | Anticipación mínima para reservar | `[PENDIENTE]` ADR-010 |
| 004.7 | Límite de reservas activas por estudiante | `[PENDIENTE]` ADR-010 |

### RN-005 · Cancelación · `[PENDIENTE]` ADR-011

| # | Regla | Estado |
|---|---|---|
| 005.1 | El estudiante cancela dentro de la ventana definida | `[PENDIENTE]` |
| 005.2 | Al cancelar, la franja vuelve a `AVAILABLE` de forma atómica | `[PROPUESTA]` |
| 005.3 | Una reserva `CANCELLED` no se cancela de nuevo | `[PROPUESTA]` |
| 005.4 | Solo el estudiante propietario, el monitor o un administrador cancelan | `[PROPUESTA]` |
| 005.5 | La cancelación del monitor exige justificación | `[PENDIENTE]` |
| 005.6 | Consecuencia de cancelar fuera de la ventana | `[PENDIENTE]` |

### RN-006 · Sesiones

| # | Regla | Estado |
|---|---|---|
| 006.1 | Solo se registra sesión sobre reserva `CONFIRMED` | `[PROPUESTA]` |
| 006.2 | Solo se registra sesión después de la hora de inicio de la franja | `[PROPUESTA]` |
| 006.3 | Una reserva admite a lo sumo una sesión | `[PROPUESTA]` |
| 006.4 | Solo el monitor de la franja registra la sesión | `[PROPUESTA]` |
| 006.5 | Registrar una sesión cambia la reserva a `COMPLETED` o `NO_SHOW` | `[PROPUESTA]` |
| 006.6 | Plazo máximo para editar una sesión registrada | `[PENDIENTE]` RF-052 |

### RN-007 · Evaluación · `[PENDIENTE]` ADR-013

| # | Regla | Estado |
|---|---|---|
| 007.1 | Solo se evalúan sesiones `COMPLETED` | `[PROPUESTA]` |
| 007.2 | Una evaluación por sesión y estudiante | `[PROPUESTA]` |
| 007.3 | Una sesión `NO_SHOW` no se evalúa | `[PROPUESTA]` |
| 007.4 | La calificación está dentro de la escala confirmada | `[PENDIENTE]` |
| 007.5 | Mínimo de evaluaciones para publicar el promedio de un monitor | `[PENDIENTE]` |

### RN-008 · Materiales · `[PENDIENTE]` ADR-012

| # | Regla | Estado |
|---|---|---|
| 008.1 | Solo monitores y docentes suben material | `[PENDIENTE]` |
| 008.2 | El formato debe estar en la lista permitida | `[PENDIENTE]` |
| 008.3 | El tamaño no excede el máximo | `[PENDIENTE]` |
| 008.4 | Todo material se asocia a una asignatura existente | `[PROPUESTA]` |
| 008.5 | Solo el autor o un administrador elimina material | `[PROPUESTA]` |

### RN-009 · Seguimiento docente

| # | Regla | Estado |
|---|---|---|
| 009.1 | El docente solo ve información de sus propios cursos | `[PROPUESTA]` |
| 009.2 | Las dificultades frecuentes se calculan agrupando `Topic` por frecuencia | `[PROPUESTA]` |

### RN-010 · Métricas · `[PENDIENTE]` ADR-013

| # | Regla | Estado |
|---|---|---|
| 010.1 | Las métricas solo consideran sesiones `COMPLETED`, salvo indicación contraria | `[PENDIENTE]` |
| 010.2 | Un período sin datos devuelve cero, no error | `[PROPUESTA]` |
| 010.3 | Las métricas son de solo lectura: no modifican datos operativos | `[PROPUESTA]` |
| 010.4 | Fórmulas exactas de las seis métricas | `[PENDIENTE]` |

---

## 6. Máquinas de estado

Los estados no cambian por asignación directa: cambian por transiciones explícitas y validadas.

### 6.1 `AvailabilitySlot`

```text
                 ┌──────────────┐
  crear ────────▶│  AVAILABLE   │◀──────── cancelar reserva
                 └───┬──────┬───┘
      reservar       │      │       el monitor la retira
                     ▼      ▼
              ┌──────────┐  ┌───────────┐
              │ RESERVED │  │ CANCELLED │
              └────┬─────┘  └───────────┘
                   │ pasa la hora sin sesión
                   ▼
              ┌──────────┐
              │ EXPIRED  │
              └──────────┘
```

### 6.2 `Reservation`

```text
                 ┌─────────────┐
  reservar ─────▶│  CONFIRMED  │
                 └──┬───┬───┬──┘
        cancelar    │   │   │   registrar sesión con asistencia
              ┌─────┘   │   └──────────────┐
              ▼         │                  ▼
       ┌───────────┐    │           ┌────────────┐
       │ CANCELLED │    │           │ COMPLETED  │
       └───────────┘    │           └────────────┘
                        │ registrar sesión con inasistencia
                        ▼
                  ┌───────────┐
                  │  NO_SHOW  │
                  └───────────┘
```

**Transiciones prohibidas** (cada una necesita una prueba que confirme el rechazo):

| Desde | Hacia | Por qué |
|---|---|---|
| `CANCELLED` | `CONFIRMED` | Una cancelación es definitiva; se crea una reserva nueva |
| `COMPLETED` | `CANCELLED` | No se cancela lo que ya ocurrió |
| `NO_SHOW` | `COMPLETED` | El registro de la sesión es la fuente de verdad |
| `CONFIRMED` | `COMPLETED` sin sesión | El estado lo produce el registro, nunca una edición directa |

---

## 7. Eventos de dominio · `[PROPUESTA]`

Se documentan ahora porque revelan acoplamientos. **No se implementa un bus de eventos en la versión 1** (contradice D-3, la simplicidad exigida por la capacidad del equipo); son puntos de extensión conocidos.

| Evento | Se dispara cuando | Consumidor futuro |
|---|---|---|
| `ReservationConfirmed` | Se crea una reserva | Notificación al monitor |
| `ReservationCancelled` | Se cancela una reserva | Notificación y liberación de franja |
| `SessionRecorded` | El monitor registra la sesión | Invitación a evaluar, métricas |
| `EvaluationSubmitted` | El estudiante evalúa | Recálculo del promedio del monitor |
| `UserDeactivated` | Se desactiva una cuenta | Revisión de reservas futuras afectadas |

---

## 8. Modelo entidad-relación propuesto · `[PROPUESTA]`

```text
  User ──┬──< UserRole >── Role          (N:M — [CONFIRMADO] ADR-008)
         │
         ├──< MonitorAssignment >── Subject
         │
         ├──< AvailabilitySlot >─────────┐
         │         │                     │
         │         └──< Reservation      │
         │                  │            │
         │                  └──1:1── TutoringSession
         │                                 │  │
         │                                 │  └──< SessionTopic >── Topic
         │                                 │
         ├──< Evaluation >─────────────────┘
         │
         └──< Material >── Subject

  Subject ──< Course >── AcademicTerm
  Course  ── teacher ──> User
```

**Índices necesarios** (rendimiento, RNF-PER-001):

| Tabla | Índice | Motivo |
|---|---|---|
| `AvailabilitySlot` | `(subject, starts_at, status)` | Consulta principal de HU-02 |
| `AvailabilitySlot` | `(monitor, starts_at)` | Detección de solapamientos |
| `Reservation` | `(student, status)` | Historial del estudiante |
| `Reservation` | única parcial sobre `slot` donde `status = CONFIRMED` | **Invariante RN-004.3** |
| `TutoringSession` | `(recorded_at)` | Agregados de métricas |
| `Evaluation` | única sobre `(session, student)` | Invariante RN-007.2 |

---

## 9. Qué queda bloqueado hasta cerrar decisiones

| Elemento del dominio | Bloqueado por | Consecuencia de implementarlo antes |
|---|---|---|
| `User` + `Role` | ADR-008 | Migración de `AUTH_USER_MODEL` prácticamente irreversible |
| `AvailabilitySlot.capacity` y duración | ADR-010 | Modelo de agendamiento equivocado de raíz |
| Ventana de cancelación | ADR-011 | Regla de negocio inventada por el implementador |
| `Evaluation.rating` | ADR-013 | Escala arbitraria que invalida las métricas históricas |
| `Material.file` | ADR-012 | Almacenamiento y validaciones a rehacer |
| Fórmulas de métricas | ADR-013 | Panel con números que nadie puede defender |

> **Resumen:** hoy, ningún agregado de este documento puede convertirse en migración. El trabajo habilitado es documental y de infraestructura (FASE-00).
