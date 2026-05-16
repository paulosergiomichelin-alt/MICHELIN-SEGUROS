
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeads } from '../../contexts/LeadRealtimeContext';
import { DataService } from '../../services/DataService';
import { Lead } from '../../types';
import { LeadForm } from './LeadForm';

export const LeadPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { leads } = useLeads();

  const isNew = !id || id === 'new';
  const lead = isNew ? null : (leads.find(l => l.id === id) ?? null);

  const handleSave = async (savedLead: Lead, options?: { silent?: boolean }) => {
    try {
      if (savedLead.id && leads.find(l => l.id === savedLead.id)) {
        await DataService.update('lead', savedLead.id, savedLead);
      } else {
        await DataService.create('lead', savedLead);
      }
      if (!options?.silent) navigate('/leads');
    } catch (error) {
      console.error('Error saving lead:', error);
    }
  };

  return (
    <LeadForm
      key={isNew ? 'new' : id}
      lead={lead}
      onSave={handleSave}
      onCancel={() => navigate(-1)}
      onNavigateToLead={(target) => navigate('/leads/' + target.id)}
      pageMode
    />
  );
};
