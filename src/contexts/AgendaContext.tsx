import React, {
  createContext, useContext, useReducer, useEffect, useCallback, useRef,
} from 'react';
import { usePermissions } from './PermissionsContext';
import {
  AgendaService, CalendarEvent, CreateEventPayload, UpdateEventPayload,
} from '../services/AgendaService';

export type AgendaView = 'day' | 'workweek' | 'week' | 'month';

interface AgendaState {
  selectedAccountId: string; // 'internal' ou o id de uma conta de e-mail
  view: AgendaView;
  currentDate: string; // ISO da data "focada" na visão atual
  events: CalendarEvent[];
  loading: boolean;
  needsReauth: boolean;
  error: string | null;
}

type AgendaAction =
  | { type: 'SET_ACCOUNT'; payload: string }
  | { type: 'SET_VIEW'; payload: AgendaView }
  | { type: 'SET_DATE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_EVENTS'; payload: { events: CalendarEvent[]; needsReauth: boolean } }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AgendaState = {
  selectedAccountId: 'internal',
  view: 'workweek',
  currentDate: new Date().toISOString(),
  events: [],
  loading: false,
  needsReauth: false,
  error: null,
};

function agendaReducer(state: AgendaState, action: AgendaAction): AgendaState {
  switch (action.type) {
    case 'SET_ACCOUNT':
      return { ...state, selectedAccountId: action.payload, events: [], needsReauth: false };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_DATE':
      return { ...state, currentDate: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_EVENTS':
      return { ...state, events: action.payload.events, needsReauth: action.payload.needsReauth, loading: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

interface AgendaContextType {
  state: AgendaState;
  selectAccount: (accountId: string) => void;
  setView: (view: AgendaView) => void;
  navigate: (direction: 'prev' | 'next' | 'today') => void;
  goToDate: (isoDate: string) => void;
  createEvent: (payload: Omit<CreateEventPayload, 'userId' | 'accountId'>) => Promise<boolean>;
  updateEvent: (id: string, payload: UpdateEventPayload) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<boolean>;
}

const noop = async () => false;
const DEFAULT_AGENDA_CTX: AgendaContextType = {
  state: initialState,
  selectAccount: () => {},
  setView: () => {},
  navigate: () => {},
  goToDate: () => {},
  createEvent: noop,
  updateEvent: noop,
  deleteEvent: noop,
};

const AgendaContext = createContext<AgendaContextType>(DEFAULT_AGENDA_CTX);

// Intervalo visível de cada visão, em dias, usado só pra calcular o range da API —
// a UI de cada visão decide sua própria grade a partir de currentDate (Task 9/10).
function rangeForView(view: AgendaView, currentDate: Date): { from: Date; to: Date } {
  const from = new Date(currentDate);
  const to = new Date(currentDate);
  if (view === 'day') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'workweek' || view === 'week') {
    const day = from.getDay(); // 0=domingo — semana começa no domingo, igual ao MiniCalendar
    // `1 - day` funciona pra todo dia da semana sem caso especial: se hoje é domingo
    // (day=0), dá +1 (a segunda-feira já é da MESMA semana, que começou hoje); se é
    // sábado (day=6), dá -5 (volta pra segunda dessa semana).
    const startOffset = view === 'workweek' ? 1 - day : -day;
    from.setDate(from.getDate() + startOffset);
    from.setHours(0, 0, 0, 0);
    to.setTime(from.getTime());
    to.setDate(to.getDate() + (view === 'workweek' ? 4 : 6));
    to.setHours(23, 59, 59, 999);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    to.setMonth(to.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

export const AgendaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = usePermissions();
  const [state, dispatch] = useReducer(agendaReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadEvents = useCallback(async () => {
    const uid = userProfile?.uid;
    if (!uid) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const { from, to } = rangeForView(stateRef.current.view, new Date(stateRef.current.currentDate));
      const result = await AgendaService.getEvents(stateRef.current.selectedAccountId, from.toISOString(), to.toISOString());
      dispatch({ type: 'SET_EVENTS', payload: { events: result.events, needsReauth: Boolean(result.needsReauth) } });
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar eventos.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  useEffect(() => {
    loadEvents();
  }, [state.selectedAccountId, state.view, state.currentDate, loadEvents]);

  const selectAccount = useCallback((accountId: string) => {
    dispatch({ type: 'SET_ACCOUNT', payload: accountId });
  }, []);

  const setView = useCallback((view: AgendaView) => {
    dispatch({ type: 'SET_VIEW', payload: view });
  }, []);

  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      dispatch({ type: 'SET_DATE', payload: new Date().toISOString() });
      return;
    }
    const current = new Date(stateRef.current.currentDate);
    const delta = direction === 'next' ? 1 : -1;
    if (stateRef.current.view === 'day') current.setDate(current.getDate() + delta);
    else if (stateRef.current.view === 'workweek' || stateRef.current.view === 'week') current.setDate(current.getDate() + delta * 7);
    else current.setMonth(current.getMonth() + delta);
    dispatch({ type: 'SET_DATE', payload: current.toISOString() });
  }, []);

  const goToDate = useCallback((isoDate: string) => {
    dispatch({ type: 'SET_DATE', payload: isoDate });
  }, []);

  const createEvent = useCallback(async (payload: Omit<CreateEventPayload, 'userId' | 'accountId'>): Promise<boolean> => {
    const uid = userProfile?.uid;
    if (!uid) return false;
    try {
      await AgendaService.createEvent({
        ...payload,
        accountId: stateRef.current.selectedAccountId === 'internal' ? null : stateRef.current.selectedAccountId,
      });
      await loadEvents();
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao criar evento.' });
      return false;
    }
  }, [userProfile?.uid, loadEvents]);

  const updateEvent = useCallback(async (id: string, payload: UpdateEventPayload): Promise<boolean> => {
    try {
      await AgendaService.updateEvent(id, payload);
      await loadEvents();
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao editar evento.' });
      return false;
    }
  }, [loadEvents]);

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    try {
      await AgendaService.deleteEvent(id);
      await loadEvents();
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao excluir evento.' });
      return false;
    }
  }, [loadEvents]);

  return (
    <AgendaContext.Provider
      value={{ state, selectAccount, setView, navigate, goToDate, createEvent, updateEvent, deleteEvent }}
    >
      {children}
    </AgendaContext.Provider>
  );
};

export const useAgenda = (): AgendaContextType => useContext(AgendaContext);
