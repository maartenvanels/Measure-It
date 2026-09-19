'use client';

import { type LucideIcon, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { DrawMode, isAreaMode } from '@/types/measurement';

export interface ToolOption {
  mode: DrawMode;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

interface ToolGroupButtonProps {
  tools: ToolOption[];
  activeMode: DrawMode;
  lastUsedMode: DrawMode;
  onSelect: (mode: DrawMode) => void;
  disabled?: boolean;
  activeClassName: string;
  tooltip: string;
  /** Predicate to decide whether `activeMode` indicates this group is active. Defaults to area-mode check. */
  isActivePredicate?: (mode: DrawMode) => boolean;
  /** Tooltip for the chevron dropdown trigger. */
  dropdownTooltip?: string;
}

export function ToolGroupButton({
  tools,
  activeMode,
  lastUsedMode,
  onSelect,
  disabled,
  activeClassName,
  tooltip,
  isActivePredicate,
  dropdownTooltip = 'Area tools',
}: ToolGroupButtonProps) {
  const isActive = (isActivePredicate ?? isAreaMode)(activeMode);
  const current = tools.find((t) => t.mode === lastUsedMode) ?? tools[0];
  const Icon = current.icon;

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelect(isActive ? 'none' : current.mode)}
            disabled={disabled}
            className={`rounded-r-none ${isActive ? activeClassName : ''}`}
          >
            <Icon className="mr-1.5 h-4 w-4" />
            {current.label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                disabled={disabled}
                className={`rounded-l-none border-l-0 px-1.5 ${isActive ? activeClassName : ''}`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{dropdownTooltip}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          {tools.map((tool) => {
            const ToolIcon = tool.icon;
            const isCurrent = tool.mode === activeMode;
            return (
              <DropdownMenuItem
                key={tool.mode}
                onClick={() => onSelect(tool.mode)}
                className={isCurrent ? 'bg-accent' : ''}
              >
                <ToolIcon className="mr-2 h-4 w-4" />
                {tool.label}
                {tool.shortcut && (
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">{tool.shortcut}</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
