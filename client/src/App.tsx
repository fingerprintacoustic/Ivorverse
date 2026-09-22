import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ChatFeature from "./pages/ChatFeature";
import ResearchFeature from "./pages/ResearchFeature";
import ImageFeature from "./pages/ImageFeature";
import MusicFeature from "./pages/MusicFeature";
import VoiceFeature from "./pages/VoiceFeature";
import AdminDashboard from "./pages/AdminDashboard";
import AppBuilderFeature from "./pages/AppBuilderFeature";
import VideoFeature from "./pages/VideoFeature";
import CharacterFeature from "./pages/CharacterFeature";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import AgentsFeature from "./pages/AgentsFeature";
import WorkflowsFeature from "./pages/WorkflowsFeature";
import MonetizeFeature from "./pages/MonetizeFeature";
import ProductPage from "./pages/ProductPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/signup"} component={Signup} />
      <Route path={"/forgot-password"} component={ForgotPassword} />
      <Route path={"/reset-password"} component={ResetPassword} />
      <Route path={"/verify-email"} component={VerifyEmail} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/feature/chat/:id"} component={ChatFeature} />
      <Route path={"/feature/chat"} component={ChatFeature} />
      <Route path={"/feature/research"} component={ResearchFeature} />
      <Route path={"/feature/image"} component={ImageFeature} />
      <Route path={"/feature/music"} component={MusicFeature} />
      <Route path={"/feature/voice"} component={VoiceFeature} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/admin/users"} component={UserManagement} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/feature/app-builder"} component={AppBuilderFeature} />
      <Route path={"/feature/video"} component={VideoFeature} />
      <Route path={"/feature/character"} component={CharacterFeature} />
      <Route path={"/feature/agents"} component={AgentsFeature} />
      <Route path={"/feature/workflows"} component={WorkflowsFeature} />
      <Route path={"/feature/monetize"} component={MonetizeFeature} />
      <Route path={"/p/:id"} component={ProductPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
