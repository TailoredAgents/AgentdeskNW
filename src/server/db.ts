import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Actor, Investor, Property, Role, Task } from '../lib/contracts';

let database: Database.Database | undefined;
let databasePath: string | undefined;
export const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'AppError'; }
}

export function getDb(): Database.Database {
  const path = process.env.AGENTDESK_DB_PATH ?? process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data/agentdesk.sqlite');
  if (database && path === databasePath) return database;
  database?.close();
  // The runtime database is mutable data; it must not be traced into a deployment bundle.
  if (path !== ':memory:') mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), { recursive: true });
  database = new Database(path);
  databasePath = path;
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const [version, file] of [[1,'001_initial.sql'],[2,'002_voice.sql'],[3,'003_investor_intelligence.sql'],[4,'004_workflows.sql']] as const) {
    const migrationPath=resolve(process.cwd(), 'src/server/migrations',file);
    if (!existsSync(migrationPath)) continue;
    if (!database.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version)) {
      const sql = readFileSync(migrationPath, 'utf8');
      database.transaction(() => {
        database!.exec(sql);
        database!.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version,now());
      })();
    }
  }
  seed(database);
  seedPrivateDuplicate(database);
  return database;
}

export function closeDb() { database?.close(); database = undefined; databasePath = undefined; }

const actors: Record<Role, Actor> = {
  dispositions: { id:'user-alex', name:'Alex Morgan', organizationId:'org-demo', officeId:'office-atlanta', role:'dispositions' },
  acquisitions: { id:'user-jordan', name:'Jordan Lee', organizationId:'org-demo', officeId:'office-atlanta', role:'acquisitions' },
  manager: { id:'user-taylor', name:'Taylor Reed', organizationId:'org-demo', officeId:'office-atlanta', role:'manager' },
};
export function demoActor(role: Role = 'dispositions'): Actor { getDb(); return { ...actors[role] }; }

export function assertActor(actor: Actor): void {
  const membership = getDb().prepare(`SELECT u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=? AND m.office_id=? AND m.user_id=?`).get(actor.organizationId, actor.officeId, actor.id) as { name:string;role:Role } | undefined;
  if (!membership || membership.role !== actor.role || membership.name !== actor.name) throw new AppError(403, 'This identity is not authorized for the selected office.');
}
export function requireRole(actor:Actor, allowed:Role[]) { assertActor(actor); if (!allowed.includes(actor.role)) throw new AppError(403, 'Your role cannot perform this action.'); }

export type ScopedTable = 'investors'|'properties'|'conversations'|'research_jobs'|'proposed_actions'|'tasks'|'notifications';
export function scopedRows<T>(actor:Actor, table:ScopedTable, personal=false): T[] {
  assertActor(actor);
  const officeShared = table === 'properties';
  const all = officeShared || (!personal && actor.role === 'manager');
  const sql = `SELECT data FROM ${table} WHERE organization_id=? AND office_id=?${all ? '' : ' AND owner_id=?'} ORDER BY rowid DESC`;
  const args = all ? [actor.organizationId, actor.officeId] : [actor.organizationId, actor.officeId, actor.id];
  return (getDb().prepare(sql).all(...args) as {data:string}[]).map(row => JSON.parse(row.data) as T);
}
export function scopedGet<T>(actor:Actor, table:ScopedTable, id:string, personal=false): T {
  assertActor(actor);
  const all = table === 'properties' || (!personal && actor.role === 'manager');
  const row = getDb().prepare(`SELECT data FROM ${table} WHERE id=? AND organization_id=? AND office_id=?${all ? '' : ' AND owner_id=?'}`)
    .get(...(all ? [id,actor.organizationId,actor.officeId] : [id,actor.organizationId,actor.officeId,actor.id])) as {data:string}|undefined;
  if (!row) throw new AppError(404, 'The record was not found in your authorized workspace.');
  return JSON.parse(row.data) as T;
}
export function insertRecord<T extends {id:string}>(actor:Actor, table:ScopedTable, value:T): T {
  assertActor(actor);
  getDb().prepare(`INSERT INTO ${table}(id,organization_id,office_id,owner_id,data) VALUES(?,?,?,?,?)`)
    .run(value.id, actor.organizationId, actor.officeId, actor.id, JSON.stringify(value));
  return value;
}
export function updateRecord<T extends {id:string}>(actor:Actor, table:ScopedTable, value:T, personal=false): T {
  scopedGet(actor,table,value.id,personal);
  getDb().prepare(`UPDATE ${table} SET data=? WHERE id=? AND organization_id=? AND office_id=?`).run(JSON.stringify(value),value.id,actor.organizationId,actor.officeId);
  return value;
}
export function audit(actor:Actor,event:string,entityId:string|null=null,metadata:Record<string,unknown>={}) {
  assertActor(actor);
  getDb().prepare('INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?)').run(newId('audit'),actor.organizationId,actor.officeId,actor.id,event,entityId,JSON.stringify(metadata),now());
}

function seed(db:Database.Database) {
  if (db.prepare('SELECT 1 FROM organizations WHERE id=?').get('org-demo')) return;
  db.transaction(() => {
    db.prepare('INSERT INTO organizations VALUES(?,?,?)').run('org-demo','New Western · concept workspace',JSON.stringify({crm:'demo',research:'synthetic'}));
    db.prepare('INSERT INTO organizations VALUES(?,?,?)').run('org-isolation','Separate fictional brokerage','{}');
    db.prepare('INSERT INTO offices VALUES(?,?,?)').run('office-atlanta','org-demo','Atlanta, Georgia');
    db.prepare('INSERT INTO offices VALUES(?,?,?)').run('office-savannah','org-demo','Savannah, Georgia');
    db.prepare('INSERT INTO offices VALUES(?,?,?)').run('office-other','org-isolation','Independent office');
    const fixtures:Actor[] = [...Object.values(actors),{id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'}, {id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'}];
    for (const actor of fixtures) {
      db.prepare('INSERT INTO users VALUES(?,?)').run(actor.id,actor.name);
      db.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,actor.role);
    }
    const investors:Investor[] = [
      {id:'investor-mike',name:'Mike Bennett',company:'Peachtree Renewal LLC',counties:['Cobb','Cherokee'],strategy:'Fix & flip',budgetMin:150000,budgetMax:320000,financing:'Cash',rehab:'Light to medium',timeframe:null,email:'mike@example.com',phone:null,notes:'Fictional sample. Interested in a first Cobb County project this quarter. Confirm purchase timeline before proposing a property.',lastContactAt:'2026-10-24T14:00:00.000Z',ownerId:'user-alex',synthetic:true},
      {id:'investor-sarah',name:'Sarah Chen',company:'Northline Homes LLC',counties:['Fulton','DeKalb'],strategy:'Buy & hold',budgetMin:180000,budgetMax:450000,financing:'Conventional financing',rehab:'Light',timeframe:'Within 60 days',email:'sarah@example.com',phone:null,notes:'Fictional sample. Prefers rental acquisitions; requested operating-cost details before review.',lastContactAt:'2026-10-20T15:00:00.000Z',ownerId:'user-alex',synthetic:true},
      {id:'investor-david',name:'David Ortiz',company:'Oakline Property Group',counties:['Cobb','Fulton'],strategy:'Fix & flip',budgetMin:100000,budgetMax:275000,financing:null,rehab:'Heavy',timeframe:'Within 30 days',email:null,phone:null,notes:'Fictional sample. Confirm funding and contact details.',lastContactAt:'2026-10-12T10:00:00.000Z',ownerId:'user-alex',synthetic:true},
      {id:'investor-isolated',name:'Private Fixture',company:'Separate Tenant LLC',counties:['Cobb'],strategy:'Buy & hold',budgetMin:100000,budgetMax:200000,financing:null,rehab:null,timeframe:null,email:null,phone:null,notes:'Cross-tenant isolation fixture; never shown in the Atlanta workspace.',lastContactAt:null,ownerId:'user-other',synthetic:true},
    ];
    for (const investor of investors) {
      const actor=investor.ownerId==='user-other'?fixtures[3]:actors.dispositions;
      db.prepare('INSERT INTO investors VALUES(?,?,?,?,?)').run(investor.id,actor.organizationId,actor.officeId,actor.id,JSON.stringify(investor));
    }
    const properties:Property[] = [
      {id:'property-maple',address:'123 Example Street',city:'Marietta',county:'Cobb',price:235000,beds:3,baths:2,sqft:1640,strategy:'Fix & flip',rehab:'Medium',status:'Available',synthetic:true},
      {id:'property-cedar',address:'48 Sample Lane',city:'Woodstock',county:'Cherokee',price:285000,beds:4,baths:2,sqft:1920,strategy:'Fix & flip',rehab:'Light',status:'Due diligence',synthetic:true},
      {id:'property-oak',address:'720 Demo Avenue',city:'Atlanta',county:'Fulton',price:310000,beds:3,baths:2,sqft:1720,strategy:'Buy & hold',rehab:'Light',status:'Available',synthetic:true},
    ];
    for (const property of properties) db.prepare('INSERT INTO properties VALUES(?,?,?,?,?)').run(property.id,'org-demo','office-atlanta','user-jordan',JSON.stringify(property));
    const day = new Date(); day.setUTCHours(15,0,0,0);
    const tasks:Task[] = [
      {id:'task-mike',title:'Confirm Mike’s purchase timeline',dueAt:day.toISOString(),status:'open',investorId:'investor-mike',ownerId:'user-alex',createdAt:now()},
      {id:'task-sarah',title:'Prepare rental details for Sarah',dueAt:new Date(day.getTime()+86400000).toISOString(),status:'open',investorId:'investor-sarah',ownerId:'user-alex',createdAt:now()},
      {id:'task-demo',title:'Review the Marietta concept property',dueAt:null,status:'open',investorId:null,ownerId:'user-alex',createdAt:now()},
    ];
    for (const task of tasks) db.prepare('INSERT INTO tasks(id,organization_id,office_id,owner_id,investor_id,data) VALUES(?,?,?,?,?,?)').run(task.id,'org-demo','office-atlanta','user-alex',task.investorId,JSON.stringify(task));
  })();
}

/** A deliberately private fictional relationship exercises opaque duplicate detection. */
function seedPrivateDuplicate(db:Database.Database) {
 if(db.prepare('SELECT 1 FROM investors WHERE id=?').get('investor-jordan-private'))return;
 const investor:Investor={id:'investor-jordan-private',name:'Morgan Ellis',company:'Cedar & Stone Investments',counties:['Cobb'],strategy:'Fix & flip',budgetMin:200000,budgetMax:290000,financing:'Cash',rehab:'Medium',timeframe:null,email:null,phone:null,notes:'Private fictional acquisition relationship. Protected notes must never appear in another employee’s research.',lastContactAt:null,ownerId:'user-jordan',synthetic:true};
 db.prepare('INSERT INTO investors VALUES(?,?,?,?,?)').run(investor.id,'org-demo','office-atlanta','user-jordan',JSON.stringify(investor));
}
