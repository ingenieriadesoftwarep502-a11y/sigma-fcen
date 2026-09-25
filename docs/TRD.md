# TRD — Technical Requirements Document · SIGMA-FCEN

| Campo | Valor |
|---|---|
| Sistema | Sistema Integral de Gestión de Monitorías Académicas — FCEN |
| Versión | 1.0 |
| Fecha | 2026-09-24 |
| Fuente primaria | `SIGMA-FCEN_DOCUMENTACION_BASE.md` (Definición de Proyecto – Ingeniería de Software 2026) |
| Estado global | Requisitos funcionales derivados del documento base; criterios de aceptación en `[PROPUESTA]` hasta confirmación |

> **Lectura obligatoria previa:** [`PROTOCOLO-AGENTES.md`](PROTOCOLO-AGENTES.md). Ningún `RF` con dependencias en `[PENDIENTE]` habilita implementación.

---

## 1. Propósito y alcance

### 1.1 Qué construye este sistema

Una plataforma web institucional que centraliza la gestión de monitorías académicas de la FCEN: publicación de disponibilidad, reserva de sesiones, registro de lo trabajado, evaluación del servicio, repositorio de material y métricas para la toma de decisiones.

### 1.2 Qué problema elimina

| Problema actual | Consecuencia | Requisito que lo ataca |
|---|---|---|
| Coordinación por correo y mensajería | Reservas duplicadas | RF-040, RF-042 |
| Disponibilidad no visible | Estudiantes sin saber a quién acudir | RF-030, RF-031 |
| Sin registro sistemático de sesiones | Imposible auditar o acreditar el programa | RF-050 |
| Sin retroalimentación | La calidad del servicio no se mide | RF-060 |
| Información fragmentada | Decisiones administrativas sin datos | RF-090 |

### 1.3 Fuera de alcance de la versión 1

Declarado explícitamente para que ningún agente lo implemente por iniciativa propia:

- Aplicación móvil nativa.
- Videollamada integrada para monitorías virtuales.
- Pagos o remuneración de monitores.
- Sincronización con calendarios externos (Google Calendar, Outlook).
- Chat en tiempo real entre estudiante y monitor.
- Inicio de sesión único institucional (SSO) — ver `ADR-015`.
- Análisis predictivo o recomendaciones automáticas de monitores.

---

## 2. Actores del sistema

| Actor | Descripción | Acceso |
|---|---|---|
| Estudiante | Consume monitorías | Consultar, reservar, cancelar, evaluar, ver historial y material |
| Monitor | Presta el servicio | Gestionar disponibilidad, atender reservas, registrar sesiones, subir material |
| Docente | Supervisa académicamente | Consultar monitores, sesiones y dificultades de sus cursos; subir material |
| Administrador | Opera el programa | Gestionar usuarios, roles, asignaturas y consultar métricas |
| Decanatura / Dirección Académica | Consume información agregada | Lectura de reportes consolidados |
| Dirección de Tecnología | Integra infraestructura | Fuera del producto; interlocutor de `ADR-015` |

> **Dependencia crítica:** la pregunta "¿un usuario puede tener varios roles simultáneos?" está abierta en `ADR-008` y condiciona el modelo entero.

---

## 3. Glosario operativo

Mismo vocabulario en documentos, código, pruebas e interfaz. El detalle semántico vive en [`DDD.md`](DDD.md).

| Término | Definición | Identificador en código |
|---|---|---|
| Monitoría | Servicio de acompañamiento académico entre pares | `tutoring` |
| Franja de disponibilidad | Bloque de tiempo que un monitor publica como atendible | `AvailabilitySlot` |
| Reserva | Compromiso de un estudiante sobre una franja | `Reservation` |
| Sesión | Registro de lo ocurrido en una monitoría efectivamente realizada | `TutoringSession` |
| Evaluación | Calificación y comentario del estudiante sobre una sesión | `Evaluation` |
| Material | Recurso académico asociado a una asignatura | `Material` |
| Asignatura | Materia del plan de estudios | `Subject` |
| Curso | Instancia de una asignatura en un período, con docente asignado | `Course` |

---

## 4. Requisitos funcionales

**Convención de estado:** `[CONFIRMADO]` habilita implementación. `[PROPUESTA]` y `[PENDIENTE]` la bloquean.

### 4.1 Identidad y acceso (RF-01x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-010 | El sistema debe permitir el registro de usuarios con datos institucionales | Alta | `[PROPUESTA]` | ADR-009 |
| RF-011 | El sistema debe permitir iniciar y cerrar sesión de forma segura | Alta | `[PROPUESTA]` | ADR-007 |
| RF-012 | El sistema debe restringir cada funcionalidad según el rol del usuario | Alta | `[PROPUESTA]` | ADR-008 |
| RF-013 | El sistema debe permitir recuperar la contraseña | Media | `[PENDIENTE]` | ADR-009 (SMTP) |
| RF-014 | El sistema debe invalidar el acceso de las cuentas desactivadas | Alta | `[PROPUESTA]` | ADR-007 |

### 4.2 Usuarios y asignaturas (RF-02x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-020 | El administrador debe poder crear, editar, activar y desactivar usuarios | Alta | `[PROPUESTA]` | ADR-008 |
| RF-021 | El administrador debe poder asignar y retirar roles | Alta | `[PROPUESTA]` | ADR-008 |
| RF-022 | El administrador debe poder administrar el catálogo de asignaturas | Alta | `[PROPUESTA]` | — |
| RF-023 | El administrador debe poder asociar monitores a asignaturas | Alta | `[PROPUESTA]` | ADR-009 |
| RF-024 | El administrador debe poder asociar docentes a cursos | Media | `[PROPUESTA]` | — |
| RF-025 | Las cuentas nunca se eliminan físicamente; solo se desactivan | Alta | `[PROPUESTA]` | — |

### 4.3 Disponibilidad (RF-03x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-030 | El monitor debe poder registrar sus franjas de disponibilidad | Alta | `[PROPUESTA]` | ADR-010 |
| RF-031 | El monitor debe poder editar o eliminar franjas sin reservas activas | Alta | `[PROPUESTA]` | ADR-010 |
| RF-032 | El sistema debe impedir franjas solapadas del mismo monitor | Alta | `[PROPUESTA]` | ADR-010 |
| RF-033 | El sistema debe soportar franjas recurrentes semanales | Media | `[PENDIENTE]` | ADR-010 |
| RF-034 | El estudiante debe poder consultar franjas disponibles filtrando por asignatura, horario y monitor | Alta | `[PROPUESTA]` | ADR-010 |

### 4.4 Reservas (RF-04x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-040 | El estudiante debe poder reservar una franja disponible | Alta | `[PROPUESTA]` | ADR-010 |
| RF-041 | El sistema debe marcar la franja como no disponible al confirmarse la reserva | Alta | `[PROPUESTA]` | ADR-010 |
| RF-042 | El sistema debe impedir reservas sobre franjas ya ocupadas, incluso ante peticiones concurrentes | Alta | `[PROPUESTA]` | ADR-010 |
| RF-043 | El estudiante debe poder cancelar dentro de la ventana permitida | Alta | `[PENDIENTE]` | ADR-011 |
| RF-044 | El sistema debe liberar la franja al cancelarse una reserva | Alta | `[PENDIENTE]` | ADR-011 |
| RF-045 | El monitor debe poder consultar sus reservas confirmadas | Alta | `[PROPUESTA]` | — |
| RF-046 | El estudiante debe poder consultar el historial completo de sus monitorías | Media | `[PROPUESTA]` | — |

### 4.5 Sesiones (RF-05x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-050 | El monitor debe poder registrar asistencia, temas, observaciones y material de una sesión | Alta | `[PROPUESTA]` | ADR-010 |
| RF-051 | Solo se pueden registrar sesiones sobre reservas confirmadas y ya iniciadas | Alta | `[PROPUESTA]` | — |
| RF-052 | Una sesión registrada no debe poder editarse pasado un plazo definido | Media | `[PENDIENTE]` | pendiente de definir el plazo |
| RF-053 | El sistema debe conservar el historial completo de sesiones por estudiante, monitor y asignatura | Alta | `[PROPUESTA]` | — |

### 4.6 Evaluaciones (RF-06x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-060 | El estudiante debe poder calificar y comentar una sesión finalizada | Alta | `[PENDIENTE]` | ADR-013 (escala) |
| RF-061 | Una sesión admite una única evaluación por estudiante | Alta | `[PROPUESTA]` | — |
| RF-062 | El monitor no debe poder ver la identidad del autor de cada evaluación individual | Media | `[PENDIENTE]` | decisión de privacidad abierta |
| RF-063 | El sistema debe calcular la valoración promedio de cada monitor | Media | `[PENDIENTE]` | ADR-013 |

### 4.7 Materiales (RF-07x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-070 | Monitores y docentes deben poder cargar material asociado a una asignatura | Media | `[PENDIENTE]` | ADR-012 |
| RF-071 | El sistema debe validar formato y tamaño de los archivos | Alta | `[PENDIENTE]` | ADR-012 |
| RF-072 | Los usuarios autenticados deben poder consultar y descargar material | Media | `[PENDIENTE]` | ADR-012 |
| RF-073 | El autor debe poder eliminar el material que subió | Baja | `[PENDIENTE]` | ADR-012 |

### 4.8 Seguimiento docente (RF-08x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-080 | El docente debe poder consultar los monitores asignados a sus cursos | Media | `[PROPUESTA]` | ADR-008 |
| RF-081 | El docente debe poder consultar las sesiones realizadas en sus cursos | Media | `[PROPUESTA]` | — |
| RF-082 | El docente debe poder consultar los estudiantes atendidos | Media | `[PROPUESTA]` | — |
| RF-083 | El docente debe poder consultar las dificultades frecuentes reportadas | Media | `[PENDIENTE]` | falta definir cómo se clasifica una "dificultad" |

### 4.9 Métricas (RF-09x)

| ID | Requisito | Prioridad | Estado | Bloqueado por |
|---|---|---|---|---|
| RF-090 | El administrador debe disponer de un panel con las métricas clave del programa | Media | `[PENDIENTE]` | ADR-013 |
| RF-091 | Las métricas deben poder filtrarse por período y por asignatura | Media | `[PENDIENTE]` | ADR-013 |
| RF-092 | El panel debe poder exportarse | Baja | `[PENDIENTE]` | falta definir el formato |

---

## 5. Requisitos no funcionales

| ID | Categoría | Requisito | Criterio verificable | Estado |
|---|---|---|---|---|
| RNF-SEC-001 | Seguridad | Ningún secreto en el repositorio; toda configuración sensible por variables de entorno | `git grep` sin coincidencias de secretos; `SECRET_KEY` leída del entorno | `[PENDIENTE]` ADR-002 |
| RNF-SEC-002 | Seguridad | Contraseñas almacenadas con el hasher por defecto de Django (PBKDF2) | Revisión de `PASSWORD_HASHERS` | `[PROPUESTA]` |
| RNF-SEC-003 | Seguridad | Todo endpoint distinto de autenticación exige usuario autenticado | Prueba automatizada: cada endpoint responde 401 sin credenciales | `[PROPUESTA]` |
| RNF-SEC-004 | Seguridad | Autorización verificada por rol en cada endpoint, no solo en la interfaz | Prueba por rol y endpoint que confirma 403 | `[PENDIENTE]` ADR-008 |
| RNF-SEC-005 | Seguridad | CORS restringido a los orígenes de `CORS_ALLOWED_ORIGINS` | Revisión de configuración + prueba | `[PENDIENTE]` ADR-002 |
| RNF-CAL-001 | Calidad | Cobertura mínima del 80 % en la capa de dominio y servicios | Reporte de `pytest-cov` en CI | `[PENDIENTE]` ADR-004 |
| RNF-CAL-002 | Calidad | Toda regla de negocio `RN-xxx` con prueba de camino feliz y de violación | Matriz de trazabilidad §8 completa | `[PROPUESTA]` |
| RNF-CAL-003 | Calidad | Linter y verificación de tipos sin errores en cada PR | CI en verde | `[PENDIENTE]` ADR-006 |
| RNF-PER-001 | Rendimiento | Consulta de disponibilidad responde en menos de 500 ms con 1 000 franjas | Prueba de carga básica | `[PROPUESTA]` |
| RNF-PER-002 | Rendimiento | Sin consultas N+1 en los listados principales | Revisión con `django-debug-toolbar` o assert de número de queries | `[PROPUESTA]` |
| RNF-USA-001 | Usabilidad | Interfaz responsiva desde 360 px de ancho | Verificación manual documentada | `[PROPUESTA]` |
| RNF-USA-002 | Usabilidad | Mensajes de error comprensibles, en español, sin trazas técnicas | Revisión en PR | `[PROPUESTA]` |
| RNF-ACC-001 | Accesibilidad | Navegación por teclado y contraste AA en flujos críticos | Auditoría con Lighthouse | `[PROPUESTA]` |
| RNF-MAN-001 | Mantenibilidad | Lógica de negocio fuera de vistas y serializers | Revisión arquitectónica en PR | `[PROPUESTA]` |
| RNF-MAN-002 | Mantenibilidad | API versionada bajo el prefijo `/api/v1/` | Revisión de rutas | `[PROPUESTA]` |
| RNF-OBS-001 | Observabilidad | Registro estructurado de errores con identificador de correlación | Revisión de configuración de logging | `[PROPUESTA]` |
| RNF-OPS-001 | Operación | Entorno reproducible con un solo comando documentado | Un integrante ajeno levanta el proyecto siguiendo el README | `[PENDIENTE]` ADR-005 |
| RNF-INT-001 | Integración | Compatibilidad futura con autenticación institucional | Diseño de capa de autenticación desacoplada | `[PENDIENTE]` ADR-015 |
| RNF-DAT-001 | Datos | Todas las marcas de tiempo en UTC; presentación en `America/Bogota` | Prueba de conversión de zona horaria | `[PROPUESTA]` |
| RNF-DAT-002 | Datos | Borrado lógico en usuarios, sesiones y evaluaciones | Revisión de modelos | `[PROPUESTA]` |

---

## 6. Historias de usuario y criterios de aceptación

Redacción de las historias conservada del documento base. Los criterios de aceptación son **propuestos** y requieren confirmación antes de habilitar código.

### HU-01 · Registro de usuario · 5 pts · Prioridad 1

> Como nuevo usuario (estudiante, monitor, docente o administrador), quiero registrarme en el sistema con mis datos institucionales, de tal manera que pueda acceder a las funcionalidades correspondientes a mi rol sin necesidad de procesos manuales.

**Requisitos:** RF-010, RF-011 · **Fase:** FASE-01 · **Bloqueado por:** ADR-007, ADR-008, ADR-009

| ID | Criterio (Gherkin) | Estado |
|---|---|---|
| CA-HU01-1 | **Dado** un correo institucional válido y no registrado, **cuando** envío el formulario completo, **entonces** se crea la cuenta y recibo respuesta `201` | `[PROPUESTA]` |
| CA-HU01-2 | **Dado** un correo ya registrado, **cuando** intento registrarme, **entonces** recibo `400` con un mensaje claro y no se crea una segunda cuenta | `[PROPUESTA]` |
| CA-HU01-3 | **Dado** un correo de dominio no institucional, **cuando** intento registrarme, **entonces** el sistema lo rechaza | `[PENDIENTE]` ADR-009 |
| CA-HU01-4 | **Dado** una contraseña que no cumple la política mínima, **cuando** intento registrarme, **entonces** recibo el detalle de la regla incumplida | `[PROPUESTA]` |
| CA-HU01-5 | **Dado** un registro exitoso, **cuando** consulto mi perfil, **entonces** veo el rol que me corresponde | `[PENDIENTE]` ADR-009 |

---

### HU-02 · Consulta de monitorías disponibles · 5 pts · Prioridad 1

> Como estudiante, quiero consultar las monitorías disponibles filtrando por asignatura, horario y monitor, de tal manera que pueda identificar fácilmente las sesiones que se ajusten a mis necesidades académicas.

**Requisitos:** RF-034 · **Fase:** FASE-03 · **Bloqueado por:** ADR-010

| ID | Criterio | Estado |
|---|---|---|
| CA-HU02-1 | **Dado** que existen franjas libres futuras, **cuando** consulto la lista, **entonces** veo únicamente franjas disponibles y posteriores al momento actual | `[PROPUESTA]` |
| CA-HU02-2 | **Dado** un filtro por asignatura, **cuando** lo aplico, **entonces** solo obtengo franjas de esa asignatura | `[PROPUESTA]` |
| CA-HU02-3 | **Dado** un filtro por rango horario, **cuando** lo aplico, **entonces** solo obtengo franjas dentro del rango | `[PROPUESTA]` |
| CA-HU02-4 | **Dado** un filtro por monitor, **cuando** lo aplico, **entonces** solo obtengo franjas de ese monitor | `[PROPUESTA]` |
| CA-HU02-5 | **Dado** que no hay resultados, **cuando** consulto, **entonces** recibo una lista vacía con `200`, nunca un error | `[PROPUESTA]` |
| CA-HU02-6 | **Dado** un usuario no autenticado, **cuando** consulta, **entonces** recibe `401` | `[PROPUESTA]` |

---

### HU-03 · Reserva de monitoría · 8 pts · Prioridad 1

> Como estudiante, quiero reservar un espacio de monitoría disponible, de tal manera que tenga una cita confirmada con el monitor y el sistema actualice automáticamente la disponibilidad para evitar conflictos de horario.

**Requisitos:** RF-040, RF-041, RF-042 · **Fase:** FASE-04 · **Bloqueado por:** ADR-010

| ID | Criterio | Estado |
|---|---|---|
| CA-HU03-1 | **Dado** una franja libre y futura, **cuando** reservo, **entonces** la reserva queda `CONFIRMED` y la franja deja de aparecer como disponible | `[PROPUESTA]` |
| CA-HU03-2 | **Dado** una franja ya reservada, **cuando** intento reservarla, **entonces** recibo `409` y no se crea una segunda reserva | `[PROPUESTA]` |
| CA-HU03-3 | **Dado** dos estudiantes reservando la misma franja de forma simultánea, **cuando** ambos envían la petición, **entonces** exactamente uno obtiene `201` y el otro `409` | `[PROPUESTA]` |
| CA-HU03-4 | **Dado** una franja pasada, **cuando** intento reservar, **entonces** recibo `400` | `[PROPUESTA]` |
| CA-HU03-5 | **Dado** una reserva activa mía en el mismo horario, **cuando** intento reservar otra, **entonces** el sistema lo impide | `[PENDIENTE]` ADR-010 |
| CA-HU03-6 | **Dado** un usuario con rol distinto de estudiante, **cuando** intenta reservar, **entonces** recibe `403` | `[PENDIENTE]` ADR-008 |

> **CA-HU03-3 es el criterio técnicamente más exigente del proyecto.** Exige bloqueo a nivel de base de datos o restricción de unicidad; no se resuelve con una validación en el serializer.

---

### HU-04 · Cancelación de reserva · 3 pts · Prioridad 2

> Como estudiante, quiero cancelar una reserva de monitoría con suficiente anticipación, de tal manera que el espacio quede disponible para otros estudiantes y mi historial se actualice correctamente.

**Requisitos:** RF-043, RF-044 · **Fase:** FASE-04 · **Bloqueado por:** ADR-011

| ID | Criterio | Estado |
|---|---|---|
| CA-HU04-1 | **Dado** una reserva dentro de la ventana permitida, **cuando** cancelo, **entonces** queda `CANCELLED` y la franja vuelve a estar disponible | `[PENDIENTE]` ADR-011 |
| CA-HU04-2 | **Dado** una reserva fuera de la ventana, **cuando** intento cancelar, **entonces** el sistema aplica la política definida | `[PENDIENTE]` ADR-011 |
| CA-HU04-3 | **Dado** una reserva de otro estudiante, **cuando** intento cancelarla, **entonces** recibo `403` | `[PROPUESTA]` |
| CA-HU04-4 | **Dado** una reserva ya cancelada, **cuando** intento cancelarla de nuevo, **entonces** recibo `409` | `[PROPUESTA]` |

---

### HU-05 · Registro de disponibilidad · 5 pts · Prioridad 1

> Como monitor, quiero registrar y actualizar mis franjas horarias disponibles para atender monitorías, de tal manera que los estudiantes solo puedan reservar espacios en los que realmente puedo asistir.

**Requisitos:** RF-030, RF-031, RF-032 · **Fase:** FASE-03 · **Bloqueado por:** ADR-010

| ID | Criterio | Estado |
|---|---|---|
| CA-HU05-1 | **Dado** un rango horario futuro y válido, **cuando** lo registro, **entonces** la franja queda disponible | `[PROPUESTA]` |
| CA-HU05-2 | **Dado** una franja que se solapa con otra mía, **cuando** la registro, **entonces** recibo `400` y no se crea | `[PROPUESTA]` |
| CA-HU05-3 | **Dado** una franja sin reservas, **cuando** la elimino, **entonces** desaparece de la disponibilidad | `[PROPUESTA]` |
| CA-HU05-4 | **Dado** una franja con reserva confirmada, **cuando** intento eliminarla, **entonces** el sistema lo impide | `[PROPUESTA]` |
| CA-HU05-5 | **Dado** una asignatura que no tengo asignada, **cuando** intento publicar disponibilidad para ella, **entonces** recibo `403` | `[PENDIENTE]` ADR-009 |

---

### HU-06 · Registro de sesión de monitoría · 8 pts · Prioridad 2

> Como monitor, quiero registrar los detalles de cada sesión realizada (asistencia, temas trabajados, observaciones y material de apoyo), de tal manera que exista un historial verificable del trabajo realizado.

**Requisitos:** RF-050, RF-051, RF-053 · **Fase:** FASE-05

| ID | Criterio | Estado |
|---|---|---|
| CA-HU06-1 | **Dado** una reserva confirmada cuya hora de inicio ya pasó, **cuando** registro la sesión, **entonces** queda asociada a esa reserva | `[PROPUESTA]` |
| CA-HU06-2 | **Dado** una reserva futura, **cuando** intento registrar la sesión, **entonces** recibo `400` | `[PROPUESTA]` |
| CA-HU06-3 | **Dado** una sesión ya registrada para esa reserva, **cuando** intento registrar otra, **entonces** recibo `409` | `[PROPUESTA]` |
| CA-HU06-4 | **Dado** que marco inasistencia del estudiante, **cuando** guardo, **entonces** la sesión queda como `NO_SHOW` y no admite evaluación | `[PROPUESTA]` |
| CA-HU06-5 | **Dado** una reserva de otro monitor, **cuando** intento registrar su sesión, **entonces** recibo `403` | `[PROPUESTA]` |

---

### HU-07 · Evaluación de monitoría · 5 pts · Prioridad 2

> Como estudiante, quiero evaluar la calidad de la monitoría recibida una vez finalizada la sesión, de tal manera que el sistema disponga de retroalimentación que permita mejorar la calidad del servicio.

**Requisitos:** RF-060, RF-061 · **Fase:** FASE-06 · **Bloqueado por:** ADR-013

| ID | Criterio | Estado |
|---|---|---|
| CA-HU07-1 | **Dado** una sesión `COMPLETED` a la que asistí, **cuando** la evalúo, **entonces** la evaluación queda registrada | `[PENDIENTE]` ADR-013 |
| CA-HU07-2 | **Dado** una sesión ya evaluada por mí, **cuando** intento evaluarla otra vez, **entonces** recibo `409` | `[PROPUESTA]` |
| CA-HU07-3 | **Dado** una sesión de otro estudiante, **cuando** intento evaluarla, **entonces** recibo `403` | `[PROPUESTA]` |
| CA-HU07-4 | **Dado** una calificación fuera de la escala permitida, **cuando** la envío, **entonces** recibo `400` | `[PENDIENTE]` ADR-013 |
| CA-HU07-5 | **Dado** una sesión `NO_SHOW`, **cuando** intento evaluarla, **entonces** el sistema lo impide | `[PROPUESTA]` |

---

### HU-08 · Repositorio de material académico · 8 pts · Prioridad 3

> Como monitor o docente, quiero cargar y organizar material de apoyo asociado a una asignatura, de tal manera que los estudiantes puedan consultarlo desde el sistema sin depender de medios externos.

**Requisitos:** RF-070 a RF-073 · **Fase:** FASE-07 · **Bloqueado por:** ADR-012

| ID | Criterio | Estado |
|---|---|---|
| CA-HU08-1 | **Dado** un archivo de formato y tamaño permitidos, **cuando** lo subo asociado a una asignatura, **entonces** queda disponible en el repositorio | `[PENDIENTE]` ADR-012 |
| CA-HU08-2 | **Dado** un formato no permitido, **cuando** lo subo, **entonces** recibo `400` | `[PENDIENTE]` ADR-012 |
| CA-HU08-3 | **Dado** un archivo que excede el tamaño máximo, **cuando** lo subo, **entonces** recibo `413` | `[PENDIENTE]` ADR-012 |
| CA-HU08-4 | **Dado** un estudiante autenticado, **cuando** consulta el material de una asignatura, **entonces** puede listarlo y descargarlo | `[PENDIENTE]` ADR-012 |
| CA-HU08-5 | **Dado** un material que no subí yo, **cuando** intento eliminarlo, **entonces** recibo `403` | `[PENDIENTE]` ADR-012 |

---

### HU-09 · Seguimiento docente · 8 pts · Prioridad 2

> Como docente, quiero consultar los monitores asignados a mis cursos y hacer seguimiento a las sesiones realizadas, estudiantes atendidos y dificultades frecuentes, de tal manera que pueda tomar decisiones pedagógicas informadas.

**Requisitos:** RF-080 a RF-083 · **Fase:** FASE-08

| ID | Criterio | Estado |
|---|---|---|
| CA-HU09-1 | **Dado** un docente con cursos asignados, **cuando** consulta sus monitores, **entonces** obtiene solo los de sus cursos | `[PROPUESTA]` |
| CA-HU09-2 | **Dado** un curso propio, **cuando** consulto las sesiones, **entonces** veo fecha, monitor, estudiante y temas | `[PROPUESTA]` |
| CA-HU09-3 | **Dado** un curso ajeno, **cuando** intento consultarlo, **entonces** recibo `403` | `[PROPUESTA]` |
| CA-HU09-4 | **Dado** sesiones con temas registrados, **cuando** consulto dificultades frecuentes, **entonces** obtengo los temas agrupados y ordenados por frecuencia | `[PENDIENTE]` RF-083 |

---

### HU-10 · Panel de métricas administrativas · 13 pts · Prioridad 2

> Como administrador de la Facultad, quiero acceder a un panel con métricas clave (número de monitorías realizadas, demanda por asignatura, horarios de mayor demanda, valoración de monitores y estudiantes atendidos), de tal manera que pueda optimizar la distribución de recursos de monitoría.

**Requisitos:** RF-090 a RF-092 · **Fase:** FASE-09 · **Bloqueado por:** ADR-013

| ID | Criterio | Estado |
|---|---|---|
| CA-HU10-1 | **Dado** un rango de fechas, **cuando** consulto el panel, **entonces** obtengo las seis métricas definidas en ADR-013 | `[PENDIENTE]` ADR-013 |
| CA-HU10-2 | **Dado** un filtro por asignatura, **cuando** lo aplico, **entonces** todas las métricas se recalculan sobre ese subconjunto | `[PENDIENTE]` ADR-013 |
| CA-HU10-3 | **Dado** un período sin datos, **cuando** consulto, **entonces** obtengo ceros explícitos, no errores | `[PROPUESTA]` |
| CA-HU10-4 | **Dado** un usuario no administrador, **cuando** intenta acceder, **entonces** recibe `403` | `[PROPUESTA]` |
| CA-HU10-5 | **Dado** un monitor con menos evaluaciones que el mínimo, **cuando** se calcula su valoración, **entonces** se muestra "sin datos suficientes" | `[PENDIENTE]` ADR-013 |

> **Advertencia de planificación:** 13 puntos con una velocidad estimada de 10–12 por sprint significa que esta historia ocupa un sprint completo. Debe partirse en tres incrementos verticales, descritos en `fases/FASE-09-metricas.md`.

---

### HU-11 · Gestión de usuarios y roles · 8 pts · Prioridad 1

> Como administrador, quiero crear, editar, activar y desactivar cuentas de usuarios y asignarles roles, de tal manera que el acceso al sistema esté controlado y corresponda siempre a la situación real de cada persona en la Facultad.

**Requisitos:** RF-020, RF-021, RF-025 · **Fase:** FASE-01 · **Bloqueado por:** ADR-008

| ID | Criterio | Estado |
|---|---|---|
| CA-HU11-1 | **Dado** un administrador, **cuando** crea un usuario con rol, **entonces** la cuenta queda activa y puede iniciar sesión | `[PENDIENTE]` ADR-008 |
| CA-HU11-2 | **Dado** un usuario activo, **cuando** lo desactivo, **entonces** sus credenciales dejan de ser válidas de inmediato | `[PROPUESTA]` |
| CA-HU11-3 | **Dado** un usuario con reservas futuras, **cuando** lo desactivo, **entonces** el sistema informa el impacto antes de confirmar | `[PROPUESTA]` |
| CA-HU11-4 | **Dado** un usuario no administrador, **cuando** intenta gestionar usuarios, **entonces** recibe `403` | `[PROPUESTA]` |
| CA-HU11-5 | **Dado** cualquier operación de gestión de usuarios, **cuando** se ejecuta, **entonces** queda registrada en auditoría | `[PROPUESTA]` |

---

### HU-12 · Historial de monitorías del estudiante · 3 pts · Prioridad 3

> Como estudiante, quiero consultar el historial de todas las monitorías a las que he asistido, incluyendo asignatura, fecha, monitor y evaluación realizada, de tal manera que pueda hacer seguimiento a mi proceso de apoyo académico.

**Requisitos:** RF-046, RF-053 · **Fase:** FASE-05

| ID | Criterio | Estado |
|---|---|---|
| CA-HU12-1 | **Dado** sesiones pasadas propias, **cuando** consulto el historial, **entonces** veo asignatura, fecha, monitor y mi evaluación | `[PROPUESTA]` |
| CA-HU12-2 | **Dado** un estudiante sin historial, **cuando** consulta, **entonces** recibe una lista vacía con `200` | `[PROPUESTA]` |
| CA-HU12-3 | **Dado** el historial de otro estudiante, **cuando** intento consultarlo, **entonces** recibo `403` | `[PROPUESTA]` |
| CA-HU12-4 | **Dado** un historial extenso, **cuando** lo consulto, **entonces** viene paginado | `[PROPUESTA]` |

---

## 7. Definition of Ready y Definition of Done

### 7.1 Definition of Ready — una historia puede entrar a un sprint

- [ ] La historia tiene ID, puntos y prioridad.
- [ ] Todos sus criterios de aceptación están en `[CONFIRMADO]`.
- [ ] Todos los ADR de los que depende están cerrados.
- [ ] El contrato de API está definido y confirmado.
- [ ] Las reglas de negocio implicadas (`RN-xxx`) están documentadas en `DDD.md`.
- [ ] La historia cabe en un sprint; si no, está partida.
- [ ] Las dependencias con otras historias están explícitas.

### 7.2 Definition of Done — una historia está terminada

- [ ] Todos los criterios de aceptación tienen al menos una prueba automatizada que los verifica.
- [ ] Ciclo TDD documentado en el PR (RED → GREEN → REFACTOR), con evidencia.
- [ ] Suite completa en verde; linter y verificación de tipos sin errores.
- [ ] Cobertura de dominio y servicios por encima del umbral (RNF-CAL-001).
- [ ] PR revisada y aprobada por un integrante distinto del autor.
- [ ] Documentación actualizada: TRD, SAD, DDD y ficha de fase.
- [ ] Contrato de API reflejado en el esquema OpenAPI.
- [ ] Deuda técnica registrada en Jira, si la hubo.
- [ ] Sin secretos, sin `console.log`, sin `print` de depuración, sin pruebas en `skip` no justificadas.
- [ ] Mergeado a `develop` a través de PR.

---

## 8. Matriz de trazabilidad

Cada requisito se conecta con su historia, su fase y su regla de negocio. Un requisito sin prueba no puede marcarse como terminado.

| Requisito | Historia | Fase | Regla de negocio | Estado |
|---|---|---|---|---|
| RF-010, RF-011 | HU-01 | FASE-01 | RN-001 | Bloqueado |
| RF-012 | HU-01, HU-11 | FASE-01 | RN-002 | Bloqueado |
| RF-020, RF-021, RF-025 | HU-11 | FASE-01 | RN-002 | Bloqueado |
| RF-022, RF-023, RF-024 | HU-11 | FASE-02 | — | Bloqueado |
| RF-030 a RF-033 | HU-05 | FASE-03 | RN-003 | Bloqueado |
| RF-034 | HU-02 | FASE-03 | — | Bloqueado |
| RF-040 a RF-042 | HU-03 | FASE-04 | RN-004 | Bloqueado |
| RF-043, RF-044 | HU-04 | FASE-04 | RN-005 | Bloqueado |
| RF-045, RF-046 | HU-03, HU-12 | FASE-04, FASE-05 | — | Bloqueado |
| RF-050 a RF-053 | HU-06, HU-12 | FASE-05 | RN-006 | Bloqueado |
| RF-060 a RF-063 | HU-07 | FASE-06 | RN-007 | Bloqueado |
| RF-070 a RF-073 | HU-08 | FASE-07 | RN-008 | Bloqueado |
| RF-080 a RF-083 | HU-09 | FASE-08 | RN-009 | Bloqueado |
| RF-090 a RF-092 | HU-10 | FASE-09 | RN-010 | Bloqueado |

---

## 9. Riesgos del proyecto

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | 15 decisiones abiertas frenan el arranque | Alta | Alto | Sesión de confirmación de tanda 1 antes del Sprint 1 |
| R-02 | Capacidad del equipo: 15 h/semana entre tres personas para 79 puntos | Alta | Alto | Priorizar HU-01 a HU-06; HU-08, HU-10 y HU-12 son candidatas a recorte de alcance |
| R-03 | Concurrencia en reservas (CA-HU03-3) resuelta de forma ingenua | Media | Alto | Restricción de unicidad en base de datos + prueba de concurrencia explícita |
| R-04 | Cambio de `AUTH_USER_MODEL` después de la primera migración | Media | Muy alto | Cerrar ADR-008 antes de cualquier `makemigrations` |
| R-05 | Integración institucional nunca se concreta | Alta | Medio | Diseñar autenticación desacoplada; declarar SSO fuera de alcance si no hay respuesta |
| R-06 | Panel de métricas (13 pts) sin fórmulas acordadas | Alta | Medio | Cerrar ADR-013 antes de FASE-09; partir la historia en tres |
| R-07 | Secreto expuesto en el repositorio (`SECRET_KEY`) | **Ocurrido** | Alto | Rotar la clave en FASE-00 y mover toda configuración al entorno |

---

## 10. Gobierno del documento

| Rol | Responsable | Autoridad |
|---|---|---|
| Scrum Master | Alejandro Puerta Loaiza | Confirma decisiones de proceso y prioridad |
| Developer | Miguel Gómez Mayorga | Confirma decisiones técnicas en consenso |
| Developer | Nicolás García Orozco | Confirma decisiones técnicas en consenso |
| Cliente académico | Decanatura / Dirección Académica | Confirma reglas de negocio institucionales |

**Cambios a este documento:** vía PR con la etiqueta `docs`, revisada por al menos un integrante distinto del autor. Los IDs nunca se reutilizan ni se renumeran.
