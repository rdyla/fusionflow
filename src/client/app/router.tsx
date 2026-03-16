import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import ModuleSelectPage from "../pages/ModuleSelectPage";
import DashboardPage from "../pages/DashboardPage";
import ProjectsPage from "../pages/ProjectsPage";
import ProjectDetailPage from "../pages/ProjectDetailPage";
import AdminUsersPage from "../pages/AdminUsersPage";
import AdminAccessPage from "../pages/AdminAccessPage";
import AdminProjectsPage from "../pages/AdminProjectsPage";
import AdminSolutionsPage from "../pages/AdminSolutionsPage";
import SolutionsPage from "../pages/SolutionsPage";
import SolutionDetailPage from "../pages/SolutionDetailPage";

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Module selection — full page, no app shell */}
        <Route path="/" element={<ModuleSelectPage />} />

        {/* Implementation module */}
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/solutions" element={<SolutionsPage />} />
          <Route path="/solutions/:id" element={<SolutionDetailPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/access" element={<AdminAccessPage />} />
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route path="/admin/solutions" element={<AdminSolutionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
