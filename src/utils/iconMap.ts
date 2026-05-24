// Icon mapping utility
import React from 'react';
import * as Icons from 'lucide-react';

// 图标名称到组件的映射
export const ICON_MAP: Record<string, React.FC<any>> = {
  MessageSquare: Icons.MessageSquare,
  Settings: Icons.Settings,
  Github: Icons.Github,
  Bug: Icons.Bug,
  CheckCircle: Icons.CheckCircle,
  AlertTriangle: Icons.AlertTriangle,
  X: Icons.X,
  Bot: Icons.Bot,
  User: Icons.User,
  ArrowLeft: Icons.ArrowLeft,
  Plus: Icons.Plus,
  Trash: Icons.Trash,
  Edit: Icons.Edit,
  Send: Icons.Send,
  Loader: Icons.Loader,
  Shield: Icons.Shield,
  ShieldOff: Icons.ShieldOff,
  HelpCircle: Icons.HelpCircle,
};

export function getIcon(iconName: string): React.FC<any> {
  return ICON_MAP[iconName] || Icons.HelpCircle;
}
