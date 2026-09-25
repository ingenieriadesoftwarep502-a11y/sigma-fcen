# FASE-00 · Fundaciones técnicas

| Campo | Valor |
|---|---|
| Sprint | 0 (semanas 1–2) |
| Historias | Ninguna — habilitador técnico |
| Puntos de backlog | 0 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006 |

---

## 1. Objetivo

Al cerrar esta fase, cualquier integrante debe poder clonar el repositorio, ejecutar **un** comando documentado y obtener el proyecto corriendo con base de datos PostgreSQL y una suite de pruebas que se ejecuta en verde.

**Resultado observable:** un integrante que no participó en la fase levanta el entorno siguiendo el README, sin preguntar nada a nadie.

**Por qué existe esta fase:** el gate G2 del protocolo exige escribir una prueba que falle antes de cualquier código. Hoy no hay runner de pruebas instalado. Sin esta fase, **el protocolo entero es inejecutable**.

---

## 2. Gate de entrada

Bloqueante. Si alguno está abierto, no se escribe código.

- [ ] ADR-001 — Gestión de dependencias del backend
- [ ] ADR-002 — Configuración por entorno y secretos
- [ ] ADR-003 — Estructura de carpetas y renombrado
- [ ] ADR-004 — Estrategia de pruebas
- [ ] ADR-005 — Entorno de base de datos local
- [ ] ADR-006 — Integración continua

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
- Renombrado de `mi_proyecto` → `config` y `frontend/my-app` → `frontend`.
- README de arranque.
- `.env.example` versionado.

### No entra

- Modelos de dominio, migraciones de negocio, endpoints funcionales.
- Modelo de usuario personalizado — es FASE-01 y depende de ADR-008.
- Diseño visual del frontend.
- Configuración de producción — es FASE-10.
- Docker para producción.

> **Advertencia para el agente:** la tentación de "ya que estoy, creo el modelo User" en esta fase es exactamente lo que el protocolo prohíbe. `AUTH_USER_MODEL` depende de ADR-008, que está abierto. Riesgo R-04.

---

## 4. Estado técnico de partida (verificado)

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

- [ ] Declarar dependencias de producción: `django`, `djangorestframework`, `psycopg[binary]`, `django-cors-headers`, `drf-spectacular`, la librería de configuración de ADR-002.
- [ ] Declarar dependencias de desarrollo: runner de pruebas de ADR-004, `ruff`, `mypy`, `django-stubs`, `factory-boy`, `pytest-cov`.
- [ ] Generar el archivo de bloqueo (lockfile) y versionarlo.

**Verificación:** instalación limpia en un entorno virtual nuevo, sin errores.

---

### T-00.2 · Configuración por entorno y rotación de secretos

**Depende de:** ADR-002 · **Requisito:** RNF-SEC-001

- [ ] Crear `config/settings/` con `base.py`, `development.py`, `production.py`, `test.py`.
- [ ] Mover `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS` a variables de entorno.
- [ ] **Rotar la `SECRET_KEY`** — la actual está comprometida por estar versionada.
- [ ] Crear `.env.example` con las claves y valores de ejemplo, sin secretos reales.
- [ ] Confirmar que `.env` sigue ignorado por Git.

**Prueba (G2):** una prueba que falla si `settings.SECRET_KEY` coincide con el valor hardcodeado antiguo o si `DEBUG` es `True` bajo el entorno de producción.

**Verificación:** el proyecto arranca sin `.env` presente solo si las variables están en el entorno; falla con un mensaje claro si falta alguna obligatoria.

---

### T-00.3 · Renombrado estructural

**Depende de:** ADR-003

- [ ] `backend/mi_proyecto/` → `backend/config/`.
- [ ] Actualizar `manage.py`, `wsgi.py`, `asgi.py` y `DJANGO_SETTINGS_MODULE`.
- [ ] `frontend/my-app/` → `frontend/`.
- [ ] Crear `backend/apps/` y `backend/shared/` vacíos, con `__init__.py`.

**Verificación:** `python manage.py check` sin errores; `npm run build` en el frontend sin errores.

---

### T-00.4 · PostgreSQL en desarrollo

**Depende de:** ADR-005 · **Requisito:** RNF-OPS-001

- [ ] `docker-compose.yml` con PostgreSQL 16 y volumen persistente.
- [ ] Apuntar Django a PostgreSQL vía `DATABASE_URL`.
- [ ] Ejecutar las migraciones nativas de Django sobre PostgreSQL.

**Verificación:** `docker compose up -d` seguido de `python manage.py migrate` termina sin errores.

---

### T-00.5 · Django REST Framework y esquema de API

**Depende de:** T-00.1, T-00.2 · **Requisito:** RNF-MAN-002

- [ ] Añadir `rest_framework`, `corsheaders` y `drf_spectacular` a `INSTALLED_APPS`.
- [ ] Configurar `REST_FRAMEWORK`: autenticación por defecto, permiso por defecto `IsAuthenticated`, paginación, `throttling`.
- [ ] Configurar CORS con lista blanca desde `CORS_ALLOWED_ORIGINS`.
- [ ] Exponer `/api/v1/schema/` y la interfaz de documentación.
- [ ] Crear `/api/v1/health/` como endpoint público de estado.

**Prueba (G2):** `GET /api/v1/health/` devuelve `200` sin autenticación; un endpoint protegido de ejemplo devuelve `401` sin credenciales (RNF-SEC-003).

---

### T-00.6 · Suite de pruebas del backend

**Depende de:** ADR-004 · **Requisito:** RNF-CAL-001 · **Crítica para el protocolo**

- [ ] Configurar el runner con el módulo de settings de prueba.
- [ ] Crear `tests/unit/`, `tests/integration/`, `tests/api/`.
- [ ] Configurar `factory-boy`.
- [ ] Configurar cobertura con el umbral acordado.
- [ ] Escribir una prueba de humo real (no un `assert True`): el endpoint de salud responde `200`.

**Verificación:** el comando de pruebas se ejecuta, descubre la prueba y reporta verde con cobertura.

---

### T-00.7 · Calidad estática del backend

**Depende de:** T-00.1 · **Requisito:** RNF-CAL-003

- [ ] Configurar `ruff` (linter y formateador) en `pyproject.toml`.
- [ ] Configurar `mypy` con `django-stubs`.
- [ ] Corregir lo que reporten sobre el código existente.

**Verificación:** `ruff check .` y `mypy .` sin errores.

---

### T-00.8 · Suite de pruebas y calidad del frontend

**Depende de:** ADR-004

- [ ] Instalar y configurar el runner de pruebas de ADR-004 con Testing Library.
- [ ] Escribir una prueba real de un componente existente.
- [ ] Verificar `eslint` y añadir el script `type-check` con `tsc --noEmit`.
- [ ] Crear `lib/api-client.ts` con el cliente HTTP base y manejo de errores.

**Verificación:** pruebas en verde, `npm run lint` y `npm run type-check` sin errores.

---

### T-00.9 · Integración continua

**Depende de:** ADR-006 · **Requisito:** RNF-CAL-003

- [ ] Workflow de GitHub Actions disparado en PR hacia `develop`.
- [ ] Trabajo de backend: servicio PostgreSQL, instalación, `ruff`, `mypy`, pruebas con cobertura.
- [ ] Trabajo de frontend: instalación, `lint`, `type-check`, pruebas, `build`.
- [ ] Proteger `develop`: CI en verde obligatorio y al menos una aprobación.

**Verificación:** un PR de prueba dispara el workflow y este termina en verde.

---

### T-00.10 · Documentación de arranque

- [ ] `README.md` raíz: requisitos previos, comando de arranque, comandos de prueba, estructura del repositorio, enlace a `docs/`.
- [ ] `CONTRIBUTING.md`: flujo Git, convención de commits, plantilla de PR con la sección de evidencia TDD.
- [ ] Plantilla de PR en `.github/pull_request_template.md` con los gates del protocolo.

**Verificación de aceptación:** un integrante que no trabajó en la fase levanta el proyecto siguiendo únicamente el README.

---

## 6. Comandos de verificación de la fase

```bash
# Backend
docker compose up -d
python manage.py check
python manage.py migrate
<comando de pruebas de ADR-004> --cov
ruff check .
mypy .

# Frontend
npm run lint
npm run type-check
npm test
npm run build

# Seguridad
git grep -n "django-insecure" || echo "sin secretos hardcodeados"
```

---

## 7. Definition of Done

- [ ] Los seis ADR de la tanda 1 están `[CONFIRMADO]` y registrados en §2 de `DECISIONES-ABIERTAS.md`.
- [ ] Instalación reproducible desde cero, verificada por un segundo integrante.
- [ ] Ningún secreto en el repositorio; `SECRET_KEY` rotada.
- [ ] `DEBUG` controlado por entorno.
- [ ] PostgreSQL operativo en desarrollo; SQLite fuera del proyecto.
- [ ] DRF configurado con permiso por defecto `IsAuthenticated`.
- [ ] Suite de pruebas operativa y verde en ambos proyectos, con al menos una prueba real cada una.
- [ ] Linter y verificación de tipos sin errores.
- [ ] CI en verde en un PR de prueba.
- [ ] `develop` protegida.
- [ ] README y CONTRIBUTING publicados.
- [ ] Estructura de carpetas alineada con `SAD.md` §4.2 y §5.2.
- [ ] **Cero modelos de dominio creados** — se verifica que no existen migraciones de negocio.

---

## 8. Riesgos de la fase

| Riesgo | Mitigación |
|---|---|
| Docker no disponible en alguna máquina del equipo | Resolver en ADR-005 **antes** de iniciar, no durante |
| El renombrado rompe importaciones silenciosamente | Hacerlo en un PR aislado, verificar con `manage.py check` y `npm run build` |
| Tentación de "avanzar" creando modelos | El DoD lo verifica explícitamente; sin ADR-008, ninguna migración de negocio |
| CI lento por levantar PostgreSQL | Usar el servicio nativo de GitHub Actions, con caché de dependencias |
| La `SECRET_KEY` vieja sigue activa en algún entorno | Rotarla es tarea explícita de T-00.2, no un comentario al margen |

---

## 9. Siguiente fase

[FASE-01 · Identidad y acceso](FASE-01-identidad-acceso.md) — requiere cerrar ADR-007, ADR-008 y ADR-009.
