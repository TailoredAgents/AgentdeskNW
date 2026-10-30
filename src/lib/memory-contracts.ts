/** Preferences explicitly supplied by the employee; never inferred personality traits. */
export type EmployeeMemoryKey = 'tone' | 'length' | 'avoidPhrases' | 'priorities';
export interface EmployeePreferences {
 tone:'direct'|'warm'|null;
 length:'concise'|'detailed'|null;
 avoidPhrases:string[];
 priorities:string[];
}
export interface EmployeeMemory extends EmployeePreferences {
 version:number;
 updatedAt:string|null;
 forgottenAt:string|null;
 sources:Partial<Record<EmployeeMemoryKey,{text:string;updatedAt:string}>>;
}
export interface EmployeeMemoryInput extends Partial<EmployeePreferences> {
 sourceText?:string;
 expectedVersion?:number;
}
