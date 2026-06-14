import { createElement } from "react";
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  Code,
  Coffee,
  Compass,
  Flame,
  Globe,
  GraduationCap,
  Handshake,
  Heart,
  Leaf,
  Lightbulb,
  type LucideIcon,
  MapPin,
  Rocket,
  Shield,
  Smile,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

/**
 * Single source of truth for career-page chip/stat icons. The builder picker,
 * the templates, and validation all reference this map so an icon name is
 * either renderable everywhere or nowhere — no silent runtime `undefined`.
 */
export const CAREER_ICONS = {
  users: Users,
  heart: Heart,
  flame: Flame,
  smile: Smile,
  sparkles: Sparkles,
  calendar: Calendar,
  "map-pin": MapPin,
  briefcase: Briefcase,
  rocket: Rocket,
  target: Target,
  globe: Globe,
  zap: Zap,
  award: Award,
  trophy: Trophy,
  star: Star,
  coffee: Coffee,
  code: Code,
  lightbulb: Lightbulb,
  leaf: Leaf,
  shield: Shield,
  handshake: Handshake,
  compass: Compass,
  building: Building2,
  growth: TrendingUp,
  education: GraduationCap,
} satisfies Record<string, LucideIcon>;

export type CareerIconName = keyof typeof CAREER_ICONS;

/** Ordered names for the picker (kept stable for predictable UX). */
export const CAREER_ICON_NAMES = Object.keys(CAREER_ICONS) as CareerIconName[];

/** Safe lookup — returns the component or null for unknown/empty names. */
export function careerIcon(name: string | undefined | null): LucideIcon | null {
  if (!name) return null;
  return (CAREER_ICONS as Record<string, LucideIcon>)[name] ?? null;
}

/**
 * Stable component that renders a career icon by name (or nothing). Lets callers
 * render config-driven icons without deriving a component inside their own
 * render, which the React Compiler lint forbids.
 */
export function CareerIcon({
  name,
  className,
  strokeWidth = 1.8,
  style,
}: {
  name: string | undefined | null;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const Icon = careerIcon(name);
  if (!Icon) return null;
  // createElement (not <Icon/>) so the lint rule doesn't read this as deriving a
  // component during render — Icon is a stable registry reference.
  return createElement(Icon, { className, strokeWidth, style });
}
