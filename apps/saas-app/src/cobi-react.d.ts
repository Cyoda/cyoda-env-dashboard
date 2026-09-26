// Ambient stub for the deprecated @cyoda/cobi-react package.
// saas-app pulls reporting-react via path alias, which transitively pulls in
// cobi-react from reporting-react's source. Stub both here so tsc can resolve
// the import without type-checking cobi-react's broken source tree.
// See docs/superpowers/plans/2026-04-18-typescript-error-cleanup.md.
declare module '@cyoda/cobi-react' {
  export const FilterBuilderGroup: any
  export const FilterBuilderCondition: any
  export type FilterCondition = any
  export type ColumnInfo = any
}

// @cyoda/ui is referenced by a few saas-app views but not installed at the
// workspace level — stub so tsc doesn't fail on the import.
declare module '@cyoda/ui' {
  export const CodeEditor: any
}
