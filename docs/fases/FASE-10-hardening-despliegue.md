# FASE-10 · Endurecimiento y despliegue

| Campo | Valor |
|---|---|
| Sprint | 9 (semanas 19–20) |
| Historias | Ninguna — fase de cierre y calidad |
| Puntos | 0 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-014, ADR-015 |
| Requisitos | RNF-SEC-\*, RNF-OBS-001, RNF-ACC-001, RNF-OPS-001, RNF-INT-001 |

---

## 1. Objetivo

Llevar el sistema de "funciona en la máquina del equipo" a "funciona en producción, es seguro, observable y sostenible".

**Resultado observable:** el sistema está desplegado, accesible por HTTPS, sin secretos expuestos, con registro de errores, respaldo de base de datos y documentación suficiente para que otra persona lo mantenga.

---

## 2. Gate de entrada

- [ ] FASE-01 a FASE-09 cerradas con sus DoD
- [ ] **ADR-014 cerrado** — proveedor y estrategia de despliegue
- [ ] **ADR-015 resuelto** — integración institucional confirmada o declarada fuera de alcance por escrito

> Si no hay respuesta de la Dirección de Tecnología, ADR-015 se cierra como "fuera de alcance de la versión 1" con esa justificación explícita. Un ADR sin respuesta **no** se deja abierto indefinidamente: se cierra con una decisión documentada.

---

## 3. Alcance

### Entra

- Configuración de producción endurecida.
- Despliegue de backend, frontend y base de datos.
- HTTPS y cabeceras de seguridad.
- Registro estructurado de errores con identificador de correlación.
- Respaldo automático de base de datos y prueba de restauración.
- Auditoría de accesibilidad de los flujos críticos.
- Revisión de rendimiento con datos realistas.
- Documentación operativa y manual de usuario por rol.
- Cierre de la deuda técnica crítica acumulada.

### No entra

- Funcionalidad nueva. **Esta fase no agrega historias.**
- Optimizaciones sin medición previa.
- Migración a otra infraestructura.

---

## 4. Plan de trabajo

### 4.1 Seguridad

| # | Tarea | Verificación |
|---|---|---|
| T-10.1 | `DEBUG = False` en producción, con `ALLOWED_HOSTS` explícito | Revisión de configuración desplegada |
| T-10.2 | HTTPS obligatorio: `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, cookies `Secure` | `python manage.py check --deploy` sin advertencias |
| T-10.3 | Cabeceras de seguridad: CSP, `X-Content-Type-Options`, `Referrer-Policy` | Auditoría con herramienta de cabeceras |
| T-10.4 | CORS restringido a los orígenes reales de producción | Prueba desde un origen no permitido |
| T-10.5 | Limitación de tasa en autenticación y reservas | Prueba de superación del límite |
| T-10.6 | Rotación final de secretos de producción | Registro de rotación documentado |
| T-10.7 | Revisión de dependencias vulnerables | `pip-audit` y `npm audit` sin vulnerabilidades altas |
| T-10.8 | Revisión de permisos endpoint por endpoint | Matriz rol × endpoint completa y probada |

### 4.2 Observabilidad

| # | Tarea | Verificación |
|---|---|---|
| T-10.9 | Registro estructurado en JSON con identificador de correlación | Un error produce una entrada rastreable |
| T-10.10 | Captura centralizada de errores | Un error provocado a propósito aparece en el panel |
| T-10.11 | Endpoint de salud con verificación de base de datos | `/api/v1/health/` refleja el estado real |

### 4.3 Datos

| # | Tarea | Verificación |
|---|---|---|
| T-10.12 | Respaldo automático diario | Respaldo generado y verificado |
| T-10.13 | **Prueba de restauración** | Restaurar en un entorno limpio y confirmar integridad |
| T-10.14 | Revisión de índices con datos realistas | `EXPLAIN ANALYZE` sobre las consultas principales |

> Un respaldo que nunca se restauró no es un respaldo. T-10.13 es obligatoria.

### 4.4 Calidad de experiencia

| # | Tarea | Verificación |
|---|---|---|
| T-10.15 | Auditoría de accesibilidad de flujos críticos | Lighthouse con contraste AA y navegación por teclado |
| T-10.16 | Responsividad desde 360 px | Verificación documentada en tres tamaños |
| T-10.17 | Revisión de mensajes de error en español, sin trazas técnicas | Revisión de la interfaz completa |
| T-10.18 | Pruebas extremo a extremo de los flujos críticos | Reservar y cancelar, en verde |

### 4.5 Despliegue

| # | Tarea | Verificación |
|---|---|---|
| T-10.19 | Aprovisionamiento según ADR-014 | Entorno creado y accesible |
| T-10.20 | Despliegue automatizado desde `main` | Un despliegue completo ejecutado con éxito |
| T-10.21 | Migraciones aplicadas de forma controlada | Registro de migración en producción |
| T-10.22 | Plan de reversión documentado y probado | Reversión ejecutada en un entorno de prueba |

### 4.6 Documentación y cierre

| # | Tarea | Verificación |
|---|---|---|
| T-10.23 | Manual de usuario por rol | Cuatro guías breves, una por rol |
| T-10.24 | Documentación operativa: despliegue, respaldo, incidentes | Otra persona puede operar el sistema siguiéndola |
| T-10.25 | Actualización final de TRD, SAD, DDD | Estados finales reflejados |
| T-10.26 | Cierre de deuda técnica crítica | Tablero de Jira sin deuda crítica abierta |
| T-10.27 | Retrospectiva final del proyecto | Documento de lecciones aprendidas |

---

## 5. Verificación de la fase

```bash
python manage.py check --deploy
pip-audit
npm audit --audit-level=high
<comando de pruebas> --cov --cov-fail-under=<umbral>
npx playwright test
npx lighthouse <url> --only-categories=accessibility,performance
```

---

## 6. Definition of Done

- [ ] ADR-014 cerrado; ADR-015 cerrado o declarado fuera de alcance por escrito.
- [ ] `python manage.py check --deploy` sin advertencias.
- [ ] HTTPS activo con cabeceras de seguridad verificadas.
- [ ] Sin vulnerabilidades altas en dependencias.
- [ ] Matriz completa rol × endpoint, probada.
- [ ] Registro de errores operativo con identificador de correlación.
- [ ] **Respaldo restaurado con éxito al menos una vez.**
- [ ] Accesibilidad AA en flujos críticos.
- [ ] Pruebas extremo a extremo en verde.
- [ ] Despliegue automatizado funcionando; reversión probada.
- [ ] Documentación de usuario y operación publicada.
- [ ] Deuda técnica crítica cerrada; el resto registrada con prioridad.
- [ ] Retrospectiva final documentada.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fase comprimida por retrasos previos | Reservar el sprint completo; si hay que recortar, se recorta alcance funcional en fases anteriores, no el endurecimiento |
| Respaldo configurado pero nunca probado | T-10.13 obligatoria en el DoD |
| Secretos de desarrollo llegando a producción | Rotación final documentada en T-10.6 |
| ADR-015 sin respuesta institucional | Se cierra como fuera de alcance con justificación escrita |
| Configuración de producción divergente del código | `check --deploy` en el pipeline de despliegue |

---

## 8. Cierre del proyecto

Al terminar esta fase, el sistema está en producción y documentado. Las historias recortadas por capacidad (candidatas: HU-08, parte de HU-10, HU-12) quedan registradas en el backlog como alcance de una versión 2, con su justificación.

**Entregables finales:**

| Entregable | Ubicación |
|---|---|
| Sistema desplegado | Según ADR-014 |
| Código fuente | Repositorio, rama `main` |
| Documentación técnica | `docs/` |
| Manual de usuario | `docs/manual/` |
| Registro de decisiones | `docs/DECISIONES-ABIERTAS.md`, sección de decisiones cerradas |
| Backlog residual | Jira |
| Lecciones aprendidas | Documento de retrospectiva final |
