## Resumen

<!-- Qué cambia y por qué, en dos o tres líneas. -->

**Fase / historia:** <!-- p. ej. FASE-04 / HU-03 -->
**Criterios de aceptación cubiertos:** <!-- p. ej. CA-HU03-1, CA-HU03-2 -->
**ADR relacionados (todos `[CONFIRMADO]`):** <!-- p. ej. ADR-010, ADR-011 -->

---

## Gates del protocolo

- [ ] **G0 · Requisito:** la historia tiene RF, criterios con ID y todos sus ADR en `[CONFIRMADO]`.
- [ ] **G1 · Diseño:** contrato de API, modelo de datos y reglas de negocio en `[CONFIRMADO]`.
- [ ] **G2 · Prueba roja:** cada prueba nueva se ejecutó y falló antes de implementar.
- [ ] **G3 · Implementación mínima:** solo el código necesario para poner las pruebas en verde.
- [ ] **G4 · Verificación:** suite completa, linter y verificación de tipos en verde (salida abajo).
- [ ] **G5 · Revisión:** aprobada por un integrante distinto del autor.
- [ ] **G6 · Definition of Done:** checklist DoD de la fase actualizado.

---

## Evidencia TDD

### RED

```text
<!-- Salida del runner mostrando el fallo de cada prueba nueva. -->
```

### GREEN

```text
<!-- Salida del runner con las mismas pruebas en verde. -->
```

---

## Verificación (G4)

```text
<!-- backend/:  pytest --cov · ruff check . · ruff format --check . · mypy . -->
<!-- frontend/my-app/:  npm run lint · npm run type-check · npm test · npm run build -->
```

---

## Cierre

**Fuera de alcance / no hecho:** <!-- lista explícita, o "nada" -->
**Deuda técnica registrada:** <!-- ticket de Jira, o "ninguna" -->
**Bloqueos abiertos:** <!-- enlace a docs/DECISIONES-ABIERTAS.md, o "ninguno" -->
