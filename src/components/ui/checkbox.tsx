"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Reduce outer border to 0.5px
      "peer h-7 w-7 shrink-0 border-[0.5px] border-neutral-900/30 bg-white flex items-center justify-center ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none",
      className
    )}
    {...props}
  >
    {/* Black fill as inner box when checked, with thinner white border separator, zero radius */}
    <CheckboxPrimitive.Indicator
      className={cn(
        "h-5 w-5 bg-black border-2 border-white rounded-none"
      )}
    />
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
