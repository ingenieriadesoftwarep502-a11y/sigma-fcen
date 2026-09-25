# FASE-07 · Repositorio académico

| Campo | Valor |
|---|---|
| Sprint | 8 (semanas 17–18) |
| Historias | HU-08 Repositorio de material académico (8 pts) |
| Puntos | 8 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-012 |
| Requisitos | RF-070 a RF-073 |
| Prioridad | 3 — **primera candidata a recorte si la velocidad real queda por debajo de lo estimado** |

---

## 1. Objetivo

Que monitores y docentes suban material de apoyo asociado a una asignatura y que los estudiantes lo consulten desde el sistema sin depender de medios externos.

**Resultado observable:** un monitor sube un PDF a "Cálculo Diferencial"; un estudiante lo encuentra y lo descarga desde la plataforma.

---

## 2. Gate de entrada

- [ ] FASE-02 cerrada (necesita asignaturas)
- [ ] **ADR-012 cerrado**: destino de almacenamiento, formatos permitidos, tamaño máximo, permisos, política de análisis de archivos

> Esta fase es independiente del núcleo de agendamiento: solo depende de FASE-02. Puede adelantarse si un sprint queda con capacidad libre, o recortarse sin afectar el producto mínimo.

---

## 3. Alcance

### Entra

- Modelo `Material` con borrado lógico.
- Carga de archivos con validación de formato y tamaño.
- Almacenamiento mediante la abstracción de Django storages, para permitir migrar de disco local a S3 sin cambiar el código de negocio.
- Sanitización de nombres de archivo.
- Listado y descarga filtrando por asignatura.
- Eliminación por el autor o un administrador.
- Pantallas de carga y de consulta del repositorio.

### No entra

- Versionado de archivos.
- Vista previa en el navegador.
- Análisis antivirus (si ADR-012 lo deja fuera de la versión 1, se registra como deuda técnica de seguridad).
- Carpetas o jerarquías dentro de una asignatura.
- Cuotas de almacenamiento por usuario.

---

## 4. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol | Respuestas |
|---|---|---|---|
| `POST` | `/api/v1/materials/` | monitor o docente | `201` · `400` formato · `413` tamaño |
| `GET` | `/api/v1/materials/?subject=` | autenticado | `200` paginado |
| `GET` | `/api/v1/materials/{id}/download/` | autenticado | `200` con `Content-Disposition` |
| `DELETE` | `/api/v1/materials/{id}/` | autor o admin | `204` · `403` |

Carga con `multipart/form-data`: `subject_id`, `title`, `description`, `file`.

---

## 5. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-07.1 | Modelo `Material` | Asignatura obligatoria y existente | RN-008.4 |
| T-07.2 | Validación de formato | Formato fuera de la lista → `400` | CA-HU08-2, RN-008.2 |
| T-07.3 | Validación de tamaño | Archivo por encima del máximo → `413` | CA-HU08-3, RN-008.3 |
| T-07.4 | Validación de tipo real | Extensión que no coincide con el contenido es rechazada | Seguridad |
| T-07.5 | Sanitización del nombre | Nombres con rutas o caracteres peligrosos se normalizan | Seguridad |
| T-07.6 | Autorización de carga | Estudiante intentando subir → `403` | RN-008.1 |
| T-07.7 | Carga válida | Archivo almacenado y consultable | CA-HU08-1 |
| T-07.8 | Listado por asignatura | Solo material de esa asignatura, paginado | CA-HU08-4 |
| T-07.9 | Descarga autenticada | Anónimo → `401` | RNF-SEC-003 |
| T-07.10 | Eliminación por el autor | Autor elimina; tercero recibe `403` | CA-HU08-5, RN-008.5 |
| T-07.11 | Borrado lógico | El registro se conserva; deja de listarse | RNF-DAT-002 |
| T-07.12 | Frontend: carga | Selección de archivo, progreso y manejo de error | — |
| T-07.13 | Frontend: repositorio | Listado por asignatura y descarga | — |

---

## 6. Criterios de aceptación cubiertos

CA-HU08-1 a CA-HU08-5

---

## 7. Verificación

```bash
<comando de pruebas> tests/ -k "material or upload" -v
<comando de pruebas> --cov=apps/materials --cov-report=term-missing
ruff check . && mypy .
```

---

## 8. Definition of Done

- [ ] ADR-012 cerrado y documentado.
- [ ] Formato y tamaño validados **en el servidor**, no solo en el navegador.
- [ ] Tipo de contenido real verificado, no solo la extensión.
- [ ] Nombres de archivo sanitizados; probado con nombres maliciosos.
- [ ] Descarga solo para usuarios autenticados.
- [ ] Almacenamiento tras la abstracción de storages, sin rutas absolutas en el código.
- [ ] Los 5 criterios de aceptación con prueba automatizada.
- [ ] Ausencia de análisis antivirus registrada como deuda técnica, si aplica.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Archivo malicioso subido por un usuario legítimo | Alto | Validación de tipo real, sanitización, `Content-Disposition`; antivirus como deuda explícita |
| Validación solo en el frontend | Alto | Prueba de servidor obligatoria en el DoD |
| Recorrido de rutas por nombre de archivo | Alto | Sanitización con prueba de nombres maliciosos |
| Almacenamiento local perdido al redesplegar | Medio | Volumen persistente, o S3 desde el inicio según ADR-012 |
| Crecimiento sin control del almacenamiento | Bajo | Cuotas registradas como deuda técnica |

---

## 10. Siguiente fase

[FASE-08 · Seguimiento docente](FASE-08-seguimiento-docente.md)
