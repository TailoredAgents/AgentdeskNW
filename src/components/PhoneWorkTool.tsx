'use client';

import type {Bootstrap} from '@/lib/contracts';
import type {WorkToolSection} from '@/lib/role-experience';
import type {WorkspaceDestination} from '@/lib/workspace-links';
import {HandoffsPanel} from './HandoffsPanel';
import {OpportunitiesPanel} from './OpportunitiesPanel';
import {AnalysisPanel} from './AnalysisPanel';
import {AcquisitionIntakePanel} from './AcquisitionIntakePanel';

/** Phone navigation selects a single existing tool; its service/reviews are unchanged. */
export function PhoneWorkTool({tool,data,opportunityId,handoffId,analysisId,onOpen,onAsk,onChange}:{tool:WorkToolSection;data:Bootstrap;opportunityId?:string;handoffId?:string;analysisId?:string;onOpen:(target:WorkspaceDestination)=>void;onAsk:(text:string)=>void;onChange:(message?:string)=>Promise<void>}){
  if(tool==='handoffs')return <HandoffsPanel initialId={handoffId} onOpenOpportunity={id=>onOpen({kind:'opportunity',id})}/>;
  if(tool==='analysis')return <AnalysisPanel initialId={analysisId}/>;
  if(data.actor.role==='dispositions')return <p>This intake section is unavailable for your role.</p>;
  if(tool==='opportunities')return <OpportunitiesPanel initialId={opportunityId} onAsk={onAsk} onOpenHandoff={id=>onOpen({kind:'handoff',id})} onOpenAnalysis={id=>onOpen({kind:'analysis',id})}/>;
  return <AcquisitionIntakePanel data={data} onChange={onChange}/>;
}
