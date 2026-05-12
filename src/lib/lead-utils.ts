import { Lead, LeadStatus } from '../types';

export const isValidCPF = (cpf: string): boolean => {
  if (!cpf) return false;
  const cleanCPF = cpf.replace(/\D/g, '');
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;

  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
};

export const isValidDate = (dateStr: string): boolean => {
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  // Clean string and handle common OCR issues
  const cleanStr = dateStr.trim().replace(/\s+/g, '');
  const parts = cleanStr.includes('/') ? cleanStr.split('/') : cleanStr.split('-');
  
  if (parts.length !== 3) return false;
  
  let day, month, year;
  
  // Detect format based on values
  // Format 1: DD/MM/YYYY or DD-MM-YYYY (Common in BR documents)
  if (parts[0].length <= 2 && parts[2].length === 4) {
    [day, month, year] = parts.map(Number);
  } 
  // Format 2: YYYY-MM-DD or YYYY/MM/DD (ISO/Internal)
  else if (parts[0].length === 4 && parts[2].length <= 2) {
    [year, month, day] = parts.map(Number);
  }
  else {
    return false;
  }

  if (!day || !month || !year) return false;
  
  const d = new Date(year, month - 1, day);
  return d && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
};

export const isValidName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  const cleaned = name.trim();
  if (cleaned.length < 5) return false;
  const parts = cleaned.split(/[\s-]+/);
  return parts.length >= 2 && parts.some(p => p.length >= 3);
};

export const standardizeLeadData = (data: any, existingLead?: Partial<Lead>): Partial<Lead> => {
  const result: any = {};
  
  if (!data || typeof data !== 'object') return {};

  // 1. Field Mapping (Handle common OCR or translation differences)
  const fieldMapping: Record<string, string> = {
    'nome': 'name',
    'fullName': 'name',
    'cpf': 'cpf',
    'rg': 'rg',
    'placa': 'plate',
    'chassi': 'chassi',
    'chassis': 'chassi',
    'chassiVeiculo': 'chassi',
    'renavam': 'renavam',
    'brandModel': 'brandModel',
    'marcaModelo': 'brandModel',
    'modelo': 'brandModel',
    'vencimento': 'insuranceExpiry',
    'expirationDate': 'insuranceExpiry',
    'insurance_expiry': 'insuranceExpiry',
    'startDate': 'insuranceStart',
    'insuranceStart': 'insuranceStart',
    'sexo': 'gender',
    'sex': 'gender',
    'estadoCivil': 'maritalStatus',
    'civilStatus': 'maritalStatus',
    'estado_civil': 'maritalStatus',
    'marital_status': 'maritalStatus',
    'cep': 'cepPernoite',
    'zipCode': 'cepPernoite',
    'cepPernoite': 'cepPernoite',
    'nascimento': 'birthDate',
    'dob': 'birthDate',
    'dataNascimento': 'birthDate',
    'data_nascimento': 'birthDate',
    'birth_date': 'birthDate',
    'proprietario': 'nomeProprietario',
    'nomeProprietario': 'nomeProprietario',
    'ownerName': 'nomeProprietario',
    'ownerCpf': 'cpfProprietario',
    'ownerCpfCnpj': 'cpfProprietario',
    'cpf_proprietario': 'cpfProprietario',
    'insuredName': 'name',
    'insuredCpf': 'cpf',
    'cnpj': 'cpfProprietario',
    'validadeCnh': 'licenseExpiry',
    'validity': 'licenseExpiry',
    'validityDate': 'licenseExpiry',
    'license_expiry': 'licenseExpiry',
    'categoriaCnh': 'licenseCategory',
    'category': 'licenseCategory',
    'license_category': 'licenseCategory',
    'registration': 'licenseNumber',
    'renach': 'renach',
    'firstLicenseDate': 'licenseIssueDate',
    'endereco': 'enderecoAuto',
    'logradouro': 'enderecoAuto',
    'address_overnight': 'enderecoAuto'
  };

  const cleanData: any = {};
  Object.keys(data).forEach(key => {
    const mappedKey = fieldMapping[key] || key;
    cleanData[mappedKey] = data[key];
  });

  // 2. Initial Cleaning
  Object.keys(cleanData).forEach(key => {
    const val = cleanData[key];
    if (val !== null && val !== undefined && val !== '' && val !== 'null' && val !== 'undefined') {
      result[key] = val;
    }
  });

  // 2. Identity & Names
  const nameFields = ['name', 'nomeProprietario'];
  nameFields.forEach(field => {
    if (result[field]) {
      const sanitized = result[field].toUpperCase().trim().replace(/[:-]/g, ' ');
      if (isValidName(sanitized)) {
        result[field] = sanitized;
      } else if (sanitized.length > 3) {
        result[field] = sanitized;
      }
    }
  });

  // 3. CPF Parsing & Validation
  const cpfFields = ['cpf', 'cpfProprietario'];
  cpfFields.forEach(field => {
    if (result[field]) {
      const clean = String(result[field]).replace(/\D/g, '');
      if (clean.length === 11) {
        result[field] = clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      } else if (clean.length === 14 && field === 'cpfProprietario') {
         result[field] = clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
      }
    }
  });

  // 4. Dates (Normalization to YYYY-MM-DD for consistency)
  const dateFields = ['birthDate', 'licenseIssueDate', 'licenseExpiry', 'insuranceExpiry', 'insuranceStart'];
  dateFields.forEach(field => {
    if (result[field]) {
      const val = String(result[field]);
      if (isValidDate(val)) {
        // Normalize DD/MM/YYYY to YYYY-MM-DD
        if (val.includes('/')) {
          const parts = val.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            result[field] = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
      } else {
        console.warn(`[VALIDATION] Data inválida ignorada: ${result[field]}`);
        delete result[field];
      }
    }
  });

  // 5. Special logic for Owner vs Driver
  if (result.ownerName || result.ownerCpfCnpj) {
    if (result.isOwnerDriver === undefined) {
      result.isOwnerDriver = false;
    }
  }

  // 6. General Text Normalization
  const textFields = [
    'plate', 'chassis', 'civilStatus', 'maritalStatus', 'gender',
    'addressOvernight', 'addressResidence', 'numberOvernight',
    'numberResidence', 'renavam', 'brandModel', 'licenseCategory', 'licenseNumber', 'renach'
  ];

  textFields.forEach(field => {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = result[field].toUpperCase().trim();
    }
  });

  // 6b. Boolean coercion for questionnaire-style fields.
  // The AI pipeline returns these as 'SIM'/'NÃO' strings (or pt-BR sim/nao); the form
  // state expects booleans. Without this conversion, the toggle in LeadForm stayed
  // OFF even when the document clearly had Alienação Fiduciária in the observations.
  const booleanFields: Record<string, string[]> = {
    fiduciaryAlienation: ['alienacaoFiduciaria', 'alienacao_fiduciaria'],
    isOwnerDriver: ['proprietarioCondutor', 'proprietario_e_condutor'],
    commercialUse: ['usoComercial', 'uso_comercial'],
    youngDriver: ['condutorJovem', 'condutor_jovem']
  };
  const truthyTokens = ['SIM', 'YES', 'TRUE', '1', 'POSSUI', 'CONSTA', 'VERDADEIRO'];
  const falsyTokens = ['NAO', 'NÃO', 'NO', 'FALSE', '0', 'INEXISTENTE'];
  for (const [primary, aliases] of Object.entries(booleanFields)) {
    let raw: any = result[primary];
    if (raw === undefined) {
      for (const alias of aliases) {
        if (result[alias] !== undefined) { raw = result[alias]; break; }
      }
    }
    if (raw === undefined || raw === null || raw === '') continue;
    let coerced: boolean | null = null;
    if (typeof raw === 'boolean') coerced = raw;
    else {
      const norm = String(raw).toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
      if (truthyTokens.includes(norm)) coerced = true;
      else if (falsyTokens.includes(norm)) coerced = false;
    }
    if (coerced !== null) {
      result[primary] = coerced;
      for (const alias of aliases) result[alias] = coerced;
    }
  }

  // 6. PROTEÇÃO DE DADOS EXISTENTES (POLÍTICA DE NÃO-SOBREPOSIÇÃO)
  if (existingLead) {
    const finalUpdate: any = {};
    Object.keys(result).forEach(key => {
      const newValue = result[key];
      // Permite sobreposição se hover valor novo válido
      if (newValue !== undefined && newValue !== null && String(newValue).trim() !== '') {
        finalUpdate[key] = newValue;
      }
    });

    // Sincronizar chaves secundárias para compatibilidade do formulário
    if (finalUpdate.chassi) finalUpdate.chassis = finalUpdate.chassi;
    if (finalUpdate.cepPernoite) finalUpdate.zipCodeOvernight = finalUpdate.cepPernoite;
    if (finalUpdate.enderecoAuto) finalUpdate.addressOvernight = finalUpdate.enderecoAuto;
    if (finalUpdate.nomeProprietario) finalUpdate.ownerName = finalUpdate.nomeProprietario;
    if (finalUpdate.cpfProprietario) finalUpdate.ownerCpfCnpj = finalUpdate.cpfProprietario;

    return finalUpdate;
  }
  
  return result;
};

export const getLeadDisplayName = (lead: Lead): string => {
  return lead.name || 'Sem Nome';
};

export const calculateLeadScore = (lead: Lead): number => {
  let score = 0;
  if (lead.name) score += 1;
  if (lead.phone) score += 2;
  if (lead.cpf) score += 2;
  if (lead.plate) score += 2;
  if (lead.chassis) score += 1;
  if (Object.keys(lead.documents || {}).length > 0) score += 2;
  return score;
};
