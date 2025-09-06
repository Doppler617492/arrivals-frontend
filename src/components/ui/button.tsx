import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

// local fallback for joining class names safely
const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

/**
 * Button component that does NOT rely on theme CSS variables.
 * Uses solid Tailwind colors so it looks correct even if tokens are missing.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 shrink-0",
    "whitespace-nowrap rounded-lg text-sm font-medium",
    "transition-colors disabled:pointer-events-none disabled:opacity-50",
    // icon sizing
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
    // focus
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500",
    // invalid state
    "aria-invalid:ring-2 aria-invalid:ring-red-400 aria-invalid:ring-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        /**
         * NOTE:
         * We avoid `bg-primary` and similar token classes because your theme
         * variables might not be wired yet. These variants use concrete colors.
         */
        default: "bg-indigo-600 text-white hover:bg-indigo-500",
        destructive:
          "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500",
        outline:
          "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200",
        ghost:
          "bg-transparent hover:bg-slate-100 text-slate-900",
        link: "text-indigo-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 has-[>svg]:px-4",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
