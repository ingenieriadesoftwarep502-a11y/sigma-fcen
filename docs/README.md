# Documentación SIGMA-FCEN

Sistema Integral de Gestión de Monitorías Académicas — Facultad de Ciencias Exactas y Naturales.

Esta carpeta es la **única fuente de verdad** para planificar, implementar y verificar el sistema.
Todo agente de IA y todo integrante humano debe leer primero [`PROTOCOLO-AGENTES.md`](PROTOCOLO-AGENTES.md).

---

## Regla número uno

> **Ningún agente escribe código de producción si el requisito no está `[CONFIRMADO]` y si no existe antes una prueba que falle.**

Esto no es una recomendación. Es un gate bloqueante descrito en [`PROTOCOLO-AGENTES.md`](PROTOCOLO-AGENTES.md).

---

## Mapa de documentos

| Documento | Responde a | Léelo cuando |
|---|---|---|
| [`PROTOCOLO-AGENTES.md`](PROTOCOLO-AGENTES.md) | ¿Qué puedo hacer y qué me bloquea? | **Siempre, antes de cualquier acción** |
| [`DECISIONES-ABIERTAS.md`](DECISIONES-ABIERTAS.md) | ¿Esto ya está decidido por un humano? | Antes de implementar cualquier cosa |
| [`TRD.md`](TRD.md) | ¿Qué debe hacer el sistema? (requisitos) | Al definir alcance o criterios de aceptación |
| [`SAD.md`](SAD.md) | ¿Cómo se estructura el sistema? (arquitectura) | Al decidir dónde vive un cambio |
| [`DDD.md`](DDD.md) | ¿Cuál es el lenguaje y el modelo del negocio? | Al modelar entidades, reglas e invariantes |
| [`fases/`](fases/) | ¿Qué construyo ahora y con qué orden? | Al iniciar cualquier sprint o tarea |

---

## Orden de lectura recomendado

```text
1. PROTOCOLO-AGENTES.md   → cómo se trabaja (gates, estados, TDD)
2. DECISIONES-ABIERTAS.md → qué está confirmado y qué bloquea
3. TRD.md                 → qué se construye
4. DDD.md                 → con qué lenguaje y reglas de negocio
5. SAD.md                 → con qué estructura técnica
6. fases/README.md        → en qué orden y en qué sprint
7. fases/FASE-XX-*.md     → la fase concreta que toca ahora
```

---

## Estado actual del proyecto (verificado el 2026-09-24)

| Componente | Estado real | Evidencia |
|---|---|---|
| Backend Django | `mi_proyecto` scaffold, **sin apps, sin DRF** | `backend/mi_proyecto/settings.py` |
| Gestión de dependencias Python | **Inexistente** (no hay `requirements.txt` ni `pyproject.toml`) | `backend/` |
| Configuración por entorno | **No aplicada**: `SECRET_KEY` y `DEBUG` hardcodeados | `backend/mi_proyecto/settings.py:23,27` |
| Base de datos | SQLite por defecto; PostgreSQL **no configurado** | `backend/mi_proyecto/settings.py` |
| Frontend Next.js | Scaffold `create-next-app` en `frontend/my-app` | `frontend/my-app/package.json` |
| Pruebas | **Ninguna suite configurada** en backend ni frontend | — |
| CI/CD | **Inexistente** | — |

> Conclusión: el proyecto está en **Fase 0**. Ninguna historia de usuario puede iniciarse antes de cerrar [`fases/FASE-00-fundaciones.md`](fases/FASE-00-fundaciones.md).

---

## Trazabilidad

Cada elemento tiene un identificador estable. Nunca los renumeres; si algo se descarta, márcalo `OBSOLETO` y conserva el ID.

| Prefijo | Significado | Vive en |
|---|---|---|
| `HU-xx` | Historia de usuario | `TRD.md` §6 |
| `RF-xxx` | Requisito funcional | `TRD.md` §4 |
| `RNF-xxx` | Requisito no funcional | `TRD.md` §5 |
| `RN-xxx` | Regla de negocio / invariante | `DDD.md` §5 |
| `ADR-xxx` | Decisión de arquitectura | `DECISIONES-ABIERTAS.md` |
| `FASE-xx` | Fase de entrega | `fases/` |
| `CA-HUxx-n` | Criterio de aceptación | ficha de fase |

---

## Siguiente paso

Ir a [`fases/README.md`](fases/README.md) y revisar el gate de entrada de `FASE-00`.
