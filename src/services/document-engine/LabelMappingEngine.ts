/**
 * LabelMappingEngine.ts
 * Extracts values based on label proximity and normalized aliases.
 */
export class LabelMappingEngine {
  private static LABELS = {
    name: ['NOME', 'NOME DO SEGURADO', 'NOME DO SEGURADO(A)', 'SEGURADO', 'CONDUTOR', 'NOME COMPLETO', 'CONTRATANTE'],
    cpf: ['CPF', 'CPF/CNPJ', 'CNPJ/CPF', 'DOCUMENTO', 'CIC'],
    registration: ['REGISTRO', 'N REGISTRO', 'N. REGISTRO', 'REGISTRO NACIONAL'],
    category: ['CATEGORIA', 'CAT', 'CAT HAB', 'CATEG', 'MODALIDADE'],
    renavam: ['RENAVAM', 'CODIGO RENAVAM'],
    chassi: ['CHASSI', 'NUMERO DO CHASSI', 'N DO CHASSI'],
    placa: ['PLACA', 'PLACA DO VEICULO'],
    validity: ['VALIDADE', 'DATA VALIDADE', 'VIGENCIA', 'VIGÊNCIA', 'VENCIMENTO', 'FIM VIGENCIA', 'FIM VIGÊNCIA'],
    dob: ['DATA NASCIMENTO', 'NASCIMENTO', 'DT NASC', 'NASC'],
    renach: ['RENACH', 'N RENACH'],
    licenseExpiry: ['VALIDADE', 'VENCIMENTO CNH'],
    issueDate: ['DATA EMISSAO', 'DATA EMISSÃO', 'EMISSAO', 'EMISSÃO', 'EXPEDICAO'],
    brandModel: ['MARCA/MODELO', 'MARCA', 'MODELO', 'VEICULO'],
    brokerName: ['CORRETORA', 'CORRETOR', 'DADOS DO CORRETOR', 'PRODUTOR', 'CONSULTOR', 'ASSESSORIA', 'CANAL DE VENDA', 'INTERMEDIADOR', 'INTERMEDIÁRIO', 'REPRESENTANTE', 'PARCEIRO', 'ESCRITÓRIO'],
    brokerSusep: ['SUSEP', 'SUSEP CORRETOR', 'CODIGO SUSEP', 'CODIGO SUSEP CORRETOR'],
    brokerPhone: ['TEL CORRETOR', 'TELEFONE CORRETOR', 'FONE CORRETOR', 'CELULAR CORRETOR'],
    brokerEmail: ['EMAIL CORRETOR', 'E-MAIL CORRETOR']
  };

  /**
   * Attempts to find a label and extract the value immediately following it.
   * Optimized with extraction windows and boundary guards.
   */
  public static extractByLabel(text: string, field: keyof typeof LabelMappingEngine.LABELS): string {
    const aliases = this.LABELS[field];
    const uText = text.toUpperCase();

    for (const label of aliases) {
      const index = uText.indexOf(label);
      if (index !== -1) {
        // EXTRACTION WINDOW: Limit to 150 chars after label to prevent scanning the entire doc
        let afterLabel = text.substring(index + label.length, index + label.length + 150).trim();
        
        // Remove common separators at the start
        afterLabel = afterLabel.replace(/^[:\-.; ]+/, '');
        
        // SPLIT BY: Newline, multiple spaces (2+), or characters that usually separate fields
        const parts = afterLabel.split(/[\n\r]| {2,}|\|| {1,}[A-Z]{2,}:/);
        let match = parts[0].trim();
        
        // Boundary Logic: If the match contains another known label, trim it
        const nextLabels = [
          'RG', 'CPF', 'NOME', 'DATA', 'CATEG', 'VALI', 'PLACA', 'CHASSI', 'RENAVAM', 
          'ENDERECO', 'NUMERO', 'CIDADE', 'UF', 'CNPJ', 'VIGENCIA', 'FRANQUIA',
          'RESOLUCAO', 'PROCESSO', 'SUSEP', 'IMPORTANCIA', 'PREMIO', 'COBERTURA'
        ];
        
        for (const nextLabel of nextLabels) {
          const nextIndex = match.toUpperCase().indexOf(' ' + nextLabel);
          if (nextIndex > 0) {
            match = match.substring(0, nextIndex).trim();
          }
          // Special case for label:value without space
          const stickIndex = match.toUpperCase().indexOf(nextLabel + ':');
          if (stickIndex > 0) {
            match = match.substring(0, stickIndex).trim();
          }
        }

        // Limit match length for specific fields to avoid garbage
        if (['cpf', 'placa', 'renavam', 'chassi', 'category', 'registration'].includes(field)) {
          match = match.split(' ')[0]; // Take only the first word for these fields
        }

        if (match.length >= 2) {
          // If it looks like another label (all caps, no numbers, short), it might be an empty field
          if (/^[A-Z]{4,}$/.test(match) && !['CNH', 'CAT', 'SP', 'RJ', 'MG', 'PR'].includes(match)) {
             continue;
          }
          console.log(`[LABEL_MATCH] Found ${field} via label "${label}": "${match}"`);
          return match;
        }
      }
    }
    return '';
  }
}
