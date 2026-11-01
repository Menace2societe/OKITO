"use client"

import * as React from "react"
import * as SliderPrimitives from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const DualRangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitives.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitives.Track className="relative h-14 w-full grow border border-filet bg-papier">
      <SliderPrimitives.Range className="absolute -top-px -bottom-px border-2 border-tampon bg-tampon/10" />
    </SliderPrimitives.Track>
    <SliderPrimitives.Thumb aria-label="Début de la sélection" className="relative block h-14 w-12 cursor-ew-resize before:absolute before:inset-y-2 before:left-1/2 before:w-1.5 before:-translate-x-1/2 before:bg-tampon focus-visible:outline-none focus-visible:before:inset-y-0 focus-visible:before:w-2.5 disabled:pointer-events-none disabled:opacity-50" />
    <SliderPrimitives.Thumb aria-label="Fin de la sélection" className="relative block h-14 w-12 cursor-ew-resize before:absolute before:inset-y-2 before:left-1/2 before:w-1.5 before:-translate-x-1/2 before:bg-tampon focus-visible:outline-none focus-visible:before:inset-y-0 focus-visible:before:w-2.5 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitives.Root>
))
DualRangeSlider.displayName = SliderPrimitives.Root.displayName

export { DualRangeSlider }
