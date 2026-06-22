import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  BarChart3, FileSpreadsheet, Printer, Filter, X, ChevronDown, Check,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Apolice, UserProfile, PRODUTOS_SEGURO } from '../../types';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { useClientes } from '../../contexts/ClienteRealtimeContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { ClienteService } from '../../services/ClienteService';
import { DataService } from '../../services/DataService';
import { SEGURADORAS } from '../../lib/seguradoras';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface RelatorioRow extends Apolice {
  clienteNome: string;
  vendedorId: string;
  vendedorNome: string;
  seguradoraNome: string;
}

// ── Datas padrão ───────────────────────────────────────────────────────────────

function defaultStart() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
}

function defaultEnd() {
  return format(new Date(), 'yyyy-MM-dd');
}

// ── Multi-select com checkboxes ────────────────────────────────────────────────

interface MultiSelectOption { value: string; label: string }

interface MultiSelectProps {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelect({ label, placeholder, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const displayLabel =
    selected.length === 0 ? placeholder
    : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} selecionados`;

  return (
    <div ref={ref} className="flex flex-col gap-1 relative">
      <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{label}</label>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center justify-between gap-2 bg-brand-black border text-[10px] rounded-lg px-2.5 py-1.5 outline-none min-w-[140px] text-left transition-colors',
          open ? 'border-gold-deep/50 text-white' : 'border-white/15 text-white/70 hover:border-white/30',
          selected.length > 0 && 'border-gold-deep/30 text-white/90',
        )}
      >
        <span className="truncate max-w-[130px]">{displayLabel}</span>
        <ChevronDown className={cn('w-3 h-3 shrink-0 text-white/30 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 bg-[#141414] border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] min-w-[200px] overflow-hidden">
          {selected.length > 0 && (
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-white/40">{selected.length} selecionado{selected.length > 1 ? 's' : ''}</span>
              <button
                onClick={() => onChange([])}
                className="text-[9px] font-black text-gold-deep/70 hover:text-gold-deep uppercase tracking-widest transition-colors"
              >
                Limpar
              </button>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto custom-scrollbar py-1">
            {options.map(opt => {
              const isSel = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                    isSel ? 'bg-gold-deep border-gold-deep' : 'border-white/25 bg-transparent',
                  )}>
                    {isSel && <Check className="w-2.5 h-2.5 text-[#0a0a0a]" strokeWidth={3} />}
                  </div>
                  <span className={cn('text-[10px] font-medium truncate', isSel ? 'text-white' : 'text-white/55')}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); }
  catch { return iso; }
}

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function fmtPct(v?: number) {
  if (v == null) return '—';
  return `${v.toFixed(2)}%`;
}

function dateKey(iso?: string) {
  return iso ? iso.substring(0, 10) : '';
}

// ── Definição de colunas ───────────────────────────────────────────────────────

interface ColDef { label: string; key: string; align?: 'right' }

const COLS_VENDAS: ColDef[] = [
  { label: 'Data Vigência',  key: 'inicioVigencia' },
  { label: 'Segurado',       key: 'clienteNome' },
  { label: 'Produto',        key: 'produto' },
  { label: 'Seguradora',     key: 'seguradoraNome' },
  { label: 'Prêmio Líquido', key: 'premioLiquido',  align: 'right' },
  { label: 'Valor Total',    key: 'valorTotal',      align: 'right' },
  { label: 'Vendedor',       key: 'vendedorNome' },
];

const COLS_COMISSOES: ColDef[] = [
  { label: 'Data Vigência',  key: 'inicioVigencia' },
  { label: 'Segurado',       key: 'clienteNome' },
  { label: 'Produto',        key: 'produto' },
  { label: 'Seguradora',     key: 'seguradoraNome' },
  { label: 'Prêmio Líquido', key: 'premioLiquido',  align: 'right' },
  { label: 'Comissão %',     key: 'comissaoPct',     align: 'right' },
  { label: 'Comissão R$',    key: 'comissao',        align: 'right' },
  { label: 'Vendedor',       key: 'vendedorNome' },
];

// ── Página ─────────────────────────────────────────────────────────────────────

export const RelatoriosPage: React.FC = () => {
  const { clientes } = useClientes();
  const { userProfile } = usePermissions();
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'vendas' | 'comissoes'>('vendas');

  const [filtroVendedor, setFiltroVendedor] = useState<string[]>([]);
  const [filtroProduto, setFiltroProduto] = useState<string[]>([]);
  const [filtroSeguradora, setFiltroSeguradora] = useState<string[]>([]);
  const [filtroDataInicio, setFiltroDataInicio] = useState(defaultStart);
  const [filtroDataFim, setFiltroDataFim] = useState(defaultEnd);

  const [sortKey, setSortKey] = useState('inicioVigencia');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const organizationId = userProfile?.organizationId ?? 'default';

  useEffect(() => {
    const unsub = ClienteService.subscribeAllApolicesReport(organizationId, setApolices);
    return unsub;
  }, [organizationId]);

  useEffect(() => {
    const unsub = DataService.subscribeCollection('users', [], (data: any[]) => {
      setUsuarios(
        data.filter((u: UserProfile) =>
          u.organizationId === organizationId && u.userType === 'HUMAN',
        ),
      );
    });
    return unsub;
  }, [organizationId]);

  const rows = useMemo<RelatorioRow[]>(() => {
    return apolices.map(a => {
      const cliente = clientes.find(c => c.id === a.clienteId);
      const vendedor = usuarios.find(u => u.uid === cliente?.responsavelId);
      const seguradora = SEGURADORAS.find(s => s.id === a.seguradoraId);
      return {
        ...a,
        clienteNome: cliente?.nome ?? '—',
        vendedorId: cliente?.responsavelId ?? '',
        vendedorNome: vendedor?.name ?? '—',
        seguradoraNome: seguradora?.nome ?? a.seguradoraId,
      };
    });
  }, [apolices, clientes, usuarios]);

  const filteredRows = useMemo(() => {
    const filtered = rows.filter(r => {
      if (filtroVendedor.length > 0 && !filtroVendedor.includes(r.vendedorId)) return false;
      if (filtroProduto.length > 0 && !filtroProduto.includes(r.produto)) return false;
      if (filtroSeguradora.length > 0 && !filtroSeguradora.includes(r.seguradoraId)) return false;
      const dk = dateKey(r.inicioVigencia) || dateKey(r.createdAt);
      if (filtroDataInicio && dk < filtroDataInicio) return false;
      if (filtroDataFim && dk > filtroDataFim) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const va = (a as any)[sortKey] ?? '';
      const vb = (b as any)[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, filtroVendedor, filtroProduto, filtroSeguradora, filtroDataInicio, filtroDataFim, sortKey, sortDir]);

  const totals = useMemo(() => ({
    premioLiquido: filteredRows.reduce((s, r) => s + (r.premioLiquido ?? 0), 0),
    valorTotal: filteredRows.reduce((s, r) => s + (r.valorTotal ?? 0), 0),
    comissao: filteredRows.reduce((s, r) => s + (r.comissao ?? 0), 0),
  }), [filteredRows]);

  const hasFilters = filtroVendedor.length > 0 || filtroProduto.length > 0
    || filtroSeguradora.length > 0 || !!filtroDataInicio || !!filtroDataFim;

  const clearFilters = () => {
    setFiltroVendedor([]);
    setFiltroProduto([]);
    setFiltroSeguradora([]);
    setFiltroDataInicio('');
    setFiltroDataFim('');
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // ── Opções dos filtros ──────────────────────────────────────────────────────

  const opcoesVendedor = useMemo<MultiSelectOption[]>(
    () => usuarios.map(u => ({ value: u.uid, label: u.name })),
    [usuarios],
  );

  const opcoesProduto = useMemo<MultiSelectOption[]>(
    () => PRODUTOS_SEGURO.map(p => ({ value: p, label: p })),
    [],
  );

  const opcoesSeguradora = useMemo<MultiSelectOption[]>(
    () => SEGURADORAS.filter(s => s.ativa).map(s => ({ value: s.id, label: s.nome })),
    [],
  );

  // ── Exportações ────────────────────────────────────────────────────────────

  const exportExcel = () => {
    const filename = activeTab === 'vendas' ? 'relatorio-vendas.xlsx' : 'relatorio-comissoes.xlsx';
    const sheetName = activeTab === 'vendas' ? 'Vendas' : 'Comissões';

    const data = filteredRows.map(r => {
      const base = {
        'Data de Vigência': fmtDate(r.inicioVigencia),
        'Segurado': r.clienteNome,
        'Produto': r.produto,
        'Seguradora': r.seguradoraNome,
        'Prêmio Líquido (R$)': r.premioLiquido,
      };
      if (activeTab === 'vendas') {
        return { ...base, 'Valor Total (R$)': r.valorTotal, 'Vendedor': r.vendedorNome };
      }
      return { ...base, 'Comissão %': r.comissaoPct ?? '', 'Comissão (R$)': r.comissao, 'Vendedor': r.vendedorNome };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const exportPDF = () => {
    const titulo = activeTab === 'vendas' ? 'Relatório de Vendas' : 'Relatório de Comissões';
    const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const cols = activeTab === 'vendas' ? COLS_VENDAS : COLS_COMISSOES;

    const rowsHTML = filteredRows.map(r => {
      const cells = cols.map(c => {
        let val = '';
        if (c.key === 'inicioVigencia') val = fmtDate(r.inicioVigencia);
        else if (c.key === 'premioLiquido') val = fmtCurrency(r.premioLiquido);
        else if (c.key === 'valorTotal') val = fmtCurrency(r.valorTotal);
        else if (c.key === 'comissao') val = fmtCurrency(r.comissao);
        else if (c.key === 'comissaoPct') val = fmtPct(r.comissaoPct);
        else val = String((r as any)[c.key] ?? '—');
        return `<td${c.align === 'right' ? ' class="num"' : ''}>${val}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const footerCells = cols.map((c, i) => {
      if (i === 0) return `<td colspan="4">TOTAL — ${filteredRows.length} apólices</td>`;
      if (i < 3) return null;
      if (c.key === 'premioLiquido') return `<td class="num">${fmtCurrency(totals.premioLiquido)}</td>`;
      if (c.key === 'valorTotal') return `<td class="num">${fmtCurrency(totals.valorTotal)}</td>`;
      if (c.key === 'comissao') return `<td class="num">${fmtCurrency(totals.comissao)}</td>`;
      return `<td></td>`;
    }).filter(Boolean).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:9px;color:#111;padding:20px}
  h1{font-size:14px;font-weight:bold;margin-bottom:2px}
  .sub{color:#666;font-size:8px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1a1a1a;color:#fff;padding:5px 7px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:4px 7px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#f7f7f7}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot tr td{font-weight:bold;background:#f0f0f0;border-top:2px solid #333}
</style></head><body>
<h1>${titulo}</h1>
<p class="sub">Gerado em ${geradoEm} · ${filteredRows.length} registros</p>
<table>
  <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
  <tbody>${rowsHTML}</tbody>
  <tfoot><tr>${footerCells}</tr></tfoot>
</table></body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const colDefs = activeTab === 'vendas' ? COLS_VENDAS : COLS_COMISSOES;

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-gold-deep" />
      : <ArrowDown className="w-3 h-3 text-gold-deep" />;
  };

  const dateCls = "bg-brand-black border border-white/15 text-white/80 text-[10px] rounded-lg px-2.5 py-1.5 outline-none focus:border-gold-deep/40 hover:border-white/30 transition-colors [color-scheme:dark]";

  return (
    <div className="flex flex-col h-full bg-brand-dark">
      {/* Header */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 py-4 bg-brand-black/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gold-deep/15 border border-gold-deep/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-gold-deep" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-black text-white uppercase tracking-widest">Relatórios</h1>
            <p className="text-[10px] text-white/40 font-medium">Análise de vendas e comissões da carteira</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-red-500/20 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 flex gap-1 bg-brand-black/30">
        {(['vendas', 'comissoes'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 -mb-px',
              activeTab === tab
                ? 'text-gold-deep border-gold-deep'
                : 'text-white/40 border-transparent hover:text-white/70',
            )}
          >
            {tab === 'vendas' ? 'Relatório de Vendas' : 'Relatório de Comissões'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 py-3 bg-brand-black/20">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-1.5 self-end pb-2 text-[9px] font-black text-white/30 uppercase tracking-widest">
            <Filter className="w-3 h-3" />
            Filtros
          </div>

          <MultiSelect
            label="Vendedor"
            placeholder="Todos"
            options={opcoesVendedor}
            selected={filtroVendedor}
            onChange={setFiltroVendedor}
          />

          <MultiSelect
            label="Produto"
            placeholder="Todos"
            options={opcoesProduto}
            selected={filtroProduto}
            onChange={setFiltroProduto}
          />

          <MultiSelect
            label="Seguradora"
            placeholder="Todas"
            options={opcoesSeguradora}
            selected={filtroSeguradora}
            onChange={setFiltroSeguradora}
          />

          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Período de</label>
            <input
              type="date"
              value={filtroDataInicio}
              onChange={e => setFiltroDataInicio(e.target.value)}
              className={dateCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Até</label>
            <input
              type="date"
              value={filtroDataFim}
              onChange={e => setFiltroDataFim(e.target.value)}
              className={dateCls}
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="self-end pb-1.5 flex items-center gap-1 text-[9px] font-black text-gold-deep/70 hover:text-gold-deep uppercase tracking-widest transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar tudo
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full min-w-max">
          <thead className="sticky top-0 z-10 bg-brand-black/95 backdrop-blur-sm">
            <tr className="border-b border-white/5">
              {colDefs.map(col => (
                <th key={col.key} className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => handleSort(col.key)}
                    className={cn(
                      'group flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors',
                      col.align === 'right' && 'ml-auto',
                      sortKey === col.key ? 'text-gold-light' : 'text-white/50 hover:text-white/80',
                    )}
                  >
                    {col.align === 'right' && <SortIcon colKey={col.key} />}
                    {col.label}
                    {col.align !== 'right' && <SortIcon colKey={col.key} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/3">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={colDefs.length} className="py-20 text-center text-white/20 text-sm">
                  Nenhum registro encontrado
                </td>
              </tr>
            ) : (
              filteredRows.map(r => (
                <tr key={r.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-2.5 text-[10px] text-white/60 whitespace-nowrap font-mono">
                    {fmtDate(r.inicioVigencia)}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-[11px] font-bold text-white whitespace-nowrap">{r.clienteNome}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-white/70 whitespace-nowrap">{r.produto}</td>
                  <td className="px-4 py-2.5">
                    <SeguradoraBadge seguradoraId={r.seguradoraId} size="xs" />
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-white/70 text-right font-mono whitespace-nowrap">
                    {fmtCurrency(r.premioLiquido)}
                  </td>
                  {activeTab === 'vendas' ? (
                    <td className="px-4 py-2.5 text-[10px] text-gold-light text-right font-mono font-bold whitespace-nowrap">
                      {fmtCurrency(r.valorTotal)}
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-[10px] text-white/50 text-right font-mono whitespace-nowrap">
                        {fmtPct(r.comissaoPct)}
                      </td>
                      <td className="px-4 py-2.5 text-[10px] text-emerald-400 text-right font-mono font-bold whitespace-nowrap">
                        {fmtCurrency(r.comissao)}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2.5 text-[10px] text-white/40 whitespace-nowrap">{r.vendedorNome}</td>
                </tr>
              ))
            )}
          </tbody>

          {filteredRows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-brand-black/95 backdrop-blur-sm border-t border-white/10">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-[9px] font-black text-white/50 uppercase tracking-widest">
                  Total — {filteredRows.length} {filteredRows.length === 1 ? 'apólice' : 'apólices'}
                </td>
                <td className="px-4 py-3 text-[11px] text-white/80 text-right font-mono font-black whitespace-nowrap">
                  {fmtCurrency(totals.premioLiquido)}
                </td>
                {activeTab === 'vendas' ? (
                  <>
                    <td className="px-4 py-3 text-[11px] text-gold-light text-right font-mono font-black whitespace-nowrap">
                      {fmtCurrency(totals.valorTotal)}
                    </td>
                    <td />
                  </>
                ) : (
                  <>
                    <td />
                    <td className="px-4 py-3 text-[11px] text-emerald-400 text-right font-mono font-black whitespace-nowrap">
                      {fmtCurrency(totals.comissao)}
                    </td>
                    <td />
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
