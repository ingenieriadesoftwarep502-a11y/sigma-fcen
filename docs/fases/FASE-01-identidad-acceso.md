# FASE-01 · Identidad y acceso

| Campo | Valor |
|---|---|
| Sprints | 1 y 2 (semanas 3–6) |
| Historias | HU-01 Registro (5 pts) · HU-11 Gestión de usuarios y roles (8 pts) |
| Puntos | 13 |
| Estado | **En curso** — T-01.1 a T-01.15 implementadas (2026-09-28); pendiente T-01.16 (administración de usuarios en el frontend) y el cierre de la DoD |
| ADR bloqueantes | Ninguno (ADR-007, ADR-008 y ADR-009 cerrados el 2026-09-27) |
| Requisitos | RF-010 a RF-014, RF-020, RF-021, RF-025 |

---

## 1. Objetivo

Que una persona pueda registrarse, autenticarse y acceder únicamente a lo que su rol permite; y que un administrador pueda gestionar el ciclo de vida completo de las cuentas.

**Resultado observable:** un estudiante se registra, inicia sesión y recibe `403` al intentar un endpoint de administrador. Un administrador desactiva esa cuenta y las credenciales dejan de funcionar de inmediato.

---

## 2. Gate de entrada

- [x] FASE-00 cerrada con su DoD completa *(2026-09-27)*
- [x] ADR-007 — Mecanismo de autenticación: JWT en cookies `HttpOnly` *(2026-09-27)*
- [x] ADR-008 — Modelo de usuario y representación de roles: `User` + `UserRole` N:M *(2026-09-27)*
- [x] ADR-009 — Política de registro: `@unal.edu.co`, auto-registro como Estudiante, sin verificación por correo *(2026-09-27)*

> **La decisión más cara del proyecto está aquí.** `AUTH_USER_MODEL` debe definirse en la **primera migración**. Cambiarlo después obliga a recrear la base de datos. Riesgo R-04 del TRD. Si ADR-008 no está cerrado, **no se ejecuta `makemigrations`**.

---

## 3. Alcance

### Entra

- Modelo `User` personalizado con `email` como identificador de acceso.
- Roles múltiples y simultáneos mediante `UserRole` (ADR-008).
- Registro, inicio y cierre de sesión, renovación de credenciales.
- Endpoint de perfil propio.
- Clases de permiso por rol, reutilizables.
- Gestión administrativa de usuarios: crear, editar, activar, desactivar, asignar roles.
- Auditoría de operaciones sobre usuarios.
- Pantallas de inicio de sesión, registro y administración de usuarios.
- Protección de rutas del frontend por rol.

### No entra

- Inicio de sesión único institucional (ADR-015, fuera de alcance de la versión 1).
- Recuperación de contraseña — ADR-009 descarta SMTP en v1; se traslada a FASE-10.
- Asignaturas y asignaciones de monitoría — es FASE-02.

---

## 4. Contratos · `[CONFIRMADO]` (Nicolás García Orozco, 2026-09-27)

| Método | Ruta | Rol | Respuesta esperada |
|---|---|---|---|
| `POST` | `/api/v1/auth/register/` | público | `201` con usuario creado |
| `POST` | `/api/v1/auth/login/` | público | `200`, JWT de acceso y de refresco en cookies `HttpOnly` (ADR-007) |
| `POST` | `/api/v1/auth/logout/` | autenticado | `204` |
| `POST` | `/api/v1/auth/refresh/` | autenticado | `200` |
| `GET` | `/api/v1/users/me/` | autenticado | `200` con perfil y roles |
| `GET` | `/api/v1/users/` | admin | `200` paginado |
| `POST` | `/api/v1/users/` | admin | `201` |
| `GET/PATCH` | `/api/v1/users/{id}/` | admin | `200` |
| `POST` | `/api/v1/users/{id}/deactivate/` | admin | `200` |
| `POST` | `/api/v1/users/{id}/roles/` | admin | `200` |

**Modelo:** ver [`../DDD.md`](../DDD.md) §4.1. `User` + `UserRole` N:M (ADR-008).

---

## 5. Plan de trabajo TDD

Cada tarea empieza por la prueba. Si la prueba pasa antes de implementar, está mal escrita.

| # | Tarea | Prueba primero (G2) | Criterios |
|---|---|---|---|
| T-01.1 | Modelo `User` personalizado | Crear usuario con email; email duplicado falla | RN-001.1 |
| T-01.2 | Roles N:M con `UserRole` (ADR-008) | Asignar rol y comprobarlo; rol duplicado falla | RN-002 |
| T-01.3 | Primera migración | Migración aplica en base limpia; `AUTH_USER_MODEL` apunta al modelo propio | — |
| T-01.4 | Endpoint de registro | Registro válido → `201`; email repetido → `400` | CA-HU01-1, CA-HU01-2 |
| T-01.5 | Validación de dominio institucional | Correo fuera de `@unal.edu.co` → `400` | CA-HU01-3 |
| T-01.6 | Política de contraseña | Contraseña débil → `400` con el detalle de la regla | CA-HU01-4 |
| T-01.7 | Inicio de sesión y emisión de credencial | Credenciales válidas → `200`; inválidas → `401` | — |
| T-01.8 | Usuario inactivo no autentica | Cuenta desactivada → `401` | RN-002.4, CA-HU11-2 |
| T-01.9 | Endpoint de perfil propio | Devuelve identidad y roles del usuario autenticado | CA-HU01-5 |
| T-01.10 | Clases de permiso por rol | Cada rol recibe `403` en endpoints ajenos | RNF-SEC-004, CA-HU11-4 |
| T-01.11 | Gestión administrativa de usuarios | Admin crea usuario activo que puede autenticarse | CA-HU11-1 |
| T-01.12 | Desactivación con impacto | Desactivar usuario con reservas futuras informa el impacto | CA-HU11-3 |
| T-01.13 | Auditoría | Toda operación de gestión deja registro con actor y acción | CA-HU11-5 |
| T-01.14 | Frontend: inicio de sesión y registro | Formularios, validación y manejo de error de API | — |
| T-01.15 | Frontend: protección de rutas | Ruta de administrador redirige a un rol no autorizado | — |
| T-01.16 | Frontend: administración de usuarios | Listado, alta, edición y desactivación | — |

> **T-01.12 depende de FASE-04.** Mientras no existan reservas, la comprobación de impacto se implementa contra una interfaz vacía y se completa en FASE-04. Debe quedar registrado como deuda técnica en Jira.

---

## 6. Criterios de aceptación cubiertos

CA-HU01-1 a CA-HU01-5 · CA-HU11-1 a CA-HU11-5

---

## 7. Verificación

```bash
<comando de pruebas> tests/ -k "auth or user or role" -v
<comando de pruebas> --cov=apps/accounts --cov-report=term-missing
ruff check . && mypy .
npm test && npm run type-check
```

**Comprobación manual obligatoria:** intentar acceder a `/api/v1/users/` con un usuario de rol estudiante y confirmar `403`.

---

## 8. Definition of Done

- [x] ADR-007, ADR-008 y ADR-009 cerrados antes de la primera migración. *(2026-09-27)*
- [x] `AUTH_USER_MODEL` definido en la migración inicial. *(`accounts/0001_initial` crea `User`; 2026-09-28)*
- [x] Los 10 criterios de aceptación tienen prueba automatizada. *(CA-HU01-1 a 5 y CA-HU11-1 a 5 referenciados en `backend/tests`; 2026-09-28)*
- [x] Cada endpoint tiene prueba de `401` sin autenticación y `403` por rol incorrecto. *(`test_user_admin.py`, `test_user_deactivation.py`, `test_role_permissions.py`; 2026-09-28)*
- [x] Cobertura de `apps/accounts` por encima del umbral. *(98 % frente a 80 %; 2026-09-28)*
- [x] Ninguna contraseña ni credencial en los registros de log. *(`test_auth_session.py` con `caplog`; 2026-09-28)*
- [x] Esquema OpenAPI actualizado con los endpoints de esta fase. *(`backend/schema/openapi.yaml` con prueba de vigencia; 2026-09-28)*
- [x] Tipos del frontend generados desde el esquema. *(`frontend/my-app/types/api.d.ts`; 2026-09-28)*
- [ ] Documentación actualizada: TRD (estados), DDD (modelo final), SAD (permisos).
- [ ] PRs revisadas y aprobadas; CI en verde. *(CI en verde en el PR #15; falta la revisión y aprobación)*
- [ ] T-01.16 — administración de usuarios en el frontend.
- [ ] Deuda técnica de T-01.12 (impacto sobre reservas futuras hasta FASE-04) registrada en Jira.
- [x] Comprobación manual: estudiante en `/api/v1/users/` recibe `403` y sin sesión `401`. *(2026-09-28)*

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Migración de `AUTH_USER_MODEL` ejecutada antes de cerrar ADR-008 | Gate de entrada bloqueante; el DoD lo verifica |
| Autorización implementada solo en el frontend | Prueba obligatoria de `403` por endpoint y rol (RNF-SEC-004) |
| Credenciales filtradas en logs | Revisión de configuración de logging en el PR |
| Roles múltiples subestimados | ADR-008 pregunta explícitamente por el caso estudiante-monitor |
| T-01.12 bloqueada por ausencia de reservas | Implementar contra interfaz y registrar deuda técnica |

---

## 10. Siguiente fase

[FASE-02 · Catálogo académico](FASE-02-catalogo-academico.md)
