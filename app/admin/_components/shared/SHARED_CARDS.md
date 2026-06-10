# Shared Admin Cards — registry

**Por qué existe (Facu 2026-06-10):** muchas cards/secciones se REPITEN entre surfaces. No
reconstruir una copia peor — desarrollar la card UNA vez, en un solo lugar, reusarla, y
mejorarla progresivamente para que TODA surface que la usa mejore junta. Este registro es la
infraestructura para SABER qué cards son compartidas sin que Facu lo tenga que decir.

**Regla operativa:**
1. Antes de construir una surface, consultá este registro: ¿la card ya existe?
2. Card genuinamente compartida → vive en `app/admin/_components/shared/`.
3. Reusá por composición (importá el componente compartido). Nunca dupliques.
4. Si creás/encontrás una card que se repite, AGREGALA acá (nombre · archivo · contrato de
   data · surfaces que la usan) en el mismo PR.
5. Mejorás la card compartida → todas las surfaces se benefician.

---

## Cards compartidas

### ClientIntelPanel
- **Archivo:** `app/admin/_components/shared/ClientIntelPanel.tsx`
- **Qué es:** intel rico de un cliente — heat, status, interest score, interacciones, talk
  time, días en funnel, revenue L365, convertido, qué le gusta, objeciones, precios que paga,
  current supplier, último resultado de llamada, contacto, key quote (extractos de
  conversaciones).
- **Contrato de data:** `{ intel: ClientIntel | null; loading: boolean }`.
  `ClientIntel` lo produce `getClientIntel(leadMasterId)` (`lib/deal/data.ts`) desde
  `v_sample_review` + `v_sample_engagement` + `florist_ecosystem` + `sample_box_status`.
  Endpoint: `GET /api/admin/deals/intel?leadMasterId=`.
- **Usado por:** Deals (selección de cliente) · Samples (expand de la card de approvals).
- **Resolver leadMasterId:** desde `v_sample_review` por `business_name` cuando la surface solo
  tiene zoho_id/nombre (ej. el cohorte FLORA).

### SurfaceStatusBanner
- **Archivo:** `app/admin/_components/SurfaceStatusBanner.tsx`
- **Qué es:** banner por-tab con objetivo + status honesto + qué mejorar + stage canónico
  (aprobado por Facu) + ideas editables (Facu/JJ).
- **Contrato:** `{ surfaceKey: string }` → lee `admin_surface_status` + `admin_surface_ideas`.
- **Usado por:** los 11 tabs de admin (supply, catalog, approvals, blocked, config, deals,
  desk, dispatch, loop, orders, samples).

---
_Mantener este archivo al día es parte del trabajo, no un extra._
