import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle,
  Circle,
  Clock,
  Compass,
  Footprints,
  Lightbulb,
  MessageCircleQuestion,
  Scale,
  ShieldCheck,
  Target,
  Telescope,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReportIcon } from "@/lib/reports/types";

const MAP: Record<ReportIcon, LucideIcon> = {
  "zap": Zap,
  "target": Target,
  "trending-up": TrendingUp,
  "compass": Compass,
  "brain": Brain,
  "clock": Clock,
  "scale": Scale,
  "lightbulb": Lightbulb,
  "shield-check": ShieldCheck,
  "alert-triangle": AlertTriangle,
  "footprints": Footprints,
  "telescope": Telescope,
  "check-circle": CheckCircle,
  "book-open": BookOpen,
  "message-circle-question": MessageCircleQuestion,
};

export function ReportIconView({
  name,
  className,
}: {
  name: ReportIcon;
  className?: string;
}) {
  const Component = MAP[name] ?? Circle;
  return <Component className={className} />;
}
