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
import RoadmapPage from "../pages/RoadmapPage";
import AdminRoadmapPage from "../pages/AdminRoadmapPage";

const IS_STAGING = window.location.hostname.includes("staging");

export default function Router() {
  const isStaging = typeof window !== "undefined" && window.location.hostname.includes("staging");
  return (
    <BrowserRouter>
      {isStaging && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "repeating-linear-gradient(135deg, #f59e0b 0px, #f59e0b 10px, #92400e 10px, #92400e 20px)",
          color: "#fff", textAlign: "center", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 0",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}>
          ⚠ Staging Environment — Not Production ⚠
        </div>
      )}
      <div style={isStaging ? { paddingTop: 24 } : undefined}>
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
          <Route path="/roadmap" element={<RoadmapPage />} />
<Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/access" element={<AdminAccessPage />} />
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route path="/admin/solutions" element={<AdminSolutionsPage />} />
          <Route path="/admin/optimize" element={<AdminOptimizePage />} />
          <Route path="/admin/labor" element={<AdminLaborPage />} />
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
          <Route path="/admin/roadmap" element={<AdminRoadmapPage />} />
          <Route element={<SupportWrapper />}>
            <Route path="/support/cases" element={<SupportCasesPage />} />
            <Route path="/support/cases/new" element={<SupportNewCasePage />} />
            <Route path="/support/cases/confirmation" element={<SupportCaseConfirmationPage />} />
            <Route path="/support/cases/:id" element={<SupportCaseDetailPage />} />
          </Route>
        </Route>
      </Routes>
      </div>
    </BrowserRouter>
  );
}
