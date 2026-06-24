import type { DanfseData } from '../types';
import { formatCurrency, formatDate, formatDateTime, formatCpfCnpj } from '../utils/nfse-utils';

// pdfmake dynamic import to avoid SSR issues
async function getPdfMake() {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
  (pdfMake as any).vfs = (pdfFonts as any).vfs ?? pdfFonts;
  return pdfMake;
}

function buildDocDefinition(data: DanfseData) {
  const { empresa, nota } = data;

  const valorServico = nota.valorServico ?? 0;
  const desconto     = nota.desconto ?? 0;
  const valorISS     = nota.valorISS ?? 0;
  const baseCalculo  = Math.max(0, valorServico - desconto);
  const valorTotal   = baseCalculo;

  const envBadge = nota.ambiente === 'producao'
    ? { text: 'PRODUÇÃO', color: '#4ADE80', bg: [22, 101, 52] }
    : { text: 'HOMOLOGAÇÃO', color: '#FBBF24', bg: [92, 72, 12] };

  const headerBg  = [14, 15, 17] as [number, number, number]; // #0E0F11
  const accentGold = '#D4A854';
  const textLight  = '#E5E7EB';
  const textMuted  = '#9CA3AF';

  const sectionHeader = (title: string) => ({
    table: {
      widths: ['*'],
      body: [[{
        text: title.toUpperCase(),
        fontSize: 7,
        bold: true,
        color: accentGold,
        fillColor: headerBg,
        margin: [8, 5, 8, 5],
        border: [false, false, false, false],
      }]],
    },
    margin: [0, 8, 0, 0],
  });

  const infoRow = (label: string, value: string) => [
    { text: label, fontSize: 7, color: textMuted, bold: true },
    { text: value || '—', fontSize: 8, color: textLight },
  ];

  const enderecoEmpresa = empresa.endereco ?? '—';
  const enderecoTomador = nota.clienteEndereco
    ? `${nota.clienteEndereco.logradouro}, ${nota.clienteEndereco.numero}${nota.clienteEndereco.complemento ? `, ${nota.clienteEndereco.complemento}` : ''} — ${nota.clienteEndereco.bairro}, ${nota.clienteEndereco.cidade}/${nota.clienteEndereco.estado} CEP ${nota.clienteEndereco.cep}`
    : '—';

  return {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 40] as [number, number, number, number],
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: '#050505' }] }),

    content: [
      // ── Cabeçalho ──
      {
        columns: [
          {
            width: '*',
            stack: [
              {
                text: 'NFS-e',
                fontSize: 20,
                bold: true,
                color: accentGold,
              },
              {
                text: 'NOTA FISCAL DE SERVIÇOS ELETRÔNICA',
                fontSize: 8,
                color: textMuted,
                margin: [0, 2, 0, 0],
              },
              {
                text: empresa.razaoSocial,
                fontSize: 11,
                bold: true,
                color: textLight,
                margin: [0, 6, 0, 0],
              },
              { text: `CNPJ: ${formatCpfCnpj(empresa.cnpj)}`, fontSize: 8, color: textMuted },
              ...(empresa.inscricaoMunicipal ? [{ text: `IM: ${empresa.inscricaoMunicipal}`, fontSize: 8, color: textMuted }] : []),
              { text: enderecoEmpresa, fontSize: 8, color: textMuted },
              ...(empresa.telefone ? [{ text: empresa.telefone, fontSize: 8, color: textMuted }] : []),
              ...(empresa.email ? [{ text: empresa.email, fontSize: 8, color: textMuted }] : []),
            ],
          },
          {
            width: 160,
            stack: [
              {
                table: {
                  widths: ['*'],
                  body: [[{
                    stack: [
                      { text: nota.numeroNota ? `Nº ${nota.numeroNota}` : 'RASCUNHO', fontSize: 14, bold: true, color: accentGold, alignment: 'center' },
                      { text: `RPS: ${nota.numeroRps ?? '—'}`, fontSize: 8, color: textMuted, alignment: 'center' },
                      { text: `Emissão: ${formatDate(nota.emittedAt ?? nota.createdAt)}`, fontSize: 8, color: textLight, alignment: 'center', margin: [0, 4, 0, 0] },
                      ...(nota.codigoVerificacao ? [{ text: `Cód. Verif.: ${nota.codigoVerificacao}`, fontSize: 7, color: textMuted, alignment: 'center' }] : []),
                      {
                        text: envBadge.text,
                        fontSize: 8,
                        bold: true,
                        color: envBadge.color,
                        alignment: 'center',
                        margin: [0, 6, 0, 0],
                      },
                    ],
                    fillColor: headerBg,
                    border: [false, false, false, false],
                    margin: [8, 8, 8, 8],
                  }]],
                },
              },
            ],
          },
        ],
      },

      // ── Linha separadora ──
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 535, y2: 4, lineWidth: 0.5, lineColor: accentGold }], margin: [0, 8, 0, 0] },

      // ── Prestador ──
      sectionHeader('Prestador de Serviços'),
      {
        table: {
          widths: ['auto', '*', 'auto', '*'],
          body: [
            infoRow('Razão Social', empresa.razaoSocial),
            infoRow('CNPJ', formatCpfCnpj(empresa.cnpj)),
            infoRow('Inscrição Municipal', empresa.inscricaoMunicipal ?? '—'),
            infoRow('Endereço', enderecoEmpresa),
          ],
        },
        layout: {
          hLineWidth: () => 0.3,
          vLineWidth: () => 0,
          hLineColor: () => '#1F2937',
          fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? '#0D0F12' : '#111316',
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 4, 0, 0],
      },

      // ── Tomador ──
      sectionHeader('Tomador de Serviços'),
      {
        table: {
          widths: ['auto', '*', 'auto', '*'],
          body: [
            infoRow('Nome / Razão Social', nota.clienteNome),
            infoRow('CPF / CNPJ', formatCpfCnpj(nota.clienteCpfCnpj)),
            ...(nota.clienteEmail ? [infoRow('E-mail', nota.clienteEmail)] : []),
            ...(nota.clienteTelefone ? [infoRow('Telefone', nota.clienteTelefone)] : []),
            infoRow('Endereço', enderecoTomador),
          ],
        },
        layout: {
          hLineWidth: () => 0.3,
          vLineWidth: () => 0,
          hLineColor: () => '#1F2937',
          fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? '#0D0F12' : '#111316',
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 4, 0, 0],
      },

      // ── Serviços ──
      sectionHeader('Discriminação dos Serviços'),
      {
        table: {
          headerRows: 1,
          widths: [25, '*', 30, 60, 70],
          body: [
            [
              { text: 'ITEM',    fontSize: 7, bold: true, color: accentGold, fillColor: headerBg, alignment: 'center', margin: [0, 4, 0, 4] },
              { text: 'DESCRIÇÃO', fontSize: 7, bold: true, color: accentGold, fillColor: headerBg, margin: [0, 4, 0, 4] },
              { text: 'QTD',    fontSize: 7, bold: true, color: accentGold, fillColor: headerBg, alignment: 'center', margin: [0, 4, 0, 4] },
              { text: 'VLR UNIT.', fontSize: 7, bold: true, color: accentGold, fillColor: headerBg, alignment: 'right', margin: [0, 4, 0, 4] },
              { text: 'TOTAL',  fontSize: 7, bold: true, color: accentGold, fillColor: headerBg, alignment: 'right', margin: [0, 4, 0, 4] },
            ],
            [
              { text: '1', fontSize: 8, color: textLight, alignment: 'center', fillColor: '#0D0F12', margin: [0, 4, 0, 4] },
              { text: nota.descricaoServico, fontSize: 8, color: textLight, fillColor: '#0D0F12', margin: [0, 4, 0, 4] },
              { text: String(nota.quantidade), fontSize: 8, color: textLight, alignment: 'center', fillColor: '#0D0F12', margin: [0, 4, 0, 4] },
              { text: formatCurrency(valorServico / nota.quantidade), fontSize: 8, color: textLight, alignment: 'right', fillColor: '#0D0F12', margin: [0, 4, 0, 4] },
              { text: formatCurrency(valorServico), fontSize: 8, color: textLight, alignment: 'right', fillColor: '#0D0F12', margin: [0, 4, 0, 4] },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.3,
          vLineWidth: () => 0.3,
          hLineColor: () => '#1F2937',
          vLineColor: () => '#1F2937',
        },
        margin: [0, 4, 0, 0],
      },

      // ── Impostos + Total ──
      {
        columns: [
          {
            width: '55%',
            stack: [
              sectionHeader('Impostos'),
              {
                table: {
                  widths: ['*', 'auto'],
                  body: [
                    [{ text: 'Base de Cálculo', fontSize: 8, color: textMuted }, { text: formatCurrency(baseCalculo), fontSize: 8, color: textLight, alignment: 'right' }],
                    [{ text: `Alíquota ISS (${nota.aliquotaISS}%)`, fontSize: 8, color: textMuted }, { text: `${nota.aliquotaISS}%`, fontSize: 8, color: textLight, alignment: 'right' }],
                    [{ text: 'Valor ISS', fontSize: 8, color: textMuted }, { text: formatCurrency(valorISS), fontSize: 8, color: textLight, alignment: 'right' }],
                    [{ text: 'ISS Retido', fontSize: 8, color: textMuted }, { text: nota.issRetido ? 'SIM' : 'NÃO', fontSize: 8, color: nota.issRetido ? '#F87171' : '#4ADE80', bold: true, alignment: 'right' }],
                    ...(desconto > 0 ? [[{ text: 'Desconto', fontSize: 8, color: textMuted }, { text: formatCurrency(desconto), fontSize: 8, color: '#F87171', alignment: 'right' }]] : []),
                  ],
                },
                layout: {
                  hLineWidth: () => 0.3,
                  vLineWidth: () => 0,
                  hLineColor: () => '#1F2937',
                  fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? '#0D0F12' : '#111316',
                  paddingLeft: () => 8,
                  paddingRight: () => 8,
                  paddingTop: () => 4,
                  paddingBottom: () => 4,
                },
                margin: [0, 4, 8, 0],
              },
            ],
          },
          {
            width: '45%',
            stack: [
              sectionHeader('Total'),
              {
                table: {
                  widths: ['*'],
                  body: [[{
                    stack: [
                      { text: 'VALOR TOTAL DOS SERVIÇOS', fontSize: 8, bold: true, color: textMuted, alignment: 'center' },
                      { text: formatCurrency(valorTotal), fontSize: 20, bold: true, color: accentGold, alignment: 'center', margin: [0, 6, 0, 0] },
                    ],
                    fillColor: headerBg,
                    border: [false, false, false, false],
                    margin: [8, 16, 8, 16],
                  }]],
                },
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
      },

      // ── Observações ──
      ...(nota.observacoes ? [
        sectionHeader('Informações Complementares'),
        {
          text: nota.observacoes,
          fontSize: 8,
          color: textLight,
          margin: [0, 4, 0, 0],
        },
      ] : []),

      // ── Código de verificação ──
      ...(nota.codigoVerificacao ? [
        sectionHeader('Autenticidade'),
        {
          text: `Código de Verificação: ${nota.codigoVerificacao}`,
          fontSize: 9,
          bold: true,
          color: accentGold,
          margin: [0, 4, 0, 0],
        },
        {
          text: `Para verificar a autenticidade desta NFS-e, acesse o portal da prefeitura e informe o código acima.`,
          fontSize: 7,
          color: textMuted,
          margin: [0, 2, 0, 0],
        },
      ] : []),
    ],

    footer: (_currentPage: number, _pageCount: number) => ({
      columns: [
        { text: `Emitido por Michelin Seguros CRM · ${formatDateTime(new Date().toISOString())}`, fontSize: 7, color: '#4B5563', margin: [30, 0, 0, 0] },
        { text: `Página ${_currentPage} de ${_pageCount}`, fontSize: 7, color: '#4B5563', alignment: 'right', margin: [0, 0, 30, 0] },
      ],
      margin: [0, 8, 0, 0],
    }),

    defaultStyle: {
      font: 'Roboto',
      color: textLight,
    },
  };
}

export async function generateDanfse(data: DanfseData): Promise<void> {
  const pdfMake = await getPdfMake();
  pdfMake.createPdf(buildDocDefinition(data) as any).open();
}

export async function downloadDanfse(data: DanfseData, filename?: string): Promise<void> {
  const pdfMake = await getPdfMake();
  const name = filename ?? `NFS-e_${data.nota.numeroNota ?? data.nota.id}_${formatDate(data.nota.emittedAt)}.pdf`;
  pdfMake.createPdf(buildDocDefinition(data) as any).download(name);
}

export async function getDanfseBlob(data: DanfseData): Promise<Blob> {
  const pdfMake = await getPdfMake();
  return new Promise((resolve, reject) => {
    (pdfMake.createPdf(buildDocDefinition(data) as any) as any).getBlob((blob: Blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao gerar PDF'));
    });
  });
}
