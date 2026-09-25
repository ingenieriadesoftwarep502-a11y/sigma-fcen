# Registro de decisiones — SIGMA-FCEN

**Función:** este archivo es el **interruptor de arranque** del proyecto. Mientras un ADR esté abierto, todo lo que dependa de él está bloqueado para implementación.

**Cómo se usa:**

1. El agente busca aquí el ADR de lo que va a construir.
2. Si el estado no es `[CONFIRMADO]`, **no implementa**: presenta la propuesta y formula la pregunta.
3. El humano responde. El agente mueve el ADR a §2 (decisiones cerradas) con fecha y autor, y actualiza las etiquetas en TRD / SAD / DDD / ficha de fase.

**Quién confirma:** Alejandro Puerta Loaiza (Scrum Master) para decisiones de proceso y producto; el equipo de desarrollo en consenso para decisiones técnicas; el cliente académico (Decanatura / Dirección Académica) para reglas de negocio institucionales.

---

## 1. Decisiones abiertas

Ordenadas por urgencia. Las de tanda 1 bloquean el inicio del proyecto.

### Tanda 1 — Bloquean FASE-00 (infraestructura)

---

#### ADR-001 · Gestión de dependencias del backend

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-00, y por transitividad todo el backend
- **Contexto:** `backend/` no tiene `requirements.txt` ni `pyproject.toml`. Hoy no es posible reproducir el entorno en otra máquina.

| Opción | Ventaja | Costo |
|---|---|---|
| **A. `uv` + `pyproject.toml`** (recomendada) | Resolución e instalación muy rápidas, lockfile determinista, estándar moderno | Herramienta nueva para el equipo |
| B. `pip` + `requirements.txt` + `requirements-dev.txt` | Conocido por todos, cero curva de aprendizaje | Sin lockfile real; entornos divergentes entre integrantes |

- **Pregunta:** ¿Usamos `uv` con `pyproject.toml`, o nos quedamos con `pip` y `requirements.txt`?

---

#### ADR-002 · Configuración por entorno y manejo de secretos

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-00, RNF-SEC-001
- **Contexto:** `backend/mi_proyecto/settings.py` tiene `SECRET_KEY` hardcodeada y `DEBUG = True`. El archivo `.env` ya define `DJANGO_ENV`, `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`, `COOKIE_SAMESITE`, pero `settings.py` **no los lee**. Es una vulnerabilidad activa, no una preferencia de estilo.

| Opción | Ventaja | Costo |
|---|---|---|
| **A. `django-environ` + `settings/` por entorno** (recomendada) | Idiomático en Django, lee `DATABASE_URL` directo | Sin validación de tipos estricta |
| B. `pydantic-settings` | Validación fuerte y tipada, falla temprano | Menos convencional en proyectos Django |

- **Nota:** la `SECRET_KEY` actual ya está expuesta en el repositorio y **debe rotarse** al cerrar este ADR.
- **Pregunta:** ¿`django-environ` con módulo `settings/` dividido por entorno (`base`, `dev`, `prod`, `test`)?

---

#### ADR-003 · Estructura definitiva de carpetas y renombrado

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-00, todas las fases posteriores
- **Contexto:** hoy existen `backend/mi_proyecto/` y `frontend/my-app/`, nombres de scaffold. La documentación base propone `backend/config/` + `backend/apps/*` y `frontend/app/...`. Renombrar después de tener código cuesta mucho más que ahora.

| Opción | Ventaja | Costo |
|---|---|---|
| **A. Renombrar ahora** (recomendada): `mi_proyecto` → `config`, `frontend/my-app` → `frontend` | Alineado con la arquitectura documentada; se hace con el repo vacío | Un PR de reestructura inicial |
| B. Conservar los nombres actuales | Cero trabajo inmediato | Documentación y código divergentes de forma permanente |

- **Pregunta:** ¿Renombramos a `backend/config/` y `frontend/` en el PR de FASE-00?

---

#### ADR-004 · Estrategia de pruebas

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-00 y, por la Ley de la prueba primero, **absolutamente todo el desarrollo**
- **Contexto:** no hay suite de pruebas en ninguno de los dos proyectos. Sin runner definido, el gate G2 no se puede ejecutar.

| Capa | Opción recomendada | Alternativa |
|---|---|---|
| Backend unitario / integración | `pytest` + `pytest-django` + `factory-boy` | `unittest` nativo de Django |
| Cobertura backend | `pytest-cov`, umbral mínimo a definir | — |
| Frontend unitario / componentes | `vitest` + `@testing-library/react` | `jest` |
| End-to-end | `playwright` | `cypress` |

- **Pregunta:** ¿Confirmas `pytest` + `pytest-django` en backend y `vitest` + Testing Library en frontend, con Playwright para E2E a partir de FASE-04?

---

#### ADR-005 · Entorno de base de datos local

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-00
- **Contexto:** la arquitectura exige PostgreSQL; Django usa SQLite por defecto. Desarrollar sobre SQLite y desplegar sobre PostgreSQL genera fallos que solo aparecen en producción.

| Opción | Ventaja | Costo |
|---|---|---|
| **A. `docker-compose` con PostgreSQL 16** (recomendada) | Paridad exacta dev/prod, arranque de un comando | Requiere Docker instalado en las tres máquinas |
| B. PostgreSQL instalado localmente | Sin Docker | Configuración manual repetida por integrante |

- **Pregunta:** ¿Todos los integrantes pueden usar Docker Desktop, o hay que ir por instalación local de PostgreSQL?

---

#### ADR-006 · Integración continua

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-00, gate G4 automatizado
- **Contexto:** el gate G4 exige suite verde antes del merge. Sin CI, la verificación depende de la memoria de cada persona.
- **Propuesta:** GitHub Actions con un workflow que corra, en cada PR hacia `develop`: `ruff` + `mypy` + `pytest` (backend) y `eslint` + `tsc --noEmit` + `vitest` (frontend). Rama `develop` protegida: sin CI en verde y sin una aprobación, no hay merge.
- **Pregunta:** ¿Activamos protección de rama en `develop` exigiendo CI verde + 1 aprobación?

---

### Tanda 2 — Bloquean FASE-01 (identidad y acceso)

---

#### ADR-007 · Mecanismo de autenticación

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-01, HU-01, y todo endpoint protegido
- **Contexto:** el documento base menciona "integración con autenticación institucional" sin especificar mecanismo. Next.js y Django viven en orígenes distintos.

| Opción | Ventaja | Costo |
|---|---|---|
| **A. JWT en cookies `HttpOnly` + `SameSite`** (recomendada) | Inmune a robo por XSS, funciona con SSR de Next.js, `COOKIE_SAMESITE` ya está en `.env` | Requiere manejo de CSRF y de refresh |
| B. JWT en `localStorage` (`djangorestframework-simplejwt`) | Implementación más simple | Vulnerable a XSS; inaceptable con datos académicos |
| C. Sesiones de Django | Nativo, probado | Acoplamiento fuerte entre frontend y backend |

- **Pregunta:** ¿Confirmas JWT en cookies `HttpOnly` con `simplejwt`, dejando el SSO institucional como integración futura?

---

#### ADR-008 · Modelo de usuario y representación de roles

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-01, FASE-02, modelo de datos completo
- **Contexto:** hay cuatro roles (Estudiante, Monitor, Docente, Administrador). Una persona puede ser simultáneamente estudiante y monitor — caso real y frecuente en monitorías. El modelo debe decidirse **antes** de la primera migración, porque cambiar `AUTH_USER_MODEL` después es extremadamente costoso.

| Opción | Ventaja | Costo |
|---|---|---|
| **A. `User` custom + tabla `UserRole` (N:M)** (recomendada) | Soporta roles múltiples y simultáneos; refleja la realidad | Comprobaciones de permiso algo más elaboradas |
| B. `User` custom con campo `role` único | Simple de consultar | No representa al estudiante que además es monitor |
| C. Grupos nativos de Django | Cero modelo propio | Semántica de negocio diluida en infraestructura |

- **Pregunta clave adicional:** ¿un mismo usuario puede tener varios roles al mismo tiempo? De esta respuesta depende todo el modelo de dominio.
- **Pregunta:** ¿`User` custom con relación N:M a `Role`, definido en la primera migración?

---

#### ADR-009 · Política de registro y verificación institucional

- **Estado:** `[PENDIENTE]`
- **Bloquea:** HU-01
- **Contexto:** HU-01 dice "registrarme con mis datos institucionales" sin definir qué valida el sistema ni quién asigna el rol.

Preguntas encadenadas que deben resolverse juntas:

| # | Pregunta | Impacto |
|---|---|---|
| 1 | ¿Se restringe el registro a un dominio de correo institucional? ¿Cuál? | Validación en el serializer |
| 2 | ¿El usuario elige su rol al registrarse, o el administrador lo asigna? | Flujo completo de alta |
| 3 | ¿La cuenta requiere verificación por correo antes de activarse? | Se necesita servicio SMTP en FASE-00 |
| 4 | ¿Quién crea a los monitores: se auto-registran o los da de alta el administrador? | Regla de negocio de HU-05 |

- **Pregunta:** ¿Cuál es el flujo de alta aprobado, respondiendo las cuatro preguntas de la tabla?

---

### Tanda 3 — Bloquean el núcleo funcional (FASE-03 a FASE-06)

---

#### ADR-010 · Granularidad de franjas y reglas de conflicto

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-03, FASE-04, RN-003, RN-004
- **Contexto:** "prevenir conflictos de horario" no es implementable sin números concretos.

| # | Pregunta | Propuesta a validar |
|---|---|---|
| 1 | Duración de una sesión de monitoría | 60 minutos fijos |
| 2 | ¿Las franjas se dividen en bloques fijos o el monitor define rangos libres? | Bloques fijos de 60 min |
| 3 | ¿Una franja admite un estudiante o varios (monitoría grupal)? | Capacidad configurable, por defecto 1 |
| 4 | ¿Un estudiante puede tener varias reservas activas simultáneas? | Máximo 1 por asignatura y semana |
| 5 | ¿Las franjas se repiten semanalmente o se publican fecha a fecha? | Plantilla semanal recurrente |
| 6 | ¿Con cuánta anticipación mínima se puede reservar? | 2 horas antes del inicio |

- **Pregunta:** ¿Se aprueban las seis propuestas de la tabla, o cuáles cambian?

---

#### ADR-011 · Política de cancelación

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-04, HU-04, RN-005
- **Contexto:** HU-04 exige cancelar "con suficiente anticipación". El documento base delega explícitamente esa definición al equipo.

| # | Pregunta | Propuesta a validar |
|---|---|---|
| 1 | Ventana mínima de cancelación para el estudiante | 4 horas antes del inicio |
| 2 | ¿Qué pasa si cancela fuera de la ventana? | Se registra como inasistencia en su historial |
| 3 | ¿El monitor puede cancelar? ¿Con qué condiciones? | Sí, con justificación obligatoria y notificación |
| 4 | ¿Hay penalización por inasistencias reiteradas? | No en la versión 1; se mide y se reporta |

- **Pregunta:** ¿Se aprueban las cuatro propuestas de la tabla?

---

#### ADR-012 · Repositorio de materiales: almacenamiento y límites

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-07, HU-08
- **Contexto:** el documento base no define formatos, tamaños ni destino de almacenamiento.

| # | Pregunta | Propuesta a validar |
|---|---|---|
| 1 | ¿Dónde se guardan los archivos? | Sistema de archivos local en v1, con abstracción de Django storages para migrar a S3 |
| 2 | Formatos permitidos | `pdf`, `docx`, `pptx`, `png`, `jpg`, `zip` |
| 3 | Tamaño máximo por archivo | 20 MB |
| 4 | ¿Quién puede subir? ¿Quién puede ver? | Suben monitores y docentes; ven todos los usuarios autenticados |
| 5 | ¿Se validan los archivos contra malware? | No en v1; se registra como deuda técnica |

- **Pregunta:** ¿Se aprueban las cinco propuestas de la tabla?

---

#### ADR-013 · Definición exacta de las métricas administrativas

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-09, HU-10
- **Contexto:** HU-10 vale 13 puntos y es la historia más grande del backlog. Sin fórmulas explícitas, cada número del panel sería una interpretación del implementador.

| Métrica | Fórmula propuesta | Duda a resolver |
|---|---|---|
| Monitorías realizadas | Conteo de sesiones con estado `COMPLETED` en el rango | ¿Cuentan las sesiones con inasistencia del estudiante? |
| Demanda por asignatura | Conteo de reservas creadas, agrupado por asignatura | ¿Reservas creadas o reservas efectivamente atendidas? |
| Horarios de mayor demanda | Conteo de reservas agrupado por día de semana y hora | ¿Se incluyen las canceladas? |
| Valoración de monitores | Promedio de calificaciones, mínimo 5 evaluaciones para publicarse | ¿Cuál es el mínimo real? ¿Escala 1–5? |
| Estudiantes atendidos | Conteo distinto de estudiantes con al menos una sesión `COMPLETED` | — |
| Cumplimiento del programa | Horas atendidas / horas comprometidas por el monitor | ¿Dónde se registran las horas comprometidas? |

- **Pregunta:** ¿Puedes validar las seis fórmulas y responder las dudas de la columna derecha?

---

### Tanda 4 — Bloquean el cierre (FASE-10)

---

#### ADR-014 · Proveedor y estrategia de despliegue

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-10, RNF-OPS-001
- **Opciones:** Railway o Render (backend + PostgreSQL gestionado) con Vercel para el frontend; alternativamente infraestructura de la Dirección de Tecnología de la universidad.
- **Pregunta:** ¿El despliegue es en nube pública o en infraestructura institucional?

---

#### ADR-015 · Integración con sistemas institucionales

- **Estado:** `[PENDIENTE]`
- **Bloquea:** FASE-10, RNF-INT-001
- **Contexto:** el documento base menciona autenticación institucional y bases de datos institucionales sin especificar protocolos ni contactos.
- **Pregunta:** ¿Existe un contacto en la Dirección de Tecnología y un protocolo disponible (SAML, LDAP, OAuth2, API de estudiantes)? Si no lo hay, ¿se declara fuera de alcance para esta versión?

---

## 2. Decisiones cerradas

Se registran aquí al confirmarse. Formato obligatorio:

| ID | Decisión | Estado | Confirmado por | Fecha | Documentos actualizados |
|---|---|---|---|---|---|
| — | _(ninguna aún)_ | — | — | — | — |

---

## 3. Decisiones heredadas del documento base

Provienen de la definición original del proyecto y se consideran confirmadas por el cliente académico.

| ID | Decisión | Estado | Fuente |
|---|---|---|---|
| ADR-000-a | Backend en Python + Django + Django REST Framework | `[CONFIRMADO]` | Documentación base §7 |
| ADR-000-b | Frontend en Next.js + React + TypeScript | `[CONFIRMADO]` | Documentación base §7 |
| ADR-000-c | Base de datos PostgreSQL | `[CONFIRMADO]` | Documentación base §7 |
| ADR-000-d | Comunicación por API REST sobre JSON | `[CONFIRMADO]` | Documentación base §8 |
| ADR-000-e | Git Flow (`main` / `develop` / `feature/*`) con PR obligatoria hacia `develop` | `[CONFIRMADO]` | Documentación base §7, §14 |
| ADR-000-f | Scrum como marco de trabajo; Jira como gestor del backlog | `[CONFIRMADO]` | Documentación base §14 |
| ADR-000-g | Una historia no está terminada sin pruebas que verifiquen sus criterios de aceptación | `[CONFIRMADO]` | Documentación base §15 |
| ADR-000-h | La deuda técnica se registra explícitamente en Jira | `[CONFIRMADO]` | Documentación base §15 |

---

## 4. Resumen de bloqueo por fase

| Fase | ADR que debe cerrarse antes de iniciar |
|---|---|
| FASE-00 | ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006 |
| FASE-01 | ADR-007, ADR-008, ADR-009 |
| FASE-02 | ADR-008 |
| FASE-03 | ADR-010 |
| FASE-04 | ADR-010, ADR-011 |
| FASE-05 | ADR-010 |
| FASE-06 | ADR-013 (escala de calificación) |
| FASE-07 | ADR-012 |
| FASE-08 | ADR-008 |
| FASE-09 | ADR-013 |
| FASE-10 | ADR-014, ADR-015 |

> **15 decisiones abiertas. 0 cerradas. Ninguna fase puede iniciar implementación hoy.**
