# UniMart 4+1 UML Architecture Pack

This folder contains one UML diagram for each viewpoint in the 4+1 architectural model.

## Files

- `01-scenarios-use-case.puml`
  - Scenario / use-case view
- `02-logical-class.puml`
  - Logical view
- `03-process-sequence.puml`
  - Process view
- `04-development-component.puml`
  - Development view
- `05-physical-deployment.puml`
  - Physical view

## Mapping to the current UniMart app

- Frontend: static HTML, CSS, and JavaScript pages
- Shared client logic: `app.js`
- Auth and data access layer: `auth.js`
- External platform services:
  - Supabase Auth
  - Supabase Database
  - Supabase Storage

## Notes

- These diagrams are based on the current implemented architecture in the repository.
- PlantUML syntax is used so the diagrams can be rendered later in any PlantUML-compatible tool.
