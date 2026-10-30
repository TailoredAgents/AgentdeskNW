import type {RelationshipGuidance} from '../lib/relationship-method-contracts';
export function WorkingMethod({guidance}:{guidance:RelationshipGuidance|null|undefined}){
 if(!guidance)return null;
 return <details className="relationship-method"><summary>Suggested approach · {guidance.method.title}</summary><p>{guidance.method.objective}</p><strong>A useful question</strong><p>{guidance.question}</p><ol>{guidance.checks.map(step=><li key={step}>{step}</li>)}</ol><strong>Confirm before acting</strong><ul>{guidance.method.requiredFacts.map(fact=><li key={fact}>{fact}</li>)}</ul><p className="subtle-note">{guidance.method.source.title} · version {guidance.method.version} · {guidance.method.source.revision}</p><p className="subtle-note">{guidance.notice}</p></details>;
}
