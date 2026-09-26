# FASE-00 · Fundaciones técnicas

| Campo | Valor |
|---|---|
| Sprint | 0 (semanas 1–2) |
| Historias | Ninguna — habilitador técnico |
| Puntos de backlog | 0 |
| Estado | **En revisión** — implementación local completa (2026-09-25); pendientes: PR, CI en verde, protección de `develop` y verificación por un segundo integrante |
| ADR de entrada | ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006 — todos `[CONFIRMADO]` el 2026-09-25 |

---

## 1. Objetivo

Al cerrar esta fase, cualquier integrante debe poder clonar el repositorio, seguir los pasos documentados en el `README.md` y obtener el proyecto corriendo sobre su PostgreSQL local, con una suite de pruebas que se ejecuta en verde.

**Resultado observable:** un integrante que no participó en la fase levanta el entorno siguiendo el README, sin preguntar nada a nadie.

**Por qué existe esta fase:** el gate G2 del protocolo exige escribir una prueba que falle antes de cualquier código. Hoy no hay runner de pruebas instalado. Sin esta fase, **el protocolo entero es inejecutable**.

---

## 2. Gate de entrada

Bloqueante. Si alguno está abierto, no se escribe código.

- [x] ADR-001 — Gestión de dependencias del backend → opción B: `pip` + `requirements.txt` / `requirements-dev.txt`
- [x] ADR-002 — Configuración por entorno y secretos → `django-environ` + `settings/` por entorno
- [x] ADR-003 — Estructura de carpetas → opción B: **no se renombra** (`backend/mi_proyecto/`, `frontend/my-app/`)
- [x] ADR-004 — Estrategia de pruebas → `pytest` + `pytest-django` + `factory-boy` + `pytest-cov`; `vitest` + Testing Library
- [x] ADR-005 — Entorno de base de datos local → opción B: PostgreSQL local, **sin `docker-compose`**
- [x] ADR-006 — Integración continua → GitHub Actions en PR hacia `develop`

---

## 3. Alcance

### Entra

- Gestión de dependencias reproducible en backend.
- Configuración dividida por entorno, leyendo variables del sistema.
- Rotación de la `SECRET_KEY` expuesta.
- PostgreSQL funcionando en desarrollo.
- Django REST Framework instalado y configurado.
- Suite de pruebas operativa en backend y frontend, con una prueba de humo real en cada uno.
- Linter y verificación de tipos en ambos proyectos.
- Pipeline de CI en cada PR hacia `develop`.
- Protección de la rama `develop`.
- Creación de `backend/apps/` y `backend/shared/` (sin renombrar carpetas existentes — ADR-003 opción B).
- README de arranque.
- Un único `.env` en la raíz, compartido por backend y frontend (decisión del 2026-09-25). No se versionan plantillas `.env.*`; las claves se documentan en el README.

### No entra

- Modelos de dominio, migraciones de negocio, endpoints funcionales.
- Modelo de usuario personalizado — es FASE-01 y depende de ADR-008.
- Diseño visual del frontend.
- Configuración de producción — es FASE-10.
- Docker, tanto en desarrollo (ADR-005 opción B) como en producción.

> **Advertencia para el agente:** la tentación de "ya que estoy, creo el modelo User" en esta fase es exactamente lo que el protocolo prohíbe. `AUTH_USER_MODEL` depende de ADR-008, que está abierto. Riesgo R-04.

---

## 4. Estado técnico de partida (verificado el 2026-09-24, antes de la fase)

| Hecho | Evidencia |
|---|---|
| No existe `requirements.txt` ni `pyproject.toml` | `backend/` |
| `SECRET_KEY` versionada en el repositorio | `backend/mi_proyecto/settings.py:23` |
| `DEBUG = True` fijo en el código | `backend/mi_proyecto/settings.py:27` |
| `INSTALLED_APPS` solo trae apps nativas de Django; **sin DRF** | `backend/mi_proyecto/settings.py:34-41` |
| Base de datos por defecto: SQLite | `backend/mi_proyecto/settings.py` |
| `.env` define 8 variables que `settings.py` **no lee** | `.env` |
| Frontend: `create-next-app` sin modificar | `frontend/my-app/` |
| Sin pruebas en ningún proyecto | — |

---

## 5. Plan de trabajo

Orden estricto. Cada tarea entra en su propio PR.

### T-00.1 · Base de dependencias del backend

**Depende de:** ADR-001

- [x] Declarar dependencias de producción en `backend/requirements.txt`: `django`, `djangorestframework`, `psycopg[binary]`, `django-cors-headers`, `drf-spectacular`, `django-environ`.
- [x] Declarar dependencias de desarrollo en `backend/requirements-dev.txt` (incluye `-r requirements.txt`): `pytest`, `pytest-django`, `ruff`, `mypy`, `django-stubs`, `djangorestframework-stubs`, `factory-boy`, `pytest-cov`.
- [x] Fijar versiones exactas (`==`), incluidas las dependencias transitivas. Con `pip` no hay lockfile real (costo aceptado en ADR-001).

**Verificación:** instalación limpia en un entorno virtual nuevo, sin errores.

---

### T-00.2 · Configuración por entorno y rotación de secretos

**Depende de:** ADR-002 · **Requisito:** RNF-SEC-001

- [x] Crear `backend/mi_proyecto/settings/` con `base.py`, `development.py`, `production.py`, `test.py`. `DJANGO_ENV` selecciona el módulo (`mi_proyecto/bootstrap.py`).
- [x] Mover `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` a variables de entorno.
- [x] **Rotar la `SECRET_KEY`** — eliminada del código; la prueba de rotación confirma que la clave activa no es la comprometida.
- [x] ~~Crear `.env.example`~~ — descartado el 2026-09-25 por decisión de Alejandro Puerta Loaiza: el `.env` de la raíz es el único archivo de variables, compartido por backend y frontend (`frontend/my-app/next.config.ts` lo lee y expone solo las claves `NEXT_PUBLIC_*`). Las claves están documentadas en el README §2.1.
- [x] Confirmar que `.env` sigue ignorado por Git.

**Prueba (G2):** una prueba que falla si `settings.SECRET_KEY` coincide con el valor hardcodeado antiguo o si `DEBUG` es `True` bajo el entorno de producción.

**Verificación:** el proyecto arranca sin `.env` presente solo si las variables están en el entorno; falla con un mensaje claro si falta alguna obligatoria.

---

### T-00.3 · Estructura de carpetas (sin renombrado)

**Depende de:** ADR-003 (opción B: se conservan los nombres actuales)

- [x] Actualizar `manage.py`, `wsgi.py`, `asgi.py` y `DJANGO_SETTINGS_MODULE` para usar `mi_proyecto.settings.<entorno>`.
- [x] Crear `backend/apps/` y `backend/shared/` con `__init__.py`.

**Verificación:** `python manage.py check` sin errores; `npm run build` en el frontend sin errores.

---

### T-00.4 · PostgreSQL en desarrollo

**Depende de:** ADR-005 · **Requisito:** RNF-OPS-001

- [x] Usar el PostgreSQL instalado localmente por cada integrante (sin `docker-compose`).
- [x] Apuntar Django a PostgreSQL vía `DATABASE_URL` (`env.db()`); SQLite eliminado.
- [x] Ejecutar las migraciones nativas de Django sobre PostgreSQL.

**Verificación:** con PostgreSQL local en ejecución y la base creada, `python manage.py migrate` termina sin errores.

---

### T-00.5 · Django REST Framework y esquema de API

**Depende de:** T-00.1, T-00.2 · **Requisito:** RNF-MAN-002

- [x] Añadir `rest_framework`, `corsheaders` y `drf_spectacular` a `INSTALLED_APPS`.
- [x] Configurar `REST_FRAMEWORK`: autenticación por defecto (solo `SessionAuthentication` hasta cerrar ADR-007), permiso por defecto `IsAuthenticated`, paginación (`shared/pagination.py`, máximo 100), `throttling` anónimo y por usuario.
- [x] Configurar CORS con lista blanca desde `CORS_ALLOWED_ORIGINS`.
- [x] Exponer `/api/v1/schema/` y la interfaz de documentación en `/api/v1/docs/`.
- [x] Crear `/api/v1/health/` como endpoint público de estado (informa la conectividad con la base de datos; `503` si no hay conexión).

**Prueba (G2):** `GET /api/v1/health/` devuelve `200` sin autenticación; un endpoint protegido de prueba (URLconf local de la suite) rechaza al anónimo. Con `SessionAuthentication` DRF responde **`403`**, no `401`: el `401` de RNF-SEC-003 depende del mecanismo de ADR-007.

---

### T-00.6 · Suite de pruebas del backend

**Depende de:** ADR-004 · **Requisito:** RNF-CAL-001 · **Crítica para el protocolo**

- [x] Configurar el runner con el módulo de settings de prueba (`pytest.ini` → `mi_proyecto.settings.test`).
- [x] Crear `tests/unit/`, `tests/integration/`, `tests/api/`.
- [x] Instalar `factory-boy` (se usará con los primeros modelos, a partir de FASE-01).
- [x] Configurar cobertura en `.coveragerc` con `fail_under = 80`. **El umbral es provisional: no ha sido acordado formalmente.**
- [x] Escribir una prueba de humo real (no un `assert True`): el endpoint de salud responde `200`.

**Verificación:** el comando de pruebas se ejecuta, descubre la prueba y reporta verde con cobertura.

---

### T-00.7 · Calidad estática del backend

**Depende de:** T-00.1 · **Requisito:** RNF-CAL-003

- [x] Configurar `ruff` (linter y formateador) en `ruff.toml`.
- [x] Configurar `mypy` (modo estricto) con `django-stubs` y `djangorestframework-stubs` en `mypy.ini`.
- [x] Corregir lo que reporten sobre el código existente.

**Verificación:** `ruff check .`, `ruff format --check .` y `mypy .` sin errores.

---

### T-00.8 · Suite de pruebas y calidad del frontend

**Depende de:** ADR-004

- [x] Instalar y configurar `vitest` + Testing Library + `jsdom` (`vitest.config.mts`).
- [x] Escribir una prueba real de un componente existente (`app/page.tsx`).
- [x] Verificar `eslint` y añadir el script `type-check` (`next typegen && tsc --noEmit`).
- [x] Crear `lib/api-client.ts` con el cliente HTTP base, `ApiError` tipado y sus pruebas.

**Verificación:** pruebas en verde, `npm run lint` y `npm run type-check` sin errores.

---

### T-00.9 · Integración continua

**Depende de:** ADR-006 · **Requisito:** RNF-CAL-003

- [x] Workflow de GitHub Actions disparado en PR hacia `develop` (`.github/workflows/ci.yml`).
- [x] Trabajo de backend: servicio `postgres:16`, instalación, `ruff`, `mypy`, pruebas con cobertura.
- [x] Trabajo de frontend (`frontend/my-app`): instalación, `lint`, `type-check`, pruebas, `build`.
- [ ] Proteger `develop`: CI en verde obligatorio y al menos una aprobación. *(Regla documentada en `CONTRIBUTING.md`; debe aplicarla un administrador en GitHub.)*

**Verificación:** un PR de prueba dispara el workflow y este termina en verde.

---

### T-00.10 · Documentación de arranque

- [x] `README.md` raíz: requisitos previos, comandos de arranque, comandos de prueba, estructura del repositorio, enlace a `docs/`.
- [x] `CONTRIBUTING.md`: flujo Git, convención de commits, plantilla de PR con la sección de evidencia TDD.
- [x] Plantilla de PR en `.github/pull_request_template.md` con los gates del protocolo.

**Verificación de aceptación:** un integrante que no trabajó en la fase levanta el proyecto siguiendo únicamente el README.

---

## 6. Comandos de verificación de la fase

```bash
# Backend (desde backend/, con el entorno virtual activo y PostgreSQL local en ejecución)
python manage.py check
python manage.py migrate
pytest --cov
ruff check .
ruff format --check .
mypy .

# Frontend (desde frontend/my-app/)
npm run lint
npm run type-check
npm test
npm run build

# Seguridad
git grep -n "django-insecure" || echo "sin secretos hardcodeados"
```

---

## 7. Definition of Done

- [x] Los seis ADR de la tanda 1 están `[CONFIRMADO]` y registrados en §2 de `DECISIONES-ABIERTAS.md`.
- [ ] Instalación reproducible desde cero, verificada por un segundo integrante.
- [x] Ningún secreto en el repositorio; `SECRET_KEY` rotada.
- [x] `DEBUG` controlado por entorno.
- [x] PostgreSQL operativo en desarrollo; SQLite fuera del proyecto.
- [x] DRF configurado con permiso por defecto `IsAuthenticated`.
- [x] Suite de pruebas operativa y verde en ambos proyectos, con al menos una prueba real cada una.
- [x] Linter y verificación de tipos sin errores.
- [ ] CI en verde en un PR de prueba.
- [ ] `develop` protegida.
- [ ] README y CONTRIBUTING publicados. *(Redactados; se publican al integrar el PR en `develop`.)*
- [x] Estructura de carpetas alineada con `SAD.md` §4.2 y §5.2 (con los nombres conservados por ADR-003).
- [x] **Cero modelos de dominio creados** — `showmigrations` solo lista `admin`, `auth`, `contenttypes` y `sessions`.

---

## 8. Riesgos de la fase

| Riesgo | Mitigación |
|---|---|
| Diferencias de versión de PostgreSQL entre máquinas locales | Documentar PostgreSQL 16 como versión de referencia; CI usa `postgres:16` |
| En Windows, una ruta con mayúsculas distintas a las reales (`desktop` en lugar de `Desktop`) rompe `next build` | Ejecutar los comandos desde la ruta con las mayúsculas reales del sistema de archivos |
| Tentación de "avanzar" creando modelos | El DoD lo verifica explícitamente; sin ADR-008, ninguna migración de negocio |
| CI lento por levantar PostgreSQL | Usar el servicio nativo de GitHub Actions, con caché de dependencias |
| La `SECRET_KEY` vieja sigue activa en algún entorno | Rotarla es tarea explícita de T-00.2, no un comentario al margen |

---

## 9. Siguiente fase

[FASE-01 · Identidad y acceso](FASE-01-identidad-acceso.md) — requiere cerrar ADR-007, ADR-008 y ADR-009.
