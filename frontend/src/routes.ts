// One definition of the navigable pages. The sidebar, the router and the page heading all
// read this, so adding a page is a single edit rather than three that can disagree.
import {
  CalendarDays,
  FileJson2,
  FlaskConical,
  LayoutDashboard,
  Stethoscope,
  Users
} from 'lucide-react';
import type { ComponentType } from 'react';

export type RouteDefinition = {
  /** URL path, relative to the application root. */
  path: string;
  /** Label shown in the sidebar and as the page heading. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Pages that manage their own layout and suppress the shared search field. */
  standalone?: boolean;
};

export const ROUTES: RouteDefinition[] = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/schedule', label: 'Schedule', icon: CalendarDays },
  { path: '/cases', label: 'Cases', icon: Stethoscope },
  { path: '/intake', label: 'Clinical Intake', icon: FileJson2, standalone: true },
  { path: '/resources', label: 'Resources', icon: Users },
  { path: '/evaluation', label: 'Evaluation', icon: FlaskConical }
];

export function routeFor(pathname: string) {
  return ROUTES.find((route) => route.path === pathname) ?? ROUTES[0];
}
