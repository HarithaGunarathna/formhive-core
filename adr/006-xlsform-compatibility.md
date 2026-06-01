# ADR-006: XLSForm compatibility

**Status:** Accepted
**Date:** 2025-01-15

## Context

The data collection sector has converged on XLSForm as the standard for defining form schemas. KoboToolbox, ODK, and SurveyCTO all use it. The target organisations (government departments, agricultural ministries, NGOs) have years of existing forms in this format.

## Decision

Use XLSForm type names for field types in the schema API: `text`, `decimal`, `integer`, `select_one`, `select_multiple`, `date`, `geopoint`, `image`, `audio` — rather than inventing custom type names.

## Reasons

- Zero migration cost for organisations moving from KoboToolbox or ODK — their existing form definitions can be imported directly
- Signals credibility to the NGO and government sector immediately, before any features are built
- XLSForm is a specification, not a dependency — adopting the type names costs nothing at the code level
- Differentiates from generic survey tools (Typeform, SurveyMonkey) which use non-standard field type names

## Alternatives considered

**Custom type names** — rejected because it creates an unnecessary barrier to adoption from the existing ODK/KoboToolbox ecosystem. Organisations would need to remap their existing schemas on import.

**Building on ODK Central directly** — rejected because ODK Central is built around the enumerator model (a field worker collects data face-to-face), not the push model Formhive uses. Starting from ODK Central would inherit its architectural assumptions.

## Consequences

- The validator service maps XLSForm types to JSON Schema types (`decimal` → `number`, `select_one` → `string` with enum, etc.)
- Field type names in API documentation must match the XLSForm specification exactly
- Future: an ODK Collect compatibility endpoint (Phase 4) becomes easier because the form schema is already XLSForm-compatible
