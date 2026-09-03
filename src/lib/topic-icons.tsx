import {
  Variable,
  Triangle,
  BarChart3,
  Sigma,
  Calculator,
  Compass,
  PieChart,
  TrendingUp,
  BookOpen,
  Layers,
  PenTool,
  CheckSquare,
  Dna,
  FlaskConical,
  Atom,
  Globe,
  Landmark,
  Scroll,
  Map,
  Scale,
  type LucideIcon,
} from "lucide-react";

const slugToIcon: Record<string, LucideIcon> = {
  // Math
  algebra: Variable,
  geometry: Triangle,
  statistics: BarChart3,
  "advanced-math": Sigma,
  "problem-solving": Calculator,
  trigonometry: Compass,
  "data-analysis": PieChart,
  "linear-equations": TrendingUp,
  // Reading & Writing
  "information-and-ideas": BookOpen,
  "craft-and-structure": Layers,
  "expression-of-ideas": PenTool,
  "standard-english-conventions": CheckSquare,
  // Science
  biology: Dna,
  chemistry: FlaskConical,
  physics: Atom,
  "earth-and-space-science": Globe,
  // Social Studies
  "united-states-history": Landmark,
  "world-history": Scroll,
  geography: Map,
  "civics-and-economics": Scale,
};

const fallbackIcon = Calculator;

export function getTopicIcon(slug: string): LucideIcon {
  return slugToIcon[slug] ?? fallbackIcon;
}
