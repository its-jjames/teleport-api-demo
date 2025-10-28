"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
        ref={ref}
        data-slot="switch"
        className={cn(
            // size + shape
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
            // focus ring
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
            // disabled
            "disabled:cursor-not-allowed disabled:opacity-50",
            // states (track)
            "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
            className
        )}
        {...props}
    >
      <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
              // knob
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow transition-transform",
              // positions
              "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
          )}
      />
    </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

export { Switch }
