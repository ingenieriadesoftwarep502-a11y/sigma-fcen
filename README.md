# SIGMA-FCEN

Sistema de gestión de monitorías académicas de la Facultad de Ciencias Exactas y Naturales.

- **Backend:** Django 5.2 + Django REST Framework (`backend/`)
- **Frontend:** Next.js 16 + React 19 + TypeScript (`frontend/my-app/`)
- **Base de datos:** PostgreSQL 16

La documentación del proyecto (requisitos, arquitectura, fases y decisiones) está en [`docs/`](docs/README.md). Antes de escribir código, lee [`docs/PROTOCOLO-AGENTES.md`](docs/PROTOCOLO-AGENTES.md).

---

## 1. Requisitos previos

| Herramienta | Versión | Notas |
|---|---|---|
| Python | 3.11 | `python --version` |
| Node.js | 24 | Incluye `npm` 11 |
| PostgreSQL | 16 (referencia) | Instalado localmente (ADR-005). No se usa Docker. |
| Git | reciente | Flujo Git Flow, ver [`CONTRIBUTING.md`](CONTRIBUTING.md) |

El usuario de PostgreSQL que uses debe poder **crear bases de datos** (`CREATEDB`): la suite de pruebas crea y elimina `test_<nombre_de_tu_base>` en cada ejecución.

---

## 2. Configuración inicial

### 2.1 Variables de entorno

El proyecto usa **un único archivo `.env`, en la raíz del repositorio**, compartido por backend y frontend. No se crean otros archivos `.env` (ni `.env.local`, ni `.env.example`, ni uno por proyecto). Nunca se versiona.

Créalo en la raíz con estas claves:

| Variable | Uso |
|---|---|
| `DJANGO_ENV` | `development`, `production` o `test`. Selecciona el módulo de settings. |
| `SECRET_KEY` | Obligatoria. Genera una propia (comando abajo). |
| `DEBUG` | `True` en desarrollo. En producción siempre es `False`, sin importar este valor. |
| `ALLOWED_HOSTS` | Lista separada por comas. Obligatoria en producción. |
| `DATABASE_URL` | Obligatoria. `postgres://USUARIO:CLAVE@localhost:5432/NOMBRE_BD` |
| `CORS_ALLOWED_ORIGINS` | Orígenes autorizados a llamar la API, p. ej. `http://localhost:3000`. |
| `NEXT_PUBLIC_API_URL` | URL base de la API para el frontend, p. ej. `http://localhost:8000/api/v1`. |
| `COOKIE_SAMESITE` | Política `SameSite` de las cookies de sesión y CSRF (`Lax` por defecto). |

Generar una `SECRET_KEY` nueva:

```bash
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```

Si falta una variable obligatoria, Django se detiene con un error `ImproperlyConfigured` que nombra la variable.

### 2.2 Base de datos

Crea la base de datos indicada en `DATABASE_URL` (una sola vez):

```bash
createdb -U <usuario> <nombre_bd>
```

### 2.3 Backend

**Windows (PowerShell):**

```powershell
cd backend
py -3.11 -m venv .venv   # usa 3.11 aunque tengas otra versión por defecto
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver
```

**Linux / macOS:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver
```

**Datos semilla del catálogo (opcional, solo desarrollo):** `python manage.py seed_catalog` crea seis departamentos de la FCEN (MAT, FIS, QUI, BIO, GEO, EST), 42 asignaturas de ejemplo y los períodos `2026-1` y `2026-2`. Es idempotente: se puede repetir sin duplicar datos ni sobrescribir cambios hechos por un administrador. No crea personas, cursos ni asignaciones de monitores.

Comprobación: `http://localhost:8000/api/v1/health/` responde `{"status": "ok", "database": "ok"}`. La documentación de la API está en `http://localhost:8000/api/v1/docs/`.

### 2.4 Frontend

El frontend lee el mismo `.env` de la raíz (`frontend/my-app/next.config.ts`). Solo toma las claves con prefijo `NEXT_PUBLIC_`; los secretos del backend (`SECRET_KEY`, `DATABASE_URL`, ...) nunca llegan al navegador. Si cambias el `.env`, reinicia `npm run dev`.

```bash
cd frontend/my-app
npm ci
npm run dev
```

La aplicación queda en `http://localhost:3000`.

> **Windows:** ejecuta los comandos desde la ruta con las mayúsculas reales del sistema de archivos (por ejemplo `C:\Users\<usuario>\Desktop\...`, no `...\desktop\...`). Una diferencia de mayúsculas hace que `next build` falle con `Invariant: Expected workStore to be initialized`.

---

## 3. Pruebas y calidad

### Backend (desde `backend/`, con el entorno virtual activo)

```bash
pytest --cov            # pruebas con cobertura (umbral: 80 %)
ruff check .            # linter
ruff format --check .   # formato
mypy .                  # verificación de tipos
python manage.py check  # verificación de Django
```

### Frontend (desde `frontend/my-app/`)

```bash
npm run lint         # ESLint
npm run type-check   # tipos de rutas de Next.js + tsc --noEmit
npm test             # Vitest (una ejecución)
npm run build        # compilación de producción
```

La misma verificación corre en GitHub Actions en cada PR hacia `develop` (`.github/workflows/ci.yml`).

---

## 4. Estructura del repositorio

```text
sigma-fcen/
├── .github/
│   ├── workflows/ci.yml             # CI en cada PR hacia develop
│   └── pull_request_template.md
├── backend/
│   ├── mi_proyecto/                 # configuración del proyecto Django
│   │   ├── settings/                # base, development, production, test
│   │   ├── bootstrap.py             # DJANGO_ENV → módulo de settings
│   │   ├── health.py                # GET /api/v1/health/
│   │   └── urls.py
│   ├── apps/                        # apps de dominio (desde FASE-01)
│   ├── shared/                      # código transversal (paginación, permisos, ...)
│   ├── tests/                       # unit/, integration/, api/
│   ├── requirements.txt             # dependencias de producción (fijadas)
│   ├── requirements-dev.txt         # herramientas de desarrollo y CI
│   ├── pytest.ini · .coveragerc · ruff.toml · mypy.ini
│   └── manage.py
├── frontend/my-app/
│   ├── app/                         # rutas de Next.js (App Router)
│   ├── lib/api-client.ts            # cliente HTTP único de la API
│   ├── tests/                       # pruebas de Vitest
│   └── vitest.config.mts
├── docs/                            # TRD, SAD, DDD, fases y decisiones
├── .env                             # ÚNICO archivo de variables (backend y frontend), no versionado
├── CONTRIBUTING.md
└── README.md
```

---

## 5. Documentación

| Documento | Contenido |
|---|---|
| [`docs/README.md`](docs/README.md) | Índice y estado del proyecto |
| [`docs/PROTOCOLO-AGENTES.md`](docs/PROTOCOLO-AGENTES.md) | Reglas de trabajo, gates y TDD |
| [`docs/DECISIONES-ABIERTAS.md`](docs/DECISIONES-ABIERTAS.md) | Registro de decisiones (ADR) |
| [`docs/fases/`](docs/fases/README.md) | Plan de trabajo por fase |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Flujo Git, commits y Pull Requests |
