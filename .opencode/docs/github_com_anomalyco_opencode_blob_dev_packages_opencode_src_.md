# opencode/packages/opencode/src/session/session.ts at dev · anomalyco/opencode · GitHub

> Source: https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts
> Cached: 2026-08-14T14:50:16.302Z

---

Uh oh!

              There was an error while loading. [Please reload this page]().

  
  

    

  

  

      

        
            
  
      
    

    
    
      
        anomalyco
    
    /
    
      [opencode](/anomalyco/opencode)
    

    Public
  

        

        
            

    
      

  
                
    
Notifications
    You must be signed in to change notification settings

  

  
              
    
Fork
    25.4k

  

  
        
            
    

          Star
          197k

  

        
      

        

          

  

      
  
    
              
    

        Code
          

    

      
  
    
              
    

        Issues
          3.9k

    

      
  
    
              
    

        Pull requests
          1.3k

    

      
  
    
              
    

        Actions
          

    

      
  
    
              
    

        Projects
          

    

      
  
    
              
    

        Security and quality
          2

    

      
  
    
              
    

        Insights
          

    

          
  
      
    

Additional navigation options

  
    
                
  
    

        
    
    
    
        
          
    

        
      
        
          Code
      

  

        
    
    
    
        
          
    

        
      
        
          Issues
      

  

        
    
    
    
        
          
    

        
      
        
          Pull requests
      

  

        
    
    
    
        
          
    

        
      
        
          Actions
      

  

        
    
    
    
        
          
    

        
      
        
          Projects
      

  

        
    
    
    
        
          
    

        
      
        
          Security and quality
      

  

        
    
    
    
        
          
    

        
      
        
          Insights
      

  

    

      
  

  
  

    
    

    
      
    

  
  
    [](/anomalyco/opencode)   ## FilesExpand file tree

dev## Breadcrumbs

- [opencode](/anomalyco/opencode/tree/dev)
- /[packages](/anomalyco/opencode/tree/dev/packages)
- /[opencode](/anomalyco/opencode/tree/dev/packages/opencode)
- /[src](/anomalyco/opencode/tree/dev/packages/opencode/src)
- /[session](/anomalyco/opencode/tree/dev/packages/opencode/src/session)

/# session.ts

Copy pathBlameMore file actionsBlameMore file actions ## Latest commit

 ## History

[History](/anomalyco/opencode/commits/dev/packages/opencode/src/session/session.ts)[](/anomalyco/opencode/commits/dev/packages/opencode/src/session/session.ts)History1018 lines (932 loc) · 34.7 KBdev## Breadcrumbs

- [opencode](/anomalyco/opencode/tree/dev)
- /[packages](/anomalyco/opencode/tree/dev/packages)
- /[opencode](/anomalyco/opencode/tree/dev/packages/opencode)
- /[src](/anomalyco/opencode/tree/dev/packages/opencode/src)
- /[session](/anomalyco/opencode/tree/dev/packages/opencode/src/session)

/# session.ts

Copy pathTop## File metadata and controls

- Code
- Blame

1018 lines (932 loc) · 34.7 KB[Raw](https://github.com/anomalyco/opencode/raw/refs/heads/dev/packages/opencode/src/session/session.ts)Copy raw fileDownload raw fileOpen symbols panelEdit and raw actions1234567891011121314151617181920212223242526272829303132333435363738394041424344454647484950515253545556575859606162636465666768697071727374757677787980818283848586878889909192939495969798991001011021031041051061071081091101111121131141151161171181191201211221231241251261271281291301311321331341351361371381391401411421431441451461471481491501511521531541551561571581591601611621631641651661671681691701711721731741751761771781791801811821831841851861871881891901911921931941951961971981992002012022032042052062072082092102112122132142152162172182192202212222232242252262272282292302312322332342352362372382392402412422432442452462472482492502512522532542552562572582592602612622632642652662672682692702712722732742752762772782792802812822832842852862872882892902912922932942952962972982993003013023033043053063073083093103113123133143153163173183193203213223233243253263273283293303313323333343353363373383393403413423433443453463473483493503513523533543553563573583593603613623633643653663673683693703713723733743753763773783793803813823833843853863873883893903913923933943953963973983994004014024034044054064074084094104114124134144154164174184194204214224234244254264274284294304314324334344354364374384394404414424434444454464474484494504514524534544554564574584594604614624634644654664674684694704714724734744754764774784794804814824834844854864874884894904914924934944954964974984995005015025035045055065075085095105115125135145155165175185195205215225235245255265275285295305315325335345355365375385395405415425435445455465475485495505515525535545555565575585595605615625635645655665675685695705715725735745755765775785795805815825835845855865875885895905915925935945955965975985996006016026036046056066076086096106116126136146156166176186196206216226236246256266276286296306316326336346356366376386396406416426436446456466476486496506516526536546556566576586596606616626636646656666676686696706716726736746756766776786796806816826836846856866876886896906916926936946956966976986997007017027037047057067077087097107117127137147157167177187197207217227237247257267277287297307317327337347357367377387397407417427437447457467477487497507517527537547557567577587597607617627637647657667677687697707717727737747757767777787797807817827837847857867877887897907917927937947957967977987998008018028038048058068078088098108118128138148158168178188198208218228238248258268278288298308318328338348358368378388398408418428438448458468478488498508518528538548558568578588598608618628638648658668678688698708718728738748758768778788798808818828838848858868878888898908918928938948958968978988999009019029039049059069079089099109119129139149159169179189199209219229239249259269279289299309319329339349359369379389399409419429439449459469479489499509519529539549559569579589599609619629639649659669679689699709719729739749759769779789799809819829839849859869879889899909919929939949959969979989991000import { LayerNode } from "@opencode-ai/core/effect/layer-node"import { PermissionV1 } from "@opencode-ai/core/v1/permission"import { Slug } from "@opencode-ai/core/util/slug"import { SessionV1 } from "@opencode-ai/core/v1/session"import { serviceUse } from "@opencode-ai/core/effect/service-use"import path from "path"import { BackgroundJob } from "@/background/job"import { Decimal } from "decimal.js"import type { ProviderMetadata, Usage } from "@opencode-ai/llm"import { InstallationVersion } from "@opencode-ai/core/installation/version"import { Database } from "@opencode-ai/core/database/database"import { EventV2Bridge } from "@/event-v2-bridge"import { SessionV2 } from "@opencode-ai/core/session"import * as SessionExecutionLocal from "@opencode-ai/core/session/execution/local"import { locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { NotFoundError } from "@/storage/storage"import { eq } from "drizzle-orm"import { and } from "drizzle-orm"import { gte } from "drizzle-orm"import { isNull } from "drizzle-orm"import { desc } from "drizzle-orm"import { like } from "drizzle-orm"import { sql } from "drizzle-orm"import { inArray } from "drizzle-orm"import { lt } from "drizzle-orm"import { or } from "drizzle-orm"import type { SQL } from "drizzle-orm"import { PartTable, SessionTable } from "@opencode-ai/core/session/sql"import { ProjectTable } from "@opencode-ai/core/project/sql"import { MessageV2 } from "./message-v2"import type { InstanceContext } from "../project/instance-context"import { InstanceState } from "@/effect/instance-state"import { Snapshot } from "@/snapshot"import { ProjectV2 } from "@opencode-ai/core/project"import { WorkspaceV2 } from "@opencode-ai/core/workspace"import { SessionID, MessageID, PartID } from "./schema"
import type { Provider } from "@/provider/provider"import { Global } from "@opencode-ai/core/global"import { Effect, Layer, Option, Context, Schema, Types } from "effect"import { NonNegativeInt, optional } from "@opencode-ai/core/schema"import { RuntimeFlags } from "@/effect/runtime-flags"import { ProviderV2 } from "@opencode-ai/core/provider"import { ModelV2 } from "@opencode-ai/core/model"import { SessionMessage } from "@opencode-ai/schema/session-message"
const parentTitlePrefix = "New session - "const childTitlePrefix = "Child session - "
export function isDefaultTitle(title: string) {  return new RegExp(    `^(${parentTitlePrefix}|${childTitlePrefix})\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`,  ).test(title)}
type SessionRow = typeof SessionTable.$inferSelect
export function fromRow(row: SessionRow): Info {  const summary =    row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null      ? {          additions: row.summary_additions ?? 0,          deletions: row.summary_deletions ?? 0,          files: row.summary_files ?? 0,          diffs: row.summary_diffs ?? undefined,        }      : undefined  const share = row.share_url ? { url: row.share_url } : undefined  const revert = row.revert    ? {        messageID: MessageID.make(row.revert.messageID),        partID: row.revert.partID ? PartID.make(row.revert.partID) : undefined,        snapshot: row.revert.snapshot,        diff: row.revert.diff,      }    : undefined  return {    id: row.id,    slug: row.slug,    projectID: row.project_id,    workspaceID: row.workspace_id ?? undefined,    directory: row.directory,    path: row.path ?? undefined,    parentID: row.parent_id ?? undefined,    title: row.title,    agent: row.agent ?? undefined,    model: row.model      ? {          id: ModelV2.ID.make(row.model.id),          providerID: ProviderV2.ID.make(row.model.providerID),          variant: row.model.variant,        }      : undefined,    version: row.version,    summary,    cost: row.cost,    tokens: {      input: row.tokens_input,      output: row.tokens_output,      reasoning: row.tokens_reasoning,      cache: {        read: row.tokens_cache_read,        write: row.tokens_cache_write,      },    },    share,    metadata: row.metadata ?? undefined,    revert,    permission: row.permission ? [...row.permission] : undefined,    time: {      created: row.time_created,      updated: row.time_updated,      compacting: row.time_compacting ?? undefined,      archived: row.time_archived ?? undefined,    },  }}
export function toRow(info: Info) {  return {    id: info.id,    project_id: info.projectID,    workspace_id: info.workspaceID,    parent_id: info.parentID,    slug: info.slug,    directory: info.directory,    path: info.path,    title: info.title,    agent: info.agent,    model: info.model,    version: info.version,    share_url: info.share?.url,    summary_additions: info.summary?.additions,    summary_deletions: info.summary?.deletions,    summary_files: info.summary?.files,    summary_diffs: info.summary?.diffs,    metadata: info.metadata,    cost: info.cost ?? 0,    tokens_input: (info.tokens ?? EmptyTokens).input,    tokens_output: (info.tokens ?? EmptyTokens).output,    tokens_reasoning: (info.tokens ?? EmptyTokens).reasoning,    tokens_cache_read: (info.tokens ?? EmptyTokens).cache.read,    tokens_cache_write: (info.tokens ?? EmptyTokens).cache.write,    revert: info.revert      ? {          messageID: SessionMessage.ID.make(info.revert.messageID),          partID: info.revert.partID,          snapshot: info.revert.snapshot,          diff: info.revert.diff,        }      : null,    permission: info.permission,    time_created: info.time.created,    time_updated: info.time.updated,    time_compacting: info.time.compacting,    time_archived: info.time.archived,  }}
function getForkedTitle(title: string): string {  const match = title.match(/^(.+) \(fork #(\d+)\)$/)  if (match) {    const base = match[1]    const num = parseInt(match[2], 10)    return `${base} (fork #${num + 1})`  }  return `${title} (fork #1)`}
function sessionPath(worktree: string, cwd: string) {  return path.relative(path.resolve(worktree), cwd).replaceAll("\\", "/")}
const Summary = Schema.Struct({  additions: Schema.Finite,  deletions: Schema.Finite,  files: Schema.Finite,  diffs: optional(Schema.Array(Snapshot.FileDiff)),})
const Tokens = Schema.Struct({  input: Schema.Finite,  output: Schema.Finite,  reasoning: Schema.Finite,  cache: Schema.Struct({    read: Schema.Finite,    write: Schema.Finite,  }),})
const EmptyTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
const Share = Schema.Struct({  url: Schema.String,})
// Legacy HTTP accepted negative values here. Keep archive timestamps permissive// while excluding non-finite values that cannot round-trip through JSON.export const ArchivedTimestamp = Schema.Finite
const Time = Schema.Struct({  created: NonNegativeInt,  updated: NonNegativeInt,  compacting: optional(NonNegativeInt),  archived: optional(ArchivedTimestamp),})
const Revert = Schema.Struct({  messageID: MessageID,  partID: optional(PartID),  snapshot: optional(Schema.String),  diff: optional(Schema.String),})
const Model = Schema.Struct({  id: ModelV2.ID,  providerID: ProviderV2.ID,  variant: optional(Schema.String),})
export const Metadata = Schema.Record(Schema.String, Schema.Any)
export const Info = Schema.Struct({  id: SessionID,  slug: Schema.String,  projectID: ProjectV2.ID,  workspaceID: optional(WorkspaceV2.ID),  directory: Schema.String,  path: optional(Schema.String),  parentID: optional(SessionID),  summary: optional(Summary),  cost: optional(Schema.Finite),  tokens: optional(Tokens),  share: optional(Share),  title: Schema.String,  agent: optional(Schema.String),  model: optional(Model),  version: Schema.String,  metadata: optional(Metadata),  time: Time,  permission: optional(PermissionV1.Ruleset),  revert: optional(Revert),}).annotate({ identifier: "Session" })export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>
export const ProjectInfo = Schema.Struct({  id: ProjectV2.ID,  name: optional(Schema.String),  worktree: Schema.String,}).annotate({ identifier: "ProjectSummary" })export type ProjectInfo = Types.DeepMutable<Schema.Schema.Type<typeof ProjectInfo>>
export const GlobalInfo = Schema.Struct({  ...Info.fields,  project: Schema.NullOr(ProjectInfo),}).annotate({ identifier: "GlobalSession" })export type GlobalInfo = Types.DeepMutable<Schema.Schema.Type<typeof GlobalInfo>>
export const CreateInput = Schema.optional(  Schema.Struct({    parentID: Schema.optional(SessionID),    title: Schema.optional(Schema.String),    agent: Schema.optional(Schema.String),    model: Schema.optional(Model),    metadata: Schema.optional(Metadata),    permission: Schema.optional(PermissionV1.Ruleset),    workspaceID: Schema.optional(WorkspaceV2.ID),  }),)export type CreateInput = Types.DeepMutable<Schema.Schema.Type<typeof CreateInput>>
export const ForkInput = Schema.Struct({  sessionID: SessionID,  messageID: Schema.optional(M

... [Content truncated]