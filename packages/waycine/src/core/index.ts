/**
 * Waycine core: platform-neutral engine code. This entry is compiled with
 * lib ES2022 and no DOM, so anything that touches a real canvas or the file
 * system belongs in `waycine/browser` or `waycine/node`.
 *
 * Pipeline: `validateProject(json)` -> `compile(project, backend, opts)` ->
 * `sceneAt(compiled, frame)` -> `drawScene(ctx, compiled, state, backend)`;
 * `renderFrame` = `drawScene` of `sceneAt`.
 */

/** Engine version. Kept equal to the `version` field of this package. */
export const VERSION = '0.1.0';

export { type CompileOptions, compile } from './compile.js';
export type {
  Backend,
  CompositeOperationValue,
  Ctx2D,
  DrawableSource,
  FontKerningValue,
  ImageDataLike,
  LineCapValue,
  LineJoinValue,
  SmoothingQualityValue,
  Surface,
  SurfaceOptions,
  TextAlignValue,
  TextBaselineValue,
  TextMetricsLike,
} from './ctx.js';
export { drawScene } from './draw/index.js';
export { BUNDLED_FONTS, type BundledFont, ORIGINAL_CAP_TOP_EM } from './fonts.js';
export { type PickedPlace, pickPlace } from './pick.js';
export { renderFrame } from './render.js';
export { sceneAt } from './scene.js';
export type {
  Cam,
  CardState,
  Compiled,
  CompileWarning,
  DescriptionState,
  PostState,
  Pulse,
  ResolvedResult,
  ResolvedStop,
  SceneState,
  SegmentKind,
  SegmentRef,
  StatsState,
  TimelineSegment,
  TitleState,
} from './scene-types.js';
export { createDefaultProject, DEFAULTS } from './schema/defaults.js';
export {
  FIELD_BY_PATH,
  FIELDS,
  type FieldDef,
  type FieldKind,
  type FieldLevel,
  type FieldUnit,
  SECTIONS,
  type SectionDef,
  type SectionId,
} from './schema/fields.js';
export {
  DEFAULT_LAYOUTS,
  LANDSCAPE_LAYOUT,
  PORTRAIT_LAYOUT,
  SQUARE_LAYOUT,
} from './schema/layouts.js';
export { type MigrationResult, migrateProject } from './schema/migrate.js';
export {
  duScale,
  evenOutputSide,
  type FpsRational,
  type FrameSize,
  fpsRational,
  MAX_OUTPUT_SIDE,
  MIN_OUTPUT_SIDE,
  outputSize,
  pickProfile,
  QUALITY_BPP,
  targetBitrate,
} from './schema/output.js';
export { ORCHID, THEMES, type ThemePreset, themeIdFor } from './schema/themes.js';
export {
  ASPECTS,
  type Aspect,
  BULGE_SIDES,
  type BulgeSide,
  CARD_PLACEMENTS,
  type CameraSettings,
  type CardBarSettings,
  type CardLineSettings,
  type CardPlacement,
  type CardSettings,
  DESCRIPTION_PLACES,
  type DescriptionPlace,
  EASINGS,
  type Easing,
  EXPORT_MODES,
  type ExportMode,
  type FinaleTiming,
  type FitTextSlot,
  FLASH_TARGETS,
  type FlashTarget,
  FONT_SOURCES,
  type FontRef,
  type FontSource,
  type Fonts,
  FPS_VALUES,
  type Fps,
  type GraticuleSettings,
  type Hex,
  type HudSettings,
  type IssueCode,
  type IssueLevel,
  LABEL_FORMATS,
  LAYOUT_CHOICES,
  type LabelFormat,
  type Layout,
  type LayoutCard,
  type LayoutChoice,
  type LayoutFit,
  type LayoutPinLabels,
  type LayoutSafeArea,
  type LayoutStats,
  type Layouts,
  type LayoutTitle,
  LEADER_KINDS,
  type LeaderKind,
  MAX_LAT,
  MAX_STOPS,
  MEDALS,
  type Medal,
  type MedalColors,
  type OutputSettings,
  type OverviewTiming,
  PIN_LABEL_ORDERS,
  PIN_LABEL_PLACEMENTS,
  type PinLabelOrder,
  type PinLabelPlacement,
  type PinLabelSettings,
  type PinSettings,
  PROFILE_IDS,
  type ProfileId,
  type ProjectMeta,
  QUALITIES,
  type Quality,
  RESULT_LAYOUTS,
  type ResultLayout,
  type RouteSettings,
  SCHEMA_VERSION,
  SHORT_SIDES,
  type ShortSide,
  STAT_SOURCES,
  STATS_DIRECTIONS,
  STEP_MODES,
  type StatItem,
  type StatSource,
  type StatsDirection,
  type StatsSettings,
  type StepMode,
  type Stop,
  type StopResult,
  type StopTiming,
  SUPERSAMPLES,
  type Supersample,
  type TextSettings,
  type TextSlot,
  type Theme,
  type Timing,
  TRANSITION_MODES,
  type TransitionMode,
  type TransitionTiming,
  type ValidationIssue,
  type ValidationResult,
  type Vec2,
  type WaycineProject,
  ZOOM_INTERPS,
  type ZoomInterp,
} from './schema/types.js';
export { validateProject } from './schema/validate.js';
// Text tokens as compile fills them (the web editor shows "Shows as: 7 RACES / 5 STATES").
export { computeStats, type JourneyStats, statTokenValues } from './stats.js';
export { replaceTokens, type TokenValues } from './tokens.js';
// The transition choice as the editor shows it (Fly, Flash to white, Dip to dark, Flash colour).
export {
  applyTransitionStyle,
  TRANSITION_STYLES,
  type TransitionStyle,
  transitionStyle,
} from './transition.js';
