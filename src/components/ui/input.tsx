import * as React from "react";

// local fallback: join class names safely (avoids dependency on '@/lib/utils')
const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

/**
 * Input
 * - forwardRef for compatibility with form libs
 * - sensible default type="text"
 * - lean Tailwind styles that don't depend on shadcn theme tokens,
 *   but still look good in light/dark mode.
 */
const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        // base
        "flex h-10 w-full min-w-0 rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-[box-shadow,border-color] outline-none",
        // light/dark
        "border-slate-300 placeholder:text-slate-400",
        "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:placeholder:text-slate-500",
        // states
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-300",
        // file input tweaks
        "file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700",
        "dark:file:bg-slate-800 dark:file:text-slate-200",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
