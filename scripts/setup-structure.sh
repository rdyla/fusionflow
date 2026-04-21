#!/bin/bash

echo "Creating CloudConnect folder structure..."

mkdir -p src/client/app
mkdir -p src/client/components/layout
mkdir -p src/client/components/dashboard
mkdir -p src/client/components/projects
mkdir -p src/client/components/timeline
mkdir -p src/client/components/tasks
mkdir -p src/client/components/risks
mkdir -p src/client/components/activity
mkdir -p src/client/components/ui

mkdir -p src/client/features/auth
mkdir -p src/client/features/dashboard
mkdir -p src/client/features/projects
mkdir -p src/client/features/admin

mkdir -p src/client/pages

mkdir -p src/client/lib
mkdir -p src/client/styles

mkdir -p src/server/middleware
mkdir -p src/server/routes
mkdir -p src/server/services
mkdir -p src/server/db
mkdir -p src/server/types

mkdir -p migrations
mkdir -p scripts

touch src/server/index.ts

touch src/server/middleware/auth.ts
touch src/server/middleware/requireRole.ts
touch src/server/middleware/requestContext.ts

touch src/server/routes/auth.ts
touch src/server/routes/dashboard.ts
touch src/server/routes/projects.ts
touch src/server/routes/phases.ts
touch src/server/routes/milestones.ts
touch src/server/routes/tasks.ts
touch src/server/routes/risks.ts
touch src/server/routes/notes.ts
touch src/server/routes/admin.ts

touch src/server/services/dashboardService.ts
touch src/server/services/projectService.ts
touch src/server/services/timelineService.ts
touch src/server/services/taskService.ts
touch src/server/services/riskService.ts
touch src/server/services/noteService.ts
touch src/server/services/accessService.ts

touch src/server/db/schema.ts
touch src/server/db/client.ts
touch src/server/db/seed.ts

touch src/client/pages/LoginPage.tsx
touch src/client/pages/DashboardPage.tsx
touch src/client/pages/ProjectsPage.tsx
touch src/client/pages/ProjectDetailPage.tsx
touch src/client/pages/AdminUsersPage.tsx
touch src/client/pages/AdminAccessPage.tsx

echo "CloudConnect structure created!"