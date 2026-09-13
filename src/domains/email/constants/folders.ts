import { Inbox, Send, Archive, Trash2, AlertCircle, FileText, LucideIcon } from 'lucide-react';

export interface FixedFolder {
  id: string;
  label: string;
  icon: LucideIcon;
}

// As 6 pastas que sempre existem, independente do provedor — usado pela barra lateral
// (FolderNav) e pelo menu "Mover para" dos itens da lista (EmailListItem).
export const FIXED_FOLDERS: FixedFolder[] = [
  { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox },
  { id: 'sent', label: 'Enviados', icon: Send },
  { id: 'drafts', label: 'Rascunhos', icon: FileText },
  { id: 'archived', label: 'Arquivados', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertCircle },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
];

// Mover mensagem PRA uma das 6 pastas fixas usa as ações já existentes (cada uma tem
// semântica própria e correta por provedor — ver action.ts) em vez do endpoint genérico
// de mover, que só faz sentido pra pastas customizadas/descobertas de verdade.
// EmailContext.moveMessage consulta este mapa pra decidir qual caminho tomar — é o
// ÚNICO lugar que faz essa checagem, tanto o drop numa pasta fixa da sidebar quanto
// o menu "Mover para" no item da lista passam por ele.
export const FIXED_FOLDER_MOVE_ACTION: Record<string, string> = {
  archived: 'archive',
  trash: 'trash',
  spam: 'spam',
  inbox: 'restore',
};
