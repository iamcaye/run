import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type * as s from "@/server/db/schema";

/** Server-controlled columns callers may never set. */
type Managed = "id" | "userId" | "createdAt" | "updatedAt";

export type Settings = InferSelectModel<typeof s.userSettings>;
export type SettingsPatch = Partial<Omit<InferInsertModel<typeof s.userSettings>, Managed>>;

export type Goal = InferSelectModel<typeof s.goal>;
export type GoalInput = Omit<InferInsertModel<typeof s.goal>, Managed | "status">;
export type GoalPatch = Partial<Omit<InferInsertModel<typeof s.goal>, Managed | "status">>;
export type GoalStatus = Goal["status"];

export type PlannedSession = InferSelectModel<typeof s.plannedSession>;
export type PlannedSessionInput = Omit<InferInsertModel<typeof s.plannedSession>, Managed>;
export type PlannedSessionPatch = Partial<Omit<PlannedSessionInput, "goalId">>;

export type Activity = InferSelectModel<typeof s.activity>;
export type ActivityInput = Omit<InferInsertModel<typeof s.activity>, Managed>;
export type ActivityPatch = Partial<Pick<ActivityInput, "rpe" | "notes" | "plannedSessionId">>;
export type RoutePoint = InferSelectModel<typeof s.routePoint>;

export type ImportToken = InferSelectModel<typeof s.importToken>;
/** Never expose the hash beyond the DAL. */
export type ImportTokenSummary = Omit<ImportToken, "tokenHash">;

export type RawImport = InferSelectModel<typeof s.rawImport>;
export type RawImportSummary = Omit<RawImport, "payload">;

export type PlanAdjustment = InferSelectModel<typeof s.planAdjustment>;
export type PlanAdjustmentInput = Omit<InferInsertModel<typeof s.planAdjustment>, Managed | "status">;
export type AdjustmentStatus = PlanAdjustment["status"];
