import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 focus-visible:outline-blue-300",
        secondary: "bg-slate-800 text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700 focus-visible:outline-slate-300",
        ghost: "text-slate-300 hover:bg-slate-800/80 hover:text-white focus-visible:outline-slate-300"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
