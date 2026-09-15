import React from 'react';
import { Paperclip, FileText, Download } from 'lucide-react';
import type { EmailAttachment } from '../../types/email.types';

interface Props {
  attachments: EmailAttachment[] | undefined;
}

export const EmailViewerAttachments: React.FC<Props> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="px-6 pb-6">
      <div className="border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Paperclip className="w-3 h-3" />
          {attachments.length} anexo{attachments.length > 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 group hover:border-slate-300 transition-colors"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-700 max-w-[160px] truncate">{att.filename}</p>
                <p className="text-[10px] text-slate-400">{att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}</p>
              </div>
              {att.downloadUrl && (
                <a
                  href={att.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-[#1B4D8F]"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
