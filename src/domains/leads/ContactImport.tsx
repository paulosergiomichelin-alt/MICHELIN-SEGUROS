import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Lead } from '../../types';
import { cn } from '../../lib/utils';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ContactImportProps {
  onImport: (leads: Lead[]) => void;
  onCancel: () => void;
  isImporting?: boolean;
  importProgress?: number;
}

export function ContactImport({ onImport, onCancel, isImporting, importProgress = 0 }: ContactImportProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isParsing, setIsParsing] = useState(false);
  const [previewLeads, setPreviewLeads] = useState<Lead[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = (file: File) => {
    setIsParsing(true);
    const reader = new FileReader();

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target?.result as string);
          const leads = Array.isArray(content) ? content : [content];
          const mappedLeads = leads.map((item: any) => mapToLead(item));
          setPreviewLeads(mappedLeads);
          setStep('preview');
        } catch (err: any) {
          console.error("Error parsing JSON:", err);
          alert("Erro ao ler arquivo JSON. Verifique o formato.");
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsText(file);
    } 
    else if (fileName.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        complete: (results: any) => {
          const mappedLeads = results.data.map((item: any) => mapToLead(item));
          setPreviewLeads(mappedLeads.filter((l: Lead) => l.name));
          setStep('preview');
          setIsParsing(false);
        },
        error: (err: any) => {
          console.error("Error parsing CSV:", err);
          alert("Erro ao ler arquivo CSV.");
          setIsParsing(false);
        }
      });
    }
    else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          const mappedLeads = jsonData.map((item: any) => mapToLead(item));
          setPreviewLeads(mappedLeads.filter((l: Lead) => l.name));
          setStep('preview');
        } catch (err) {
          console.error("Error parsing Excel:", err);
          alert("Erro ao ler arquivo Excel.");
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    }
    else {
      alert("Formato de arquivo não suportado. Use CSV, Excel ou JSON.");
      setIsParsing(false);
    }
  };

  const mapToLead = (item: any): Lead => {
    // Helper to find value from multiple possible keys
    const findValue = (keys: string[]) => {
      const foundKey = Object.keys(item).find(k => 
        keys.some(searchKey => k.toLowerCase().trim() === searchKey.toLowerCase())
      );
      return foundKey ? item[foundKey] : '';
    };

    return {
      id: item.id || Math.random().toString(36).substr(2, 9),
      createdAt: item.createdAt || new Date().toISOString(),
      status: (item.status as any) || 'Novo Lead',
      name: findValue(['nome', 'name', 'fullname', 'cliente']),
      phone: findValue(['telefone 1', 'telefone1', 'phone 1', 'phone1', 'telefone', 'celular', 'whatsapp', 'contato', 'tel']),
      phone2: findValue(['telefone 2', 'telefone2', 'phone 2', 'phone2', 'contato2', 'tel2', 'celular2']),
      cpf: findValue(['cpf', 'cnpj', 'documento', 'doc']),
      birthDate: findValue(['birthDate', 'nascimento', 'data_nascimento', 'birthday']),
      civilStatus: findValue(['civilStatus', 'estadoCivil', 'estado_civil']),
      plate: findValue(['plate', 'placa', 'veiculo_placa']),
      chassis: findValue(['chassis', 'chassi', 'veiculo_chassis']),
      zipCodeOvernight: findValue(['zipCodeOvernight', 'cep', 'cep_pernoite']),
      addressOvernight: findValue(['addressOvernight', 'endereco', 'rua']),
      origin: (item.origin as string) || 'Importação',
      originDetails: (item.originDetails as string) || '',
      isDifferentResidenceZip: !!item.isDifferentResidenceZip,
      fiduciaryAlienation: !!item.fiduciaryAlienation,
      serviceUsage: !!item.serviceUsage,
      youngDriverHousehold: !!item.youngDriverHousehold,
      isOwnerDriver: item.isOwnerDriver !== undefined ? !!item.isOwnerDriver : true,
      iaActive: item.ia_ativa !== undefined ? (String(item.ia_ativa).toLowerCase() === 'true' || item.ia_ativa === 1 || item.ia_ativa === true) : true,
      hasInsurance: !!item.hasInsurance,
      documents: item.documents || {}
    } as Lead;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseFile(e.target.files[0]);
    }
  };

  if (isImporting) {
    const progressPercent = previewLeads.length > 0 ? Math.round((importProgress / previewLeads.length) * 100) : 0;
    
    return (
      <div className="p-12 text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="relative w-32 h-32 mx-auto">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="60"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-slate-100"
            />
            <circle
              cx="64"
              cy="64"
              r="60"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={376.8}
              strokeDashoffset={376.8 - (376.8 * progressPercent) / 100}
              strokeLinecap="round"
              className="text-gold-deep transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-display font-bold text-slate-900">{progressPercent}%</span>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Gravando Base de Dados</h3>
          <p className="text-sm text-slate-500 font-medium">Aguarde enquanto processamos os registros...</p>
        </div>

        <div className="max-w-xs mx-auto bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div 
            className="bg-gold-deep h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span className="text-gold-deep">{importProgress}</span>
          <span>de</span>
          <span>{previewLeads.length} itens</span>
        </div>
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div className="p-4 md:p-8 text-center space-y-6">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-[2rem] p-8 md:p-12 hover:border-gold-deep hover:bg-gold-deep/5 transition-all cursor-pointer group"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".csv,.xlsx,.json"
          />
          {isParsing ? (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 text-gold-deep animate-spin mx-auto" />
              <p className="text-slate-600 font-bold uppercase tracking-widest text-sm">Lendo arquivo...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto group-hover:bg-gold-deep/10 transition-colors">
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-gold-deep" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Importar Contatos</p>
                <p className="text-sm text-slate-500 mt-1">Arraste um arquivo ou toque para selecionar</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-slate-400">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Planilha Excel (.xlsx)</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">JSON Structure</span>
          </div>
        </div>

        <button 
          onClick={onCancel}
          className="text-xs font-bold text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors"
        >
          Cancelar Importação
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gold-light/10 p-4 md:p-6 rounded-[2rem] border border-gold-deep/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-12 h-12 bg-gold-deep rounded-full flex items-center justify-center text-brand-black shrink-0">
             <Check className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs md:text-sm font-bold text-gold-deep uppercase tracking-widest leading-none">Pré-visualização</h3>
            <p className="text-[10px] md:text-xs text-slate-500 mt-1">Encontramos {previewLeads.length} leads no arquivo.</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={onCancel}
            className="flex-1 sm:flex-none px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold uppercase hover:bg-slate-50 transition-colors"
          >
            Recusar
          </button>
          <button 
            onClick={() => onImport(previewLeads)}
            className="flex-1 sm:flex-none px-6 py-3 bg-brand-dark text-gold-deep border border-gold-deep rounded-xl text-[10px] font-bold uppercase hover:bg-brand-black transition-all shadow-lg shadow-gold-deep/10"
          >
            Aceitar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lead</th>
              <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">IA</th>
              <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contato</th>
              <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Veículo / Placa</th>
              <th className="px-5 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Endereço</th>
            </tr>
          </thead>
          <tbody>
            {previewLeads.map((lead, idx) => (
              <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4">
                  <p className="text-sm font-bold text-slate-800">{lead.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">CPF: {lead.cpf}</p>
                </td>
                <td className="px-5 py-4 text-center">
                   {lead.iaActive !== false ? (
                      <div className="w-6 h-6 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100" title="IA Ativa">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                   ) : (
                      <div className="w-6 h-6 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto border border-slate-100" title="Manual">
                        <X className="w-3.5 h-3.5" />
                      </div>
                   )}
                </td>
                <td className="px-5 py-4 text-xs font-bold text-slate-600">
                  <div className="flex flex-col gap-1">
                    <span>{lead.phone}</span>
                    {lead.phone2 && <span className="text-[10px] text-slate-400 font-normal">T2: {lead.phone2}</span>}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600 border border-slate-200 uppercase tracking-widest">
                    {lead.plate}
                  </span>
                </td>
                <td className="px-5 py-4 text-[10px] text-slate-500 truncate max-w-[200px]">
                  {lead.addressOvernight}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
