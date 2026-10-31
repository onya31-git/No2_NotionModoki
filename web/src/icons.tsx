import type { ReactNode } from "react";

function Icon({ children, size = 16, fill = "none" }: { children: ReactNode; size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const PageIcon = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon size={18}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <span className={`chevron${open ? " open" : ""}`}>
    <Icon size={14}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  </span>
);

export const ChevronsLeftIcon = () => (
  <Icon>
    <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
);

export const StarIcon = ({ filled }: { filled: boolean }) => (
  <Icon size={17} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Icon>
);

export const MoreIcon = () => (
  <Icon size={18}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
  </Icon>
);

export const RestoreIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

export const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const WidthIcon = () => (
  <Icon>
    <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
  </Icon>
);

export const SmileIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </Icon>
);

export const ImageIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);

export const TableIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 10v10" />
  </Icon>
);

export const BoardIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 4v16" />
  </Icon>
);

export const MoveIcon = () => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const OpenIcon = () => (
  <Icon>
    <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const SortIcon = () => (
  <Icon>
    <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
  </Icon>
);

export const TextTypeIcon = () => (
  <Icon>
    <path d="M4 7V5h16v2M12 5v14M9 19h6" />
  </Icon>
);

export const NumberTypeIcon = () => (
  <Icon>
    <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
  </Icon>
);

export const SelectTypeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 11 4 4 4-4" />
  </Icon>
);

export const MultiSelectTypeIcon = () => (
  <Icon>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
);

export const DateTypeIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const CheckboxTypeIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m8 12 3 3 5-6" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);

export const ColumnsIcon = ({ count = 2 }: { count?: number }) => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    {Array.from({ length: count - 1 }, (_, i) => {
      const x = 3 + (18 / count) * (i + 1);
      return <path key={i} d={`M${x} 4v16`} />;
    })}
  </Icon>
);

export const PaletteIcon = () => (
  <Icon>
    <path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7.5" r="1" />
    <circle cx="14.5" cy="7.5" r="1" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);

export const TextSizeIcon = () => (
  <Icon>
    <path d="M3 7V5h11v2M8.5 5v14M6 19h5M14 12v-1h7v1M17.5 11v8M16 19h3" />
  </Icon>
);

export const GripIcon = () => (
  <Icon size={14} fill="currentColor">
    <g stroke="none">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </g>
  </Icon>
);

export const EyeIcon = () => (
  <Icon>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
