// ClientPicker -- searchable client dropdown (debounced) + "add new client" form.
// Rows show name . city . status . heat . #interactions . talk time.
// New-client form captures address/city/state/zip (blank allowed -> flagged),
// email/phone, source (sample_box|referral|manual|other->free text).
// v1 | 2026-06-09 | Job_PM (CPO)
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientLite } from '@/lib/deal/types';

export interface NewClientSnapshot {
  isNew: true;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  source: string;
  /** address/city/state/zip incompleta -> el deal queda flagged para revisar despues */
  flaggedIncompleteAddress: boolean;
}

function fmtTalk(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--';
  const m = Math.round(seconds / 60);
  return `${m}m`;
}

function heatChip(heat: string | null): string {
  const h = (heat ?? '').toLowerCase();
  if (h.includes('hot') || h.includes('high')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (h.includes('warm') || h.includes('med')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (h.includes('cold') || h.includes('low')) return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

export default function ClientPicker({
  initialClients,
  selectedLabel,
  onSelectClient,
  onAddNewClient,
}: {
  initialClients: ClientLite[];
  selectedLabel: string | null;
  onSelectClient: (c: ClientLite) => void;
  onAddNewClient: (snapshot: NewClientSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ClientLite[]>(initialClients);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch to /api/admin/deals/clients?q=
  useEffect(() => {
    const term = search.trim();
    if (term === '') {
      setResults(initialClients);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/deals/clients?q=${encodeURIComponent(term)}`);
        if (res.ok) {
          const data = (await res.json()) as ClientLite[];
          setResults(Array.isArray(data) ? data : []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, initialClients]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cliente</div>
        <div className="relative min-w-[280px] flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition hover:border-slate-400"
          >
            <span className={selectedLabel ? 'font-medium text-slate-800' : 'text-slate-400'}>
              {selectedLabel ?? 'Buscar cliente...'}
            </span>
            <span className="text-slate-400">&#9662;</span>
          </button>

          {open && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-100 p-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o ciudad..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <ul className="max-h-72 overflow-auto py-1">
                {loading && <li className="px-3 py-3 text-center text-[13px] text-slate-400">Buscando...</li>}
                {!loading &&
                  results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectClient(c);
                          setOpen(false);
                          setSearch('');
                        }}
                        className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition hover:bg-slate-50"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>
                            <span className="font-medium text-slate-800">{c.name}</span>
                            {c.city && <span className="ml-2 text-[12px] text-slate-400">{c.city}</span>}
                          </span>
                          {c.heat && (
                            <span
                              className={'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ' + heatChip(c.heat)}
                            >
                              {c.heat}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span>{c.status ?? '--'}</span>
                          <span className="text-slate-300">&middot;</span>
                          <span>{c.interactions ?? 0} interacciones</span>
                          <span className="text-slate-300">&middot;</span>
                          <span>{fmtTalk(c.talkSeconds)} en llamada</span>
                        </span>
                      </button>
                    </li>
                  ))}
                {!loading && results.length === 0 && (
                  <li className="px-3 py-3 text-center text-[13px] text-slate-400">Sin resultados</li>
                )}
              </ul>
              <div className="border-t border-slate-100 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(true);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                >
                  <span className="text-lg leading-none">+</span> Agregar cliente nuevo
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          + Cliente nuevo
        </button>
      </div>

      {adding && (
        <AddClientForm
          onCancel={() => setAdding(false)}
          onSave={(snap) => {
            onAddNewClient(snap);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddClientForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (snap: NewClientSnapshot) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('sample_box');
  const [sourceOther, setSourceOther] = useState('');

  const addressIncomplete = !address.trim() || !city.trim() || !state.trim() || !zip.trim();
  const resolvedSource = source === 'other' ? sourceOther.trim() || 'other' : source;
  const ready = name.trim() !== '';

  function save() {
    if (!ready) return;
    onSave({
      isNew: true,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      email: email.trim(),
      phone: phone.trim(),
      source: resolvedSource,
      flaggedIncompleteAddress: addressIncomplete,
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Agregar cliente nuevo</h4>
        <button type="button" onClick={onCancel} className="text-[12px] text-slate-400 transition hover:text-slate-600">
          cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Labeled label="Nombre *" value={name} onChange={setName} placeholder="ej. Sunset Floral" />
        <Labeled label="Direccion" value={address} onChange={setAddress} placeholder="123 Main St" />
        <Labeled label="Ciudad" value={city} onChange={setCity} placeholder="Tampa" />
        <Labeled label="Estado" value={state} onChange={setState} placeholder="FL" />
        <Labeled label="ZIP" value={zip} onChange={setZip} placeholder="33601" />
        <Labeled label="Email" value={email} onChange={setEmail} placeholder="ventas@cliente.com" />
        <Labeled label="Telefono" value={phone} onChange={setPhone} placeholder="+1 555 123 4567" />
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source / origen</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="sample_box">sample_box</option>
            <option value="referral">referral</option>
            <option value="manual">manual</option>
            <option value="other">other (especificar)</option>
          </select>
        </label>
        {source === 'other' && (
          <Labeled label="Especificar origen" value={sourceOther} onChange={setSourceOther} placeholder="ej. trade show Miami" />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          {addressIncomplete ? (
            <span className="text-amber-600">
              Direccion incompleta -- se permite, pero el deal queda <span className="font-medium">flagged</span> para
              completar la direccion despues.
            </span>
          ) : (
            <span>
              Se guarda en el snapshot del deal con su <span className="font-medium text-slate-700">source</span> (origen:{' '}
              {resolvedSource}) -- queda trazado de donde vino el cliente.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!ready}
          className={
            'shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition ' +
            (ready ? 'bg-emerald-600 hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-300')
          }
        >
          Usar este cliente
        </button>
      </div>
    </div>
  );
}

function Labeled({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}
