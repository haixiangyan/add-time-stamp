'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;
const DrawerTitle = DrawerPrimitive.Title;
const DrawerDescription = DrawerPrimitive.Description;

type DrawerContentProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Popup>,
  'title'
> & {
  title?: React.ReactNode;
  /** Which edge the drawer slides in from. Defaults to `bottom`. */
  side?: 'bottom' | 'left';
};

const POPUP_SIDE_CLASSES: Record<NonNullable<DrawerContentProps['side']>, string> = {
  bottom:
    'absolute inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl translate-y-[var(--drawer-swipe-movement-y,0px)] data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
  left: 'absolute inset-y-0 left-0 h-full w-[85vw] max-w-sm rounded-r-2xl translate-x-[var(--drawer-swipe-movement-x,0px)] data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
};

function DrawerContent({
  title,
  side = 'bottom',
  className,
  children,
  ...props
}: DrawerContentProps) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50">
        <DrawerPrimitive.Popup
          className={cn(
            'flex flex-col border bg-background shadow-xl outline-none',
            'transition-transform duration-300 ease-out data-[swiping]:duration-0',
            POPUP_SIDE_CLASSES[side],
            className,
          )}
          {...props}
        >
          {side === 'bottom' && (
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
          )}
          {title && (
            <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4">
              <DrawerTitle className="text-base font-semibold">{title}</DrawerTitle>
              <DrawerClose className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </DrawerClose>
            </div>
          )}
          <DrawerPrimitive.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent, DrawerTitle, DrawerDescription };
