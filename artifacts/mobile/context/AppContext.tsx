import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { institutions } from '@/data/compliance';

type Status = 'open' | 'complete' | 'flagged';
type State = { institutionId: string; statuses: Record<string, Status> };
type Value = State & { ready: boolean; setInstitutionId:(id:string)=>void; setStatus:(id:string,status:Status)=>void; resetRound:()=>void };
const STORAGE_KEY = 'cms-compliance-mobile-round-v1';
const initial: State = { institutionId: institutions[0].id, statuses: {} };
const AppContext = createContext<Value | null>(null);
export function AppProvider({children}:{children:ReactNode}) {
 const [state,setState] = useState<State>(initial); const [ready,setReady] = useState(false);
 useEffect(()=>{ AsyncStorage.getItem(STORAGE_KEY).then(raw=>{ if(raw) setState(JSON.parse(raw) as State); }).catch(()=>{}).finally(()=>setReady(true)); },[]);
 const save = (next:State) => { setState(next); void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };
 const value = useMemo<Value>(()=>({...state,ready,setInstitutionId:(institutionId)=>save({...state,institutionId}),setStatus:(id,status)=>save({...state,statuses:{...state.statuses,[id]:status}}),resetRound:()=>save({...state,statuses:{}})}),[state,ready]);
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp(){ const value=useContext(AppContext); if(!value) throw new Error('useApp must be inside AppProvider'); return value; }
