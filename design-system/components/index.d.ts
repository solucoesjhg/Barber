// BarberOS — tipos dos componentes em window.BarberOS (documentação).
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes, MouseEventHandler } from 'react';

export type IconName = 'plus' | 'x' | 'calendar' | 'users' | 'trendingUp' | 'trendingDown' | 'dollar' | 'wallet' | 'dashboard' | 'scissors' | 'package' | 'truck' | 'cart' | 'folder' | 'arrows' | 'settings' | 'chevronDown' | 'chevronRight' | 'logOut' | 'bell' | 'search' | 'panelOpen' | 'panelClose';

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; style?: React.CSSProperties }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary (padrão), secondary, ghost ou icon (só ícone). */
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  /** sm: 34px de altura, 13px. */
  size?: 'md' | 'sm';
  /** Largura total. */
  full?: boolean;
  /** Ícone antes do rótulo (no variant icon, o único conteúdo). */
  icon?: IconName;
  children?: ReactNode;
}

export interface FieldOption { value: string; label: string }
export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** input (padrão), select ou textarea. */
  as?: 'input' | 'select' | 'textarea';
  /** Opções quando as = 'select'. */
  options?: FieldOption[];
  /** Mensagem de erro abaixo do campo. */
  error?: string;
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** default (.card), sm (.card-sm) ou glow (clicável, brilho que segue o mouse). */
  variant?: 'default' | 'sm' | 'glow';
  children?: ReactNode;
}

export interface BadgeProps { status?: 'pending' | 'confirmed' | 'done' | 'canceled'; children: ReactNode; className?: string }

export interface DividerProps { className?: string; style?: React.CSSProperties }

export interface TableColumn<Row = any> {
  key: string;
  label?: string;
  /** Largura da coluna no grid, ex. '160px'. Padrão '1fr'. */
  width?: string;
  align?: 'left' | 'right';
  render?: (row: Row) => ReactNode;
}
export interface TableProps<Row = any> {
  columns: TableColumn<Row>[];
  rows: Row[];
  loading?: boolean;
  /** Texto quando não há linhas. Padrão 'Nenhum registro encontrado.' */
  emptyText?: string;
  className?: string;
}

export interface StatCardProps {
  icon?: IconName;
  value: ReactNode;
  label: string;
  sub?: string;
  /** sm: valor 18px, ícone solto (cards financeiros do mês). */
  size?: 'lg' | 'sm';
  /** Com onClick vira glow-card. */
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export interface StatGridProps { columns?: number; className?: string; children: ReactNode }

export interface PageHeaderProps { title: string; subtitle?: ReactNode; eyebrow?: string; action?: ReactNode }

export interface ModalProps {
  open?: boolean;
  title: string;
  onClose?: () => void;
  /** Mostra o rodapé Cancelar/Salvar e liga o atalho F10. */
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  error?: string;
  /** Rodapé próprio; null remove o rodapé. */
  footer?: ReactNode;
  /** Largura máxima em px. Padrão 380. */
  maxWidth?: number;
  /** Renderiza dentro do fluxo em vez de fixo na tela (prévias). */
  inline?: boolean;
  children?: ReactNode;
}

export interface NavItemDef { to: string; icon: IconName; label: string }
export interface NavGroupDef { label: string; icon: IconName; items: NavItemDef[]; open?: boolean }
export interface SidebarProps {
  items?: NavItemDef[];
  groups?: NavGroupDef[];
  footerItems?: NavItemDef[];
  /** Rota ativa. */
  active?: string;
  user?: { name: string; role?: string };
  logoSrc?: string;
  brand?: string;
  chip?: string;
  hidden?: boolean;
  onNavigate?: (item: NavItemDef) => void;
  onSignOut?: () => void;
}

export interface AppHeaderProps {
  pageName?: string;
  brand?: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
  hasNotifications?: boolean;
}

export interface AppLayoutProps {
  sidebar: SidebarProps;
  header?: AppHeaderProps;
  /** Padrão: aberta no desktop, fechada abaixo de 768px. */
  defaultSidebarOpen?: boolean;
  children: ReactNode;
}

export declare function Button(p: ButtonProps): JSX.Element;
export declare function Field(p: FieldProps): JSX.Element;
export declare function Card(p: CardProps): JSX.Element;
export declare function Badge(p: BadgeProps): JSX.Element;
export declare function Divider(p: DividerProps): JSX.Element;
export declare function Table<Row = any>(p: TableProps<Row>): JSX.Element;
export declare function StatCard(p: StatCardProps): JSX.Element;
export declare function StatGrid(p: StatGridProps): JSX.Element;
export declare function PageHeader(p: PageHeaderProps): JSX.Element;
export declare function Modal(p: ModalProps): JSX.Element | null;
export declare function Sidebar(p: SidebarProps): JSX.Element;
export declare function AppHeader(p: AppHeaderProps): JSX.Element;
export declare function AppLayout(p: AppLayoutProps): JSX.Element;
export declare function Icon(p: IconProps): JSX.Element;
