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
/** The owner (goal or follow) is passed separately; callers never set `goalId`/`followId`. */
export type PlannedSessionInput = Omit<InferInsertModel<typeof s.plannedSession>, Managed | "goalId" | "followId">;
export type PlannedSessionPatch = Partial<PlannedSessionInput>;
/** A planned session belongs to exactly one of these (DB check `planned_session_one_owner_chk`). */
export type SessionOwner = { goalId: string } | { followId: string };

export type Workout = InferSelectModel<typeof s.workout>;
export type WorkoutInput = Pick<InferInsertModel<typeof s.workout>, "name" | "type" | "notes" | "steps">;
export type WorkoutPatch = Partial<WorkoutInput>;

export type CustomPlan = InferSelectModel<typeof s.customPlan>;
export type CustomPlanInput = { name: string; description: string | null };
export type CustomPlanSave = CustomPlanInput & { doc: CustomPlan["doc"] };

export type PlanFollow = InferSelectModel<typeof s.planFollow>;
export type PlanFollowStatus = PlanFollow["status"];

export type Activity = InferSelectModel<typeof s.activity>;
/** An activity without its HR series, as returned by list queries. */
export type ActivitySummary = Omit<Activity, "hrSeries">;
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
