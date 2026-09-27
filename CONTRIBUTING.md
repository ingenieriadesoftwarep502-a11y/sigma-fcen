# Guía de contribución — SIGMA-FCEN

Esta guía resume cómo se integra el trabajo. Las reglas completas están en [`docs/PROTOCOLO-AGENTES.md`](docs/PROTOCOLO-AGENTES.md), que tiene prioridad ante cualquier diferencia.

---

## 1. Antes de empezar

1. La historia o tarea tiene todos sus ADR en `[CONFIRMADO]` ([`docs/DECISIONES-ABIERTAS.md`](docs/DECISIONES-ABIERTAS.md)).
2. Existe un criterio de aceptación con ID (`CA-HUxx-n`) para lo que vas a escribir.
3. El entorno local funciona según el [`README.md`](README.md).

Si algo de esto falla, no se escribe código: se formula una pregunta bloqueante.

---

## 2. Flujo Git (Git Flow)

| Rama | Propósito | Reglas |
|---|---|---|
| `main` | Versión estable | Solo recibe merges desde `develop` en una entrega. Sin commits directos. |
| `develop` | Integración | Solo vía Pull Request. Sin commits directos. |
| `feature/<id>-<descripcion>` | Trabajo de una historia o tarea | Sale de `develop` y vuelve a `develop` por PR. |

Ejemplos: `feature/HU-03-reserva-monitoria`, `feature/fase-00-fundaciones`.

```bash
git switch develop
git pull
git switch -c feature/HU-03-reserva-monitoria
```

### Protección obligatoria de `develop`

Configurada en GitHub (*Settings → Branches → Branch protection rules*) para la rama `develop` desde el 2026-09-27:

- [x] Exigir Pull Request antes de integrar.
- [x] Exigir **al menos 1 aprobación** de un integrante distinto del autor.
- [x] Exigir que los checks de CI estén en verde: `Backend (ruff, mypy, pytest)` y `Frontend (eslint, tsc, vitest, build)`.
- [x] Exigir que la rama esté actualizada con `develop` antes de integrar.
- [x] Bloquear *force push* y borrado de la rama.

Los administradores pueden saltarse la regla (`enforce_admins` desactivado); hacerlo es una excepción y debe justificarse en el PR.

Se recomienda la misma protección para `main`.

---

## 3. Convención de commits

Se usa [Conventional Commits](https://www.conventionalcommits.org/es/). Mensajes en español; alcance en inglés, igual que el código.

```text
<tipo>(<alcance>): <descripción en imperativo>
```

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un error |
| `test` | Pruebas nuevas o corregidas |
| `refactor` | Cambio interno sin alterar comportamiento |
| `docs` | Documentación |
| `chore` | Dependencias, configuración, tareas de mantenimiento |
| `ci` | Integración continua |

Ejemplos:

```text
test(reservations): agrega prueba de reserva sobre franja ocupada
feat(reservations): impide reservar una franja ya confirmada
docs(fase-00): registra decisiones de la tanda 1
```

La atribución de IA en commits está **prohibida**.

---

## 4. TDD obligatorio

Cada cambio de comportamiento sigue el ciclo del protocolo:

1. **RED:** escribir la prueba derivada del criterio de aceptación y ejecutarla. Debe fallar por la razón correcta.
2. **GREEN:** implementación mínima para ponerla en verde.
3. **REFACTOR:** limpiar sin cambiar comportamiento, con la suite completa en verde.

La salida de consola de RED y GREEN se adjunta en el PR.

---

## 5. Pull Requests

- Destino: siempre `develop`.
- Tamaño: máximo ~400 líneas modificadas; si se excede, se divide en PRs encadenadas.
- La plantilla [`.github/pull_request_template.md`](.github/pull_request_template.md) se completa entera: gates, criterios cubiertos y evidencia TDD.
- Antes de pedir revisión, ejecuta localmente la verificación completa:

```bash
# backend/
pytest --cov && ruff check . && ruff format --check . && mypy .

# frontend/my-app/
npm run lint && npm run type-check && npm test && npm run build
```

- La PR se integra solo con CI en verde y la aprobación de otro integrante (gate G5).
