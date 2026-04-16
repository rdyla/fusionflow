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
import AdminOptimizePage from "../pages/AdminOptimizePage";
import AdminLaborPage from "../pages/AdminLaborPage";
import AdminTemplatesPage from "../pages/AdminTemplatesPage";
import SolutionsPage from "../pages/SolutionsPage";
import SolutionDetailPage from "../pages/SolutionDetailPage";
import OptimizePage from "../pages/OptimizePage";
import OptimizeAccountPage from "../pages/OptimizeAccountPage";
import LoginPage from "../pages/LoginPage";
import InboxPage from "../pages/InboxPage";
import CustomersPage from "../pages/CustomersPage";
import CustomerDetailPage from "../pages/CustomerDetailPage";
import ProspectingPage from "../pages/ProspectingPage";
import ProspectListDetailPage from "../pages/ProspectListDetailPage";
import CloudSupportPage from "../pages/CloudSupportPage";
import CloudSupportWorkspacePage from "../pages/CloudSupportWorkspacePage";
import SupportWrapper from "../components/layout/SupportWrapper";
import SupportCasesPage from "../pages/SupportCasesPage";
import SupportCaseDetailPage from "../pages/SupportCaseDetailPage";
import SupportNewCasePage from "../pages/SupportNewCasePage";
import SupportCaseConfirmationPage from "../pages/SupportCaseConfirmationPage";

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login — full page, no app shell, no auth required */}
        <Route path="/login" element={<LoginPage />} />

        {/* Module selection — full page, no app shell */}
        <Route path="/" element={<ModuleSelectPage />} />

        {/* Implementation module */}
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/solutions" element={<SolutionsPage />} />
          <Route path="/solutions/cloudsupport" element={<CloudSupportPage />} />
          <Route path="/solutions/cloudsupport/:id" element={<CloudSupportWorkspacePage />} />
          <Route path="/solutions/:id" element={<SolutionDetailPage />} />
          <Route path="/optimize" element={<OptimizePage />} />
          <Route path="/optimize/:projectId" element={<OptimizeAccountPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/prospecting" element={<ProspectingPage />} />
          <Route path="/prospecting/:id" element={<ProspectListDetailPage />} />
          <Route path="/inbox" element={<InboxPage />} />
<Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/access" element={<AdminAccessPage />} />
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route path="/admin/solutions" element={<AdminSolutionsPage />} />
          <Route path="/admin/optimize" element={<AdminOptimizePage />} />
          <Route path="/admin/labor" element={<AdminLaborPage />} />
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
          <Route element={<SupportWrapper />}>
            <Route path="/support/cases" element={<SupportCasesPage />} />
            <Route path="/support/cases/new" element={<SupportNewCasePage />} />
            <Route path="/support/cases/confirmation" element={<SupportCaseConfirmationPage />} />
            <Route path="/support/cases/:id" element={<SupportCaseDetailPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
