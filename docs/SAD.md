# SAD — Software Architecture Document · SIGMA-FCEN

| Campo | Valor |
|---|---|
| Sistema | SIGMA-FCEN |
| Versión | 1.0 |
| Fecha | 2026-09-24 |
| Estado global | `[PROPUESTA]` salvo lo marcado como heredado de la definición del proyecto |
| Documentos relacionados | [`TRD.md`](TRD.md) · [`DDD.md`](DDD.md) · [`DECISIONES-ABIERTAS.md`](DECISIONES-ABIERTAS.md) |

> **Advertencia para agentes:** este documento describe la arquitectura **propuesta**. Ninguna estructura aquí descrita se implementa hasta que su ADR esté `[CONFIRMADO]`.

---

## 1. Drivers arquitectónicos

Lo que realmente condiciona el diseño. Todo lo demás es consecuencia.

| # | Driver | Origen | Consecuencia arquitectónica |
|---|---|---|---|
| D-1 | Prevenir doble reserva bajo concurrencia | CA-HU03-3 | Invariante garantizada en base de datos, no en la capa de aplicación |
| D-2 | Autorización por rol en cada operación | RNF-SEC-004 | Capa de permisos explícita y probada por endpoint |
| D-3 | Equipo de 3 personas con 5 h/semana cada una | Documentación base §18 | Arquitectura convencional; nada que exija mantenimiento costoso |
| D-4 | Reglas de negocio verificables con pruebas rápidas | RNF-CAL-001, TDD estricto | Lógica de dominio aislada de Django ORM y de HTTP |
| D-5 | Autenticación institucional futura e indefinida | ADR-015 | Autenticación desacoplada tras una frontera reemplazable |
| D-6 | Trazabilidad para acreditación | Documentación base §1 | Historial inmutable: borrado lógico, auditoría de operaciones sensibles |
| D-7 | Dos despliegues independientes (API y web) | ADR-000-b/d | API REST sin estado, CORS controlado, contrato versionado |

---

## 2. Vista de contexto

```text
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────┐
│  Estudiante  │   │   Monitor    │   │   Docente    │   │ Administrador │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └───────┬───────┘
       │                  │                  │                   │
       └──────────────────┴────────┬─────────┴───────────────────┘
                                   │ HTTPS
                          ┌────────▼─────────┐
                          │    SIGMA-FCEN    │
                          │  Web + API REST  │
                          └────────┬─────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
   ┌────────▼────────┐   ┌─────────▼────────┐   ┌─────────▼─────────┐
   │   PostgreSQL    │   │ Almacenamiento   │   │ Servicios         │
   │   (datos)       │   │ de archivos      │   │ institucionales   │
   │                 │   │ [PENDIENTE 012]  │   │ [PENDIENTE 015]   │
   └─────────────────┘   └──────────────────┘   └───────────────────┘
```

---

## 3. Vista de contenedores

| Contenedor | Tecnología | Responsabilidad | Despliegue |
|---|---|---|---|
| Web | Next.js 16 · React 19 · TypeScript 5 | Interfaz, enrutamiento, renderizado, sesión de cliente | `[PENDIENTE]` ADR-014 |
| API | Django 5.2 · Django REST Framework | Reglas de negocio, autorización, persistencia | `[PENDIENTE]` ADR-014 |
| Base de datos | PostgreSQL 16 | Almacenamiento transaccional e invariantes | `[PENDIENTE]` ADR-005 / ADR-014 |
| Archivos | `[PENDIENTE]` ADR-012 | Material académico | `[PENDIENTE]` ADR-012 |

**Comunicación:** Web → API mediante HTTPS + JSON bajo `/api/v1/`. API → Base de datos mediante Django ORM.

> Las versiones de Django, Next.js y React corresponden a lo instalado hoy en el repositorio (`backend/mi_proyecto/settings.py`, `frontend/my-app/package.json`). DRF, PostgreSQL y las herramientas de prueba **aún no están instalados**.

---

## 4. Arquitectura del backend

### 4.1 Decisión de estilo · `[PROPUESTA]`

Arquitectura **en capas con dominio aislado**: hexagonal en lo que aporta valor, pragmática en lo que no.

**Por qué no hexagonal puro:** implementar repositorios abstractos sobre el ORM de Django duplica trabajo que el framework ya resuelve y castiga a un equipo de 15 h/semana totales. **Por qué no "todo en las vistas":** las reglas de reserva, cancelación y evaluación son el corazón del sistema (D-4), y si viven dentro de `ViewSet` solo se pueden probar levantando HTTP.

**Punto medio adoptado:** las reglas puras viven en `domain/`, sin importar Django; la orquestación transaccional vive en `services/`; las vistas solo traducen HTTP.

```text
┌─────────────────────────────────────────────────────────┐
│  api/          Vistas DRF, serializers, permisos, rutas │
│                Sin reglas de negocio                     │
├─────────────────────────────────────────────────────────┤
│  services/     Casos de uso, transacciones, coordinación │
│                Única capa que abre transacciones         │
├─────────────────────────────────────────────────────────┤
│  domain/       Reglas e invariantes puras                │
│                NO importa django. Pruebas sin BD         │
├─────────────────────────────────────────────────────────┤
│  models/       Modelos Django, constraints, migraciones  │
│                Invariantes duras en la base de datos     │
└─────────────────────────────────────────────────────────┘
```

**Regla de dependencia:** `api → services → domain` y `services → models`. Nunca al revés. `domain/` no importa nada de Django: es la prueba objetiva de que las reglas están aisladas.

### 4.2 Estructura de carpetas propuesta · `[PROPUESTA]` ADR-003

Estructura *screaming*: los nombres de las carpetas gritan el negocio, no el framework.

```text
backend/
├── config/                      # antes "mi_proyecto" — ADR-003
│   ├── settings/
│   │   ├── base.py              # configuración común
│   │   ├── development.py
│   │   ├── production.py
│   │   └── test.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   ├── accounts/                # autenticación, User custom, roles
│   ├── academics/               # asignaturas, cursos, asignaciones
│   ├── availability/            # franjas del monitor
│   ├── reservations/            # reservas y cancelaciones
│   ├── tutoring_sessions/       # registro de sesiones
│   ├── evaluations/             # calificaciones y comentarios
│   ├── materials/               # repositorio académico
│   └── analytics/               # métricas y agregados
├── shared/
│   ├── exceptions.py            # jerarquía de errores de dominio
│   ├── permissions.py           # permisos DRF reutilizables
│   ├── pagination.py
│   └── time.py                  # utilidades de zona horaria (RNF-DAT-001)
├── tests/
│   ├── unit/                    # dominio puro, sin base de datos
│   ├── integration/             # servicios + base de datos
│   └── api/                     # contrato HTTP extremo a extremo
├── manage.py
└── pyproject.toml               # o requirements.txt — ADR-001
```

**Anatomía interna de cada app:**

```text
apps/reservations/
├── domain/
│   ├── rules.py                 # RN-004, RN-005 puras
│   └── exceptions.py
├── models.py                    # Reservation + constraints
├── services.py                  # create_reservation, cancel_reservation
├── serializers.py
├── views.py
├── permissions.py
├── urls.py
└── migrations/
```

### 4.3 Dónde vive cada cosa

Tabla de decisión para agentes. Sin ambigüedad.

| Si vas a escribir… | Va en… | Nunca en… |
|---|---|---|
| "no se puede reservar una franja pasada" | `domain/rules.py` | serializer, vista |
| "reservar y marcar la franja ocupada en una transacción" | `services.py` | vista, modelo |
| "el cuerpo debe traer `slot_id` numérico" | `serializers.py` | dominio |
| "solo el rol Estudiante accede" | `permissions.py` | vista, serializer |
| "una franja no admite dos reservas activas" | `models.py` como `UniqueConstraint` | solo en Python |
| "traducir un error de dominio a HTTP 409" | *exception handler* en `shared/` | dominio |

### 4.4 Garantía de la invariante crítica (D-1) · `[PROPUESTA]`

CA-HU03-3 exige que, ante dos peticiones simultáneas sobre la misma franja, exactamente una gane. Validar con un `if` en el serializer **no** lo garantiza: entre la comprobación y la escritura existe una ventana de carrera.

Defensa en tres capas:

| Capa | Mecanismo | Qué aporta |
|---|---|---|
| Base de datos | `UniqueConstraint(fields=["slot"], condition=Q(status="CONFIRMED"))` | Garantía absoluta, incluso con varios procesos |
| Servicio | `select_for_update()` dentro de `transaction.atomic()` | Serializa el acceso y produce un error limpio |
| API | Traducción de `IntegrityError` a `409 Conflict` | Respuesta comprensible para el cliente |

**La prueba de CA-HU03-3 debe ejercitar concurrencia real** (hilos o transacciones simultáneas), no dos llamadas secuenciales.

---

## 5. Arquitectura del frontend

### 5.1 Estilo · `[PROPUESTA]`

Next.js App Router con **separación contenedor / presentación** y composición atómica.

```text
Server Component   → obtiene datos, decide qué mostrar (contenedor)
Client Component   → interacción y estado local (presentación)
```

**Regla:** un componente que recibe datos por props y no consulta la API es presentacional y debe poder probarse sin red.

### 5.2 Estructura propuesta · `[PROPUESTA]` ADR-003

```text
frontend/
├── app/
│   ├── (auth)/login/
│   ├── (student)/monitorias/ · reservas/ · historial/
│   ├── (monitor)/disponibilidad/ · sesiones/
│   ├── (teacher)/seguimiento/
│   ├── (admin)/usuarios/ · asignaturas/ · metricas/
│   └── layout.tsx
├── components/
│   ├── ui/                      # átomos: Button, Input, Badge
│   ├── patterns/                # moléculas: SlotCard, ReservationRow
│   └── layouts/                 # organismos: Sidebar, PageHeader
├── features/                    # vertical por dominio
│   ├── reservations/
│   │   ├── api.ts               # llamadas HTTP
│   │   ├── types.ts             # tipos del contrato
│   │   ├── hooks.ts
│   │   └── components/
│   └── availability/ · sessions/ · evaluations/ · analytics/
├── lib/
│   ├── api-client.ts            # cliente HTTP único, manejo de errores
│   ├── auth.ts
│   └── date.ts                  # zona horaria — RNF-DAT-001
├── types/
│   └── api.d.ts                 # tipos generados desde OpenAPI
└── tests/
```

**Frontera:** los componentes de `components/` nunca importan de `features/`. La dependencia va siempre `app → features → components → lib`.

### 5.3 Contrato de tipos

Los tipos de `types/api.d.ts` se **generan** desde el esquema OpenAPI del backend; no se escriben a mano. Así un cambio de contrato rompe la compilación del frontend en lugar de romper en producción.

---

## 6. Diseño de la API

### 6.1 Convenciones · `[PROPUESTA]`

| Aspecto | Convención |
|---|---|
| Prefijo | `/api/v1/` (RNF-MAN-002) |
| Recursos | Sustantivos en plural e inglés: `/reservations/`, `/availability-slots/` |
| Formato | JSON; claves en `snake_case` |
| Fechas | ISO-8601 en UTC con sufijo `Z` |
| Paginación | Por cursor o por número de página, con `page_size` máximo de 100 |
| Filtros | Parámetros de consulta: `?subject=&date_from=&date_to=&monitor=` |
| Documentación | OpenAPI generado con `drf-spectacular`, servido en `/api/v1/schema/` |

### 6.2 Endpoints propuestos

Todos en `[PROPUESTA]`. Ninguno se implementa antes de cerrar el ADR de su fase.

| Método | Ruta | Rol | Historia | Fase |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register/` | público | HU-01 | 01 |
| `POST` | `/api/v1/auth/login/` | público | HU-01 | 01 |
| `POST` | `/api/v1/auth/logout/` | autenticado | HU-01 | 01 |
| `POST` | `/api/v1/auth/refresh/` | autenticado | HU-01 | 01 |
| `GET` | `/api/v1/users/me/` | autenticado | HU-01 | 01 |
| `GET/POST` | `/api/v1/users/` | admin | HU-11 | 01 |
| `GET/PATCH` | `/api/v1/users/{id}/` | admin | HU-11 | 01 |
| `POST` | `/api/v1/users/{id}/deactivate/` | admin | HU-11 | 01 |
| `GET/POST` | `/api/v1/subjects/` | admin (escritura), autenticado (lectura) | HU-11 | 02 |
| `GET/POST` | `/api/v1/courses/` | admin | HU-11 | 02 |
| `GET/POST` | `/api/v1/availability-slots/` | monitor (escritura), autenticado (lectura) | HU-05, HU-02 | 03 |
| `PATCH/DELETE` | `/api/v1/availability-slots/{id}/` | monitor propietario | HU-05 | 03 |
| `GET` | `/api/v1/availability-slots/search/` | autenticado | HU-02 | 03 |
| `GET/POST` | `/api/v1/reservations/` | estudiante | HU-03 | 04 |
| `POST` | `/api/v1/reservations/{id}/cancel/` | estudiante propietario | HU-04 | 04 |
| `GET` | `/api/v1/reservations/mine/` | estudiante o monitor | HU-03, HU-12 | 04 |
| `POST` | `/api/v1/tutoring-sessions/` | monitor | HU-06 | 05 |
| `GET` | `/api/v1/tutoring-sessions/{id}/` | participantes o docente del curso | HU-06 | 05 |
| `GET` | `/api/v1/tutoring-sessions/history/` | estudiante | HU-12 | 05 |
| `POST` | `/api/v1/evaluations/` | estudiante | HU-07 | 06 |
| `GET` | `/api/v1/monitors/{id}/rating/` | autenticado | HU-07 | 06 |
| `GET/POST` | `/api/v1/materials/` | monitor o docente (escritura) | HU-08 | 07 |
| `DELETE` | `/api/v1/materials/{id}/` | autor | HU-08 | 07 |
| `GET` | `/api/v1/teaching/monitors/` | docente | HU-09 | 08 |
| `GET` | `/api/v1/teaching/sessions/` | docente | HU-09 | 08 |
| `GET` | `/api/v1/analytics/dashboard/` | admin | HU-10 | 09 |

### 6.3 Manejo de errores · `[PROPUESTA]`

Formato único de error, inspirado en RFC 9457:

```json
{
  "type": "slot_already_reserved",
  "title": "La franja ya fue reservada",
  "status": 409,
  "detail": "Otro estudiante reservó esta franja hace instantes.",
  "instance": "/api/v1/reservations/",
  "errors": { "slot_id": ["Ya no está disponible."] }
}
```

| Código | Cuándo se usa |
|---|---|
| `400` | Datos inválidos o regla de negocio violada por el contenido enviado |
| `401` | Sin autenticación |
| `403` | Autenticado pero sin permiso para el recurso |
| `404` | El recurso no existe **o** el usuario no debe saber que existe |
| `409` | Conflicto de estado: franja ocupada, reserva ya cancelada, sesión duplicada |
| `413` | Archivo por encima del tamaño máximo |
| `422` | Reservado; no se usa en la versión 1 |
| `500` | Error no controlado; siempre registrado con identificador de correlación |

**Jerarquía de excepciones:** el dominio lanza `DomainError` y sus subclases; un *exception handler* central las traduce a HTTP. El dominio nunca conoce códigos de estado.

---

## 7. Seguridad

| Aspecto | Decisión | Estado |
|---|---|---|
| Autenticación | JWT en cookies `HttpOnly` + `SameSite` | `[PENDIENTE]` ADR-007 |
| Autorización | Clases de permiso DRF por rol y por propiedad del recurso | `[PENDIENTE]` ADR-008 |
| Secretos | Solo por variables de entorno; `.env` fuera del repositorio | `[PENDIENTE]` ADR-002 |
| CORS | Lista blanca desde `CORS_ALLOWED_ORIGINS` | `[PENDIENTE]` ADR-002 |
| CSRF | Activo para autenticación por cookies | `[PENDIENTE]` ADR-007 |
| Transporte | HTTPS obligatorio; `SECURE_SSL_REDIRECT` en producción | `[PROPUESTA]` |
| Contraseñas | Validadores nativos de Django; hasher PBKDF2 | `[PROPUESTA]` |
| Limitación de tasa | `throttling` de DRF en autenticación y reservas | `[PROPUESTA]` |
| Auditoría | Registro de operaciones sensibles con actor, acción y marca de tiempo | `[PROPUESTA]` |
| Archivos subidos | Validación de tipo y tamaño; nombres sanitizados; servidos con `Content-Disposition` | `[PENDIENTE]` ADR-012 |

**Deuda de seguridad ya existente:** `SECRET_KEY` versionada en `backend/mi_proyecto/settings.py` y `DEBUG = True`. Se corrige en FASE-00 y la clave se rota. Registrado como R-07 en el TRD.

---

## 8. Estrategia de pruebas

Pirámide, no reloj de arena. Los detalles de herramientas dependen de ADR-004.

| Nivel | Qué prueba | Velocidad | Proporción objetivo |
|---|---|---|---|
| Unitarias de dominio | Reglas `RN-xxx` puras, sin base de datos | Milisegundos | ~60 % |
| Integración de servicios | Casos de uso con base de datos y transacciones | Segundos | ~30 % |
| Contrato de API | Códigos de estado, permisos, forma de la respuesta | Segundos | ~10 % |
| Extremo a extremo | Flujos críticos: reservar y cancelar | Minutos | 2–3 escenarios |

**Reglas fijas:**

- Cada `CA-HUxx-n` tiene al menos una prueba que lo referencia por nombre.
- Las pruebas de dominio no importan Django. Si lo necesitan, la regla está en la capa equivocada.
- La concurrencia de CA-HU03-3 se prueba con transacciones reales simultáneas.
- Los datos de prueba se construyen con *factories*, no con fixtures JSON.

---

## 9. Vista de despliegue · `[PENDIENTE]` ADR-014

```text
Desarrollo                          Producción (pendiente de ADR-014)
─────────────                       ──────────────────────────────────
docker-compose                      Web      → Vercel / institucional
  ├── postgres:16                   API      → Railway / Render / institucional
  ├── api (runserver)               DB       → PostgreSQL gestionado
  └── web (next dev)                Archivos → local o S3 (ADR-012)
```

| Entorno | Rama | Base de datos | `DEBUG` |
|---|---|---|---|
| Local | `feature/*` | PostgreSQL en Docker | `True` |
| Integración | `develop` | PostgreSQL efímera | `False` |
| Producción | `main` | PostgreSQL gestionada con respaldo | `False` |

---

## 10. Atributos de calidad y sus tácticas

| Atributo | Táctica arquitectónica | Verificación |
|---|---|---|
| Corrección bajo concurrencia | Restricción única en base de datos + `select_for_update` | Prueba de concurrencia de CA-HU03-3 |
| Testabilidad | Dominio sin dependencias de framework | `domain/` sin imports de Django |
| Seguridad | Autorización en el servidor, nunca solo en la interfaz | Prueba de 403 por rol y endpoint |
| Mantenibilidad | Estructura por dominio, regla de dependencia unidireccional | Revisión en PR |
| Evolución | API versionada, tipos generados desde OpenAPI | Compilación del frontend |
| Trazabilidad | Borrado lógico y auditoría | Revisión de modelos |
| Rendimiento | `select_related` / `prefetch_related`, índices en claves de filtro | Assert de número de consultas |

---

## 11. Decisiones explícitamente rechazadas

Documentadas para que ningún agente las reintroduzca sin discusión.

| Alternativa | Por qué se rechaza |
|---|---|
| GraphQL en lugar de REST | Contradice ADR-000-d; añade complejidad sin necesidad para 4 roles y 12 historias |
| Microservicios | Equipo de 3 personas y 15 h/semana; el costo operativo supera cualquier beneficio |
| Repositorios abstractos sobre el ORM | Duplica el ORM de Django sin ganancia real en este alcance |
| Lógica de negocio en serializers de DRF | Imposible de probar sin HTTP; viola D-4 |
| SQLite en desarrollo | Diferencias de comportamiento con PostgreSQL que solo aparecen en producción |
| JWT en `localStorage` | Vulnerable a XSS con datos académicos personales |
| Estado global (Redux, Zustand) desde el inicio | Los Server Components de Next.js cubren la mayoría de los casos; se introduce solo si aparece una necesidad demostrada |

---

## 12. Dependencias entre este documento y las decisiones abiertas

| Sección del SAD | Queda firme al cerrar |
|---|---|
| §4.2 Estructura del backend | ADR-003 |
| §4.4 Invariante de concurrencia | ADR-010 |
| §5.2 Estructura del frontend | ADR-003 |
| §6.2 Endpoints | ADR-007, ADR-008, ADR-010, ADR-011 |
| §7 Seguridad | ADR-002, ADR-007, ADR-008, ADR-012 |
| §8 Pruebas | ADR-004 |
| §9 Despliegue | ADR-014 |
