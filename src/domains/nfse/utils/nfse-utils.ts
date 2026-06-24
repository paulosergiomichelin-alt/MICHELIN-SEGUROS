export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return value;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function calcISS(valorServico: number, aliquotaISS: number, desconto = 0): number {
  const base = Math.max(0, valorServico - desconto);
  return parseFloat((base * (aliquotaISS / 100)).toFixed(2));
}

export function calcTotal(valorServico: number, desconto = 0): number {
  return Math.max(0, valorServico - desconto);
}

export function certDaysLeft(expirationDate?: string): number | null {
  if (!expirationDate) return null;
  return Math.ceil((new Date(expirationDate).getTime() - Date.now()) / 86_400_000);
}

export function certStatusColor(daysLeft: number | null): string {
  if (daysLeft === null) return '#8E8E93';
  if (daysLeft <= 0) return '#F87171';
  if (daysLeft <= 30) return '#FBBF24';
  return '#4ADE80';
}

export async function fetchCep(cep: string): Promise<{
  logradouro: string; bairro: string; localidade: string; uf: string;
} | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const json = await res.json();
    if (json.erro) return null;
    return json;
  } catch {
    return null;
  }
}

export function generateNfseVerificationUrl(codigoVerificacao: string, codigoMunicipio?: string): string {
  const base = codigoMunicipio === '5005400'
    ? 'https://nfse.maracaju.ms.gov.br/verificar'
    : 'https://nfse.municipio.gov.br/verificar';
  return `${base}?codigo=${codigoVerificacao}`;
}
