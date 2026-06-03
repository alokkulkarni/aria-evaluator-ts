import React from 'react';
import {
  AudioLines,
  ArrowUpRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  CircleGauge,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  FlaskConical,
  Globe,
  Landmark,
  Layers3,
  LayoutDashboard,
  ListChecks,
  MessageSquareCode,
  MessageSquareText,
  Mic,
  PlayCircle,
  PlugZap,
  Route,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  SquareKanban,
  TriangleAlert,
  UserCircle,
  Workflow,
  XCircle,
} from 'lucide-react';
import { FaAws, FaMicrosoft } from 'react-icons/fa6';
import { SiOpenapiinitiative } from 'react-icons/si';

export type AppIconProps = {
  className?: string;
};

export const BrandAwsIcon = FaAws;
export const BrandMicrosoftIcon = FaMicrosoft;
export const BrandOpenApiIcon = SiOpenapiinitiative;

export function AppLogoIcon({ className = 'h-8 w-8' }: AppIconProps) {
  return (
    <div className={`grid place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-slate-900 text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] ${className}`}>
      <Sparkles className="h-[60%] w-[60%]" strokeWidth={2.1} aria-hidden="true" />
    </div>
  );
}

export const NavDashboardIcon = LayoutDashboard;
export const NavScenariosIcon = SquareKanban;
export const NavRunsIcon = PlayCircle;
export const NavReviewQueueIcon = Search;
export const NavAnalysisIcon = BarChart3;
export const NavSchedulesIcon = Clock3;
export const NavTranscriptsIcon = MessageSquareText;
export const NavReportsIcon = FileText;
export const NavSettingsIcon = Settings2;

export const ScenarioConversationalIcon = Bot;
export const ScenarioScriptedIcon = ListChecks;
export const ScenarioAdversarialIcon = ShieldAlert;

export const CategoryBankingIcon = Landmark;
export const CategoryEdgeCasesIcon = FlaskConical;
export const CategoryEscalationIcon = ArrowUpRight;
export const CategoryGeneralIcon = Layers3;

export const ProviderAwsIcon = BrandAwsIcon;
export const ProviderMicrosoftIcon = BrandMicrosoftIcon;
export const ProviderOpenApiIcon = BrandOpenApiIcon;
export const ProviderChatIcon = MessageSquareCode;
export const ProviderVoiceIcon = AudioLines;
export const ProviderWebSocketIcon = PlugZap;
export const ProviderDefaultsIcon = Settings2;
export const ProviderTimingIcon = Clock3;
export const ProviderBotIcon = Bot;
export const ProviderShieldIcon = ShieldAlert;
export const ProviderGlobeIcon = Globe;

export const RunCustomerIcon = UserCircle;
export const RunAgentIcon = Bot;
export const RunMarkerIcon = ClipboardList;
export const RunPassIcon = CheckCircle2;
export const RunFailIcon = XCircle;
export const RunRunningIcon = CircleGauge;
export const RunSecurityIcon = ShieldAlert;
export const RunParallelIcon = Workflow;
export const RunVoiceIcon = Mic;
export const RunChatIcon = MessageSquareText;
export const RunReportIcon = FileText;
export const RunRouteIcon = Route;
export const ChevronDownIcon = ChevronDown;
export const ChevronUpIcon = ChevronUp;
export const ChevronRightIcon = ChevronRight;

export const SecurityIcon = ShieldAlert;
export const MetricsIcon = BarChart3;
export const ReportsIcon = FileText;
export const SearchIcon = Search;
export const ConversationIcon = MessageSquareText;
export const PowerIcon = Sparkles;
export const FileIcon = FileText;
export const GaugeIcon = CircleGauge;
export const BuildingIcon = Building2;
export const LayerIcon = Layers3;
