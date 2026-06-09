// DealBuilderClient -- orchestrates the Deal Builder. LEFT build steps, RIGHT sticky
// price+approval rail. Mirrors the approved mockup /mockups/deal-builder.
// State: selected client (+ intel), deal lines, packing, price; fetches intel on
// select; builds a DealDraft and POSTs to /api/admin/deals/save.
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useMemo, useState } from 'react';
import type { BoxType, CatalogVariety, ClientIntel, ClientLite, DealDraft, DealLineInput } from '@/lib/deal/types';
import { GPM_FLOOR } from '@/lib/deal/types';
import ClientPicker, { type NewClientSnapshot } from './ClientPicker';
import ClientIntelPanel from './ClientIntelPanel';
import VarietyLines from './VarietyLines';
import Packing from './Packing';
import PriceRail from './PriceRail';
import ApprovalBar, { type SaveState } from './ApprovalBar';
import VarietyUpsert from '@/app/admin/_components/editors/VarietyUpsert';
import BoxUpsert from '@/app/admin/_components/editors/BoxUpsert';
import NewVarietyLineCapture, { type NewVarietyLine } from './NewVarietyLineCapture';
import type { DealLineVM, LineDisposition } from './types';

function newId() {
  return 'l_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

export default function DealBuilderClient({
  initialClients,
  boxTypes: initialBoxTypes,
  minGpm = GPM_FLOOR,
}: {
  initialClients: ClientLite[];
  boxTypes: BoxType[];
  minGpm?: number;
}) {
  // --- Client state -----------------------------------------------------------
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [newClient, setNewClient] = useState<NewClientSnapshot | null>(null);
  const [intel, setIntel] = useState<ClientIntel | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);

  // --- Catalog / boxes (server-provided; new boxes go to the approval queue) ---
  const boxTypes = initialBoxTypes;

  // --- Deal lines + price -----------------------------------------------------
  const [lines, setLines] = useState<DealLineVM[]>([]);
  const [price, setPrice] = useState(0);
  const [priceTouched, setPriceTouched] = useState(false);

  // --- Deal meta --------------------------------------------------------------
  const [dealType, setDealType] = useState<'one_off' | 'standing_order'>('standing_order');
  const [cadence, setCadence] = useState('Semanal (martes)');

  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  // --- Derived economics ------------------------------------------------------
  const totalCost = useMemo(() => lines.reduce((s, l) => s + l.stems * l.costPerStem, 0), [lines]);
  const floor = totalCost / (1 - minGpm);
  const effectivePrice = priceTouched ? price : Math.max(floor, totalCost > 0 ? +(floor * 1.18).toFixed(2) : 0);
  const belowFloor = effectivePrice < floor - 1e-9;
  const hasLines = lines.some((l) => l.stems > 0);

  // --- Client handlers --------------------------------------------------------
  async function handleSelectClient(c: ClientLite) {
    setSelectedClient(c);
    setNewClient(null);
    setIntel(null);
    if (c.leadMasterId == null) return;
    setIntelLoading(true);
    try {
      const res = await fetch(`/api/admin/deals/intel?leadMasterId=${c.leadMasterId}`);
      if (res.ok) {
        const data = (await res.json()) as ClientIntel | null;
        setIntel(data);
      }
    } catch {
      setIntel(null);
    } finally {
      setIntelLoading(false);
    }
  }

  function handleAddNewClient(snap: NewClientSnapshot) {
    setNewClient(snap);
    setSelectedClient(null);
    setIntel(null);
  }

  // --- Line handlers ----------------------------------------------------------
  function changeLine(id: string, patch: Partial<DealLineVM>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function addExistingVariety(v: CatalogVariety) {
    const cost = v.farmCost ?? 0;
    const floorStem = v.priceFloor ?? +(cost / (1 - GPM_FLOOR)).toFixed(4);
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        variety: v.variety,
        tier: v.tier,
        grade: v.grade,
        boxType: v.boxType,
        stems: 0,
        costPerStem: cost,
        floorPerStem: floorStem,
        pricePerStem: +(floorStem * 1.18).toFixed(2),
        disposition: 'catalogo' as LineDisposition,
        costSource: v.costSource,
        isNewVariety: false,
        promoExpiresAt: null,
      },
    ]);
  }

  function addNewVarietyLine(v: NewVarietyLine) {
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        variety: v.variety,
        tier: null,
        grade: v.grade,
        boxType: null,
        stems: 0,
        costPerStem: v.costPerStem,
        floorPerStem: v.floorPerStem,
        pricePerStem: +(v.floorPerStem * 1.18).toFixed(2),
        disposition: v.disposition,
        costSource: v.source,
        isNewVariety: true,
        promoExpiresAt: null,
      },
    ]);
  }

  // --- Save -------------------------------------------------------------------
  function buildSnapshot(): Record<string, unknown> {
    if (newClient) {
      return {
        isNew: true,
        name: newClient.name,
        address: newClient.address,
        city: newClient.city,
        state: newClient.state,
        zip: newClient.zip,
        email: newClient.email,
        phone: newClient.phone,
        source: newClient.source,
        flaggedIncompleteAddress: newClient.flaggedIncompleteAddress,
      };
    }
    if (selectedClient) {
      return {
        isNew: false,
        leadMasterId: selectedClient.leadMasterId,
        name: selectedClient.name,
        city: selectedClient.city,
        state: selectedClient.state,
        source: selectedClient.source,
        status: selectedClient.status,
        heat: selectedClient.heat,
      };
    }
    return {};
  }

  async function handleSubmit() {
    setSaveState({ kind: 'saving' });
    const draftLines: DealLineInput[] = lines
      .filter((l) => l.stems > 0)
      .map((l) => ({
        variety: l.variety,
        tier: l.tier,
        grade: l.grade,
        boxType: l.boxType,
        stems: l.stems,
        capacityUnit: 'stems',
        unitCost: l.costPerStem,
        costSource: l.costSource,
        priceFloor: +(l.floorPerStem * l.stems).toFixed(4),
        linePrice: +(l.pricePerStem * l.stems).toFixed(4),
        isNewVariety: l.isNewVariety,
        priceDisposition: l.disposition === 'catalogo' ? undefined : (l.disposition as 'one_off' | 'tier' | 'temp_promo'),
        promoExpiresAt: l.promoExpiresAt,
      }));

    const draft: DealDraft = {
      clientLeadMasterId: selectedClient?.leadMasterId ?? null,
      clientSnapshot: buildSnapshot(),
      dealType,
      cadence: dealType === 'standing_order' ? cadence : null,
      lines: draftLines,
      price: effectivePrice,
    };

    try {
      const res = await fetch('/api/admin/deals/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dealId?: number; error?: string };
      if (res.ok && body.ok && typeof body.dealId === 'number') {
        setSaveState({ kind: 'ok', dealId: body.dealId });
      } else {
        setSaveState({ kind: 'error', message: body.error ?? `http_${res.status}` });
      }
    } catch (e) {
      setSaveState({ kind: 'error', message: e instanceof Error ? e.message : 'network_error' });
    }
  }

  const selectedLabel = newClient
    ? `${newClient.name}${newClient.city ? ` · ${newClient.city}` : ''} (nuevo)`
    : selectedClient
      ? `${selectedClient.name}${selectedClient.city ? ` · ${selectedClient.city}` : ''}`
      : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-emerald-700">Config &middot; Sales</div>
            <h1 className="mt-0.5 text-[28px] font-bold leading-tight text-slate-900">Deal Builder</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Arma un deal custom con un cliente -- sobre todo standing orders (recurring revenue). Empeza con los
              precios de catalogo y empuja el precio hasta el floor (GPM 5%) para ganar la recurrencia.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> draft
          </span>
        </div>

        {/* Client picker */}
        <div className="mb-4">
          <ClientPicker
            initialClients={initialClients}
            selectedLabel={selectedLabel}
            onSelectClient={handleSelectClient}
            onAddNewClient={handleAddNewClient}
          />
        </div>

        {/* Intel / new-client summary */}
        {newClient ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 text-[13px] text-slate-700">
            <span className="font-semibold text-slate-800">{newClient.name}</span> -- cliente nuevo (origen:{' '}
            {newClient.source}).{' '}
            {newClient.flaggedIncompleteAddress ? (
              <span className="text-amber-700">Direccion incompleta: el deal queda flagged para completar despues.</span>
            ) : (
              <span>
                {newClient.address}, {newClient.city}, {newClient.state} {newClient.zip}
              </span>
            )}
          </div>
        ) : (
          <ClientIntelPanel intel={intel} loading={intelLoading} />
        )}

        {/* Body */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(320px,360px)]">
          {/* LEFT -- build steps */}
          <div className="space-y-5">
            {/* Deal type bar */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tipo de deal</span>
                  <select
                    value={dealType}
                    onChange={(e) => setDealType(e.target.value as 'one_off' | 'standing_order')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="standing_order">Standing order</option>
                    <option value="one_off">One-off</option>
                  </select>
                </label>
                <label className={'block ' + (dealType === 'standing_order' ? '' : 'opacity-40')}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cadencia</span>
                  <input
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                    disabled={dealType !== 'standing_order'}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
            </div>

            <VarietyLines
              lines={lines}
              boxTypes={boxTypes}
              onChangeLine={changeLine}
              onRemoveLine={removeLine}
              onAddExisting={addExistingVariety}
            />

            {/* Crear variedad nueva: el editor canonico manda la propuesta a la cola;
                debajo se suma como linea de este deal. */}
            <div className="space-y-0">
              <VarietyUpsert onSaved={() => {}} />
              <NewVarietyLineCapture onAddLine={addNewVarietyLine} />
            </div>

            <Packing lines={lines} boxTypes={boxTypes} />

            {/* Subir caja nueva: el editor canonico propone la caja a la cola (box_master). */}
            <BoxUpsert onSaved={() => {}} />
          </div>

          {/* RIGHT -- sticky rail */}
          <div className="lg:sticky lg:top-5 lg:self-start">
            <div className="space-y-4">
              <ApprovalBar belowFloor={belowFloor} hasLines={hasLines} saveState={saveState} onSubmit={handleSubmit} />
              <PriceRail
                lines={lines}
                price={effectivePrice}
                minGpm={minGpm}
                onPriceChange={(p) => {
                  setPriceTouched(true);
                  setPrice(p);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
