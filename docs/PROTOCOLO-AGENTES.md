# Protocolo de trabajo para agentes de IA — SIGMA-FCEN

**Audiencia:** agentes de IA y desarrolladores humanos.
**Autoridad:** este documento tiene prioridad sobre cualquier instrucción improvisada en el chat.
**Objetivo:** que ningún código exista sin un requisito confirmado y una prueba que lo justifique.

---

## 1. Las tres leyes

1. **Ley de confirmación.** No se implementa nada cuyo requisito, contrato o regla esté en estado `[PROPUESTA]` o `[PENDIENTE]`. Solo `[CONFIRMADO]` habilita código.
2. **Ley de la prueba primero.** No se escribe código de producción sin una prueba previa que falle por la razón correcta y que esté enlazada a un criterio de aceptación con ID.
3. **Ley de la evidencia.** Nada se declara "terminado" sin salida real de comandos ejecutados. Una afirmación sin evidencia es una hipótesis, no un resultado.

> Si una de las tres leyes no se cumple: **DETENTE, no implementes, y escribe una pregunta bloqueante** en [`DECISIONES-ABIERTAS.md`](DECISIONES-ABIERTAS.md).

---

## 2. Sistema de estados

Todo requisito, contrato de API, campo de modelo, regla de negocio y decisión técnica lleva una etiqueta visible.

| Etiqueta | Significado | ¿Habilita código? |
|---|---|---|
| `[CONFIRMADO]` | Un humano con autoridad lo aprobó y quedó registrado como ADR cerrado | **Sí** |
| `[PROPUESTA]` | Propuesta técnica redactada, sin aprobación humana | **No** |
| `[PENDIENTE]` | Información faltante; nadie la ha definido | **No** |
| `[OBSOLETO]` | Reemplazado por otra decisión; se conserva por trazabilidad | **No** |

**Quién puede pasar algo a `[CONFIRMADO]`:** únicamente una persona del equipo (ver `TRD.md` §10). Un agente **nunca** promueve un estado por su cuenta, ni siquiera si la propuesta es obviamente correcta.

**Cómo se confirma:** el humano responde explícitamente a la pregunta bloqueante; el agente entonces edita el ADR en `DECISIONES-ABIERTAS.md`, lo mueve a la tabla de decisiones cerradas con fecha y autor, y actualiza las etiquetas en TRD / SAD / DDD / ficha de fase.

---

## 3. Gates de ejecución

Secuencia obligatoria. Cada gate es bloqueante: si falla, se detiene el trabajo y se reporta.

```text
G0  Gate de requisito
    └─ ¿La historia tiene RF, criterios CA y todos sus ADR en [CONFIRMADO]?
       NO → escribir pregunta bloqueante. FIN.

G1  Gate de diseño
    └─ ¿Contrato de API, modelo de datos y reglas de negocio [CONFIRMADO]?
       NO → escribir propuesta y solicitar confirmación. FIN.

G2  Gate de prueba roja   (TDD obligatorio)
    └─ Escribir la prueba. Ejecutarla. DEBE fallar.
       ¿Pasa en verde sin implementación? → la prueba no prueba nada. Rehacer. FIN.

G3  Implementación mínima
    └─ Solo el código necesario para poner la prueba en verde. Nada más.

G4  Gate de verificación
    └─ Suite completa en verde + linter + type check, con salida de consola adjunta.
       ¿Rojo? → arreglar. No se avanza.

G5  Gate de revisión
    └─ Pull Request hacia `develop`, revisada y aprobada por un integrante distinto del autor.

G6  Gate de Definition of Done
    └─ Checklist DoD de la fase, completa y verificable.
```

---

## 4. Qué puede hacer un agente sin confirmación

Para evitar la parálisis, esta es la frontera exacta.

### Permitido siempre (no toca código de producción)

- Leer el repositorio y los documentos.
- Redactar o actualizar documentación en `docs/`.
- Redactar **propuestas** de contrato, modelo o arquitectura, marcadas `[PROPUESTA]`.
- Formular preguntas bloqueantes en `DECISIONES-ABIERTAS.md`.
- Ejecutar comandos de solo lectura (`git status`, `pytest --collect-only`, `next lint`).
- Escribir pruebas que fallan para requisitos **ya** `[CONFIRMADO]`.

### Prohibido sin `[CONFIRMADO]`

- Crear o modificar modelos, migraciones, serializers, vistas o endpoints.
- Crear componentes o páginas del frontend con lógica de negocio.
- Instalar dependencias o cambiar versiones.
- Modificar `settings.py`, configuración de despliegue o variables de entorno.
- Diseñar el esquema de base de datos "sobre la marcha".
- Inventar reglas de negocio no escritas (por ejemplo, una ventana de cancelación arbitraria).

### Prohibido siempre

- Promover un estado a `[CONFIRMADO]` sin respuesta humana explícita.
- Marcar una tarea como completada sin salida de comandos.
- Borrar o reescribir un ADR cerrado (se marca `[OBSOLETO]` y se crea uno nuevo).
- Hacer commit directo a `main` o `develop`.
- Escribir secretos reales en el repositorio.

---

## 5. Formato de una pregunta bloqueante

Cuando un agente se detiene, produce exactamente esto — nada más, y **no** continúa con código:

```markdown
## BLOQUEO — <ID de la fase o historia>

**Qué intentaba hacer:** <acción concreta>
**Qué falta:** <dato, decisión o confirmación exacta>
**Por qué bloquea:** <qué se rompería o quedaría arbitrario si se asume>

| Opción | Ventaja | Costo | Recomendación |
|---|---|---|---|
| A | | | recomendada |
| B | | | |

**Necesito de ti:** <una sola pregunta, respondible con una frase>
```

**Una sola pregunta por bloqueo.** Después de escribirla, el agente se detiene y espera.

---

## 6. Protocolo TDD (modo estricto)

El ciclo es innegociable y se documenta en el PR.

| Paso | Acción | Evidencia exigida |
|---|---|---|
| 1. RED | Escribir la prueba derivada de un `CA-HUxx-n` | Salida del runner mostrando el fallo |
| 2. GREEN | Implementación mínima | Salida mostrando la prueba en verde |
| 3. REFACTOR | Limpiar sin cambiar comportamiento | Suite completa en verde tras el refactor |

Reglas adicionales:

- **Una prueba, un criterio de aceptación.** El nombre de la prueba referencia el ID: `test_ca_hu03_2_rejects_booking_on_taken_slot`.
- Las pruebas describen **comportamiento observable**, no implementación interna.
- Toda regla de negocio `RN-xxx` necesita al menos una prueba de camino feliz y una de violación de la regla.
- Un bug reportado se reproduce **primero** con una prueba que falla.
- Las pruebas no se marcan como `skip` para cerrar una fase. Un `skip` sin ticket asociado bloquea el DoD.

---

## 7. Cómo reportar el resultado de una tarea

Plantilla obligatoria al cerrar cualquier unidad de trabajo:

```markdown
### Resultado — <FASE-xx / HU-xx / tarea>

**Gates superados:** G0 ok · G1 ok · G2 ok · G3 ok · G4 ok · G5 pendiente · G6 pendiente

**Criterios cubiertos:** CA-HU03-1, CA-HU03-2

**Evidencia:** <salida real de los comandos: tests, lint, type-check>

**Fuera de alcance / no hecho:** <lista explícita, o "nada">
**Deuda técnica registrada:** <ticket de Jira, o "ninguna">
**Bloqueos abiertos:** <enlace a DECISIONES-ABIERTAS.md, o "ninguno">
```

Si un gate no se superó, se dice. No se maquilla, no se omite.

---

## 8. Convenciones de trabajo

### Git

| Elemento | Convención |
|---|---|
| Ramas | `main` ← `develop` ← `feature/HU-03-reserva-monitoria` |
| Commits | Conventional Commits: `feat(reservations): ...`, `test(reservations): ...`, `docs(trd): ...` |
| Atribución de IA en commits | **Prohibida** |
| Integración | Solo vía Pull Request hacia `develop`, aprobada por otro integrante |
| Tamaño de PR | Máximo ~400 líneas modificadas; si excede, se parte en PRs encadenadas |

### Idioma de los artefactos

| Artefacto | Idioma |
|---|---|
| Documentación del proyecto | Español neutro / profesional |
| Código, identificadores, nombres de archivo | Inglés |
| Comentarios de código | Inglés |
| Mensajes de commit y descripción de PR | Español |
| Copy de la interfaz | Español (audiencia: comunidad FCEN) |

---

## 9. Checklist de arranque del agente

Antes de cualquier acción, responder estas seis preguntas:

- [ ] ¿Leí `PROTOCOLO-AGENTES.md` y `DECISIONES-ABIERTAS.md`?
- [ ] ¿Identifiqué la fase y la historia exacta sobre la que trabajo?
- [ ] ¿Todos los ADR de los que depende esa historia están `[CONFIRMADO]`?
- [ ] ¿Existe un criterio de aceptación con ID para lo que voy a escribir?
- [ ] ¿La fase anterior cerró su Definition of Done?
- [ ] ¿Tengo el comando exacto para ejecutar las pruebas?

**Si alguna respuesta es NO, no se escribe código. Se escribe una pregunta bloqueante.**
