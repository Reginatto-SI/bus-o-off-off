

# Fix Build Errors in Fleet.tsx

## Problem

`fetchTemplateItems` is declared twice (lines 489-505 and 507-523). The second declaration is a stale copy that also lacks `category` and `tags` fields, causing both a redeclaration error and a type mismatch.

## Fix

Delete the duplicate function block (lines 507-523). The first declaration (lines 489-505) already selects all required fields including `category` and `tags`, and correctly casts to `TemplatePreviewItem[]`.

**Single edit:** Remove lines 507-523 from `src/pages/admin/Fleet.tsx`.

