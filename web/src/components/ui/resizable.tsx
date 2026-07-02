'use client';

import { GripVertical, GripHorizontal } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { cn } from '@/lib/utils';

type Direction = 'horizontal' | 'vertical';

function ResizablePanelGroup({
  direction,
  className,
  ...props
}: React.ComponentProps<typeof Group> & { direction?: Direction }) {
  return (
    <Group
      orientation={direction}
      className={cn('h-full w-full', className)}
      {...props}
    />
  );
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel className={cn('min-h-0 min-w-0', className)} {...props} />;
}

function ResizableHandle({
  direction = 'horizontal',
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  direction?: Direction;
  withHandle?: boolean;
}) {
  const vertical = direction === 'vertical';
  return (
    <Separator
      className={cn(
        'group relative flex shrink-0 items-center justify-center self-stretch bg-transparent transition-colors hover:bg-primary/40 focus-visible:outline-none',
        vertical ? 'h-1.5 w-full' : 'w-1.5 h-full',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            'z-10 flex items-center justify-center rounded-sm border bg-border opacity-0 transition-opacity group-hover:opacity-100',
            vertical ? 'h-3 w-6' : 'h-6 w-3',
          )}
        >
          {vertical ? (
            <GripHorizontal className="size-2.5" />
          ) : (
            <GripVertical className="size-2.5" />
          )}
        </div>
      )}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
