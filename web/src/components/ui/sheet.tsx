import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  children: ReactNode;
};

/** Accessible modal drawer built on the native dialog element; intended for secondary controls on narrow screens. */
export function Sheet({ open, onOpenChange, title, description, side = "right", children }: SheetProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className={`fixed inset-y-0 m-0 h-dvh max-h-dvh w-[min(92vw,24rem)] rounded-none border-y-0 ${side === "left" ? "left-0 right-auto border-l-0" : "right-0 left-auto border-r-0"}`}
    >
      {children}
    </Dialog>
  );
}
